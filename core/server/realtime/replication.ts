// Replication pipeline: streams pgoutput logical-replication changes from the
// slot `trex_realtime`, decodes each transaction into wal2json-shaped changes,
// and hands the batch to `onTransaction`. Task 9 fans these out to channels.
//
// Lifecycle: start() drops+recreates the slot and opens the stream; stop() halts
// the stream and drops the slot (idempotent). Stream drops trigger reconnect with
// 1s→30s exponential backoff + jitter; healthy data resets the backoff.
//
// The pool is loaded lazily (Task 7 pattern): db.ts throws at import when
// DATABASE_URL is unset, so we never top-level import it — that keeps wal-shape's
// pure unit tests importable without a database.

import type { Pool } from "pg";
import { LogicalReplicationService, PgoutputPlugin } from "pg-logical-replication";
import { poolSsl } from "../lib/db-ssl.ts";
import { commitTimeToIso, shapeChange, shapeTruncates, type Wal2JsonChange } from "./wal-shape.ts";

const SLOT = "trex_realtime";
const PUBLICATIONS = ["supabase_realtime", "trex_realtime_messages"];
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

let poolPromise: Promise<Pool> | null = null;
function getPool(): Promise<Pool> {
  if (!poolPromise) poolPromise = import("../db.ts").then((m) => m.pool);
  return poolPromise;
}

export class ReplicationPipeline {
  onTransaction: (changes: Wal2JsonChange[], commitTime: string) => Promise<void> = async () => {};

  private service: LogicalReplicationService | null = null;
  private stopped = false;
  private backoffMs = BACKOFF_MIN_MS;
  private reconnectTimer: number | undefined;

  // Accumulated changes for the in-flight transaction (flushed at commit).
  private txn: Wal2JsonChange[] = [];

  // Serializes message processing. The service emits `data` events without
  // awaiting our (async) handler, so begin→insert→commit can otherwise interleave:
  // if the insert handler awaits ensureTypeNames() (a DB round-trip), the commit
  // handler runs first and flushes an EMPTY txn. We chain every message onto this
  // promise so they process strictly in WAL order. Returning the tail to the
  // service (with flowControl enabled) also gives backpressure — the stream pauses
  // until we've drained, protecting the single V8 isolate.
  private processing: Promise<void> = Promise.resolve();

  // Lazily-loaded oid→typename fallback, only populated if the pgoutput parser
  // ever leaves a column's typeName null (protoVersion-1 edge). When typeName is
  // populated (the common case) this map is never loaded — no DB round-trip.
  // NOTE: the map is loaded ONCE and never refreshed (the plan's unknown-oid-reload
  // was dropped), so a custom type created AFTER the first lazy load resolves to
  // "text" until the pipeline restarts. Acceptable — built-in types are stable.
  private typeNames: Map<number, string> | null = null;
  private typeNamesLoading: Promise<void> | null = null;

  async start(): Promise<void> {
    this.stopped = false;
    this.backoffMs = BACKOFF_MIN_MS;
    const pool = await getPool();
    // Drop a stale slot (e.g. from an unclean shutdown) then recreate fresh so we
    // stream from the current WAL position rather than replaying old backlog.
    await pool.query(
      `SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1`,
      [SLOT],
    );
    await pool.query(`SELECT pg_create_logical_replication_slot($1, 'pgoutput')`, [SLOT]);
    this.connect();
  }

  private connect(): void {
    if (this.stopped) return;
    const url = Deno.env.get("DATABASE_URL");
    if (!url) throw new Error("DATABASE_URL environment variable is required");

    this.service = new LogicalReplicationService(
      { connectionString: url, ...poolSsl(url) },
      { acknowledge: { auto: true, timeoutSeconds: 10 }, flowControl: { enabled: true } },
    );
    const plugin = new PgoutputPlugin({ protoVersion: 1, publicationNames: PUBLICATIONS });

    // Chain each message so handlers run strictly in order; return the tail so the
    // (flowControl-enabled) service pauses the stream until we've caught up.
    this.service.on("data", (_lsn: string, log: unknown) => {
      this.processing = this.processing.then(() => this.onLog(log)).catch((e) =>
        console.error("[realtime] message processing failed:", e)
      );
      return this.processing;
    });
    this.service.on("error", (e: Error) => console.error("[realtime] replication error:", e.message));

    // subscribe() resolves/rejects when the stream ends; either way we reconnect
    // (unless intentionally stopped) with exponential backoff + jitter.
    this.service
      .subscribe(plugin, SLOT)
      .catch((e: Error) => console.error("[realtime] replication subscribe failed:", e.message))
      .finally(() => {
        if (this.stopped) return;
        const delay = this.backoffMs + Math.floor(Math.random() * 500);
        this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
        console.warn(`[realtime] replication stream ended; reconnecting in ${delay}ms`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
      });
  }

  // Resolve a column's Postgres type name: prefer the parser-populated typeName;
  // fall back to the lazily-loaded oid→name map only when typeName is null.
  private resolveType = (col: { typeOid: number; typeName: string | null }): string => {
    if (col.typeName) return col.typeName;
    return this.typeNames?.get(col.typeOid) ?? "text";
  };

  private async ensureTypeNames(): Promise<void> {
    if (this.typeNames) return;
    if (!this.typeNamesLoading) {
      this.typeNamesLoading = (async () => {
        const pool = await getPool();
        const r = await pool.query("SELECT oid, typname FROM pg_type");
        this.typeNames = new Map(r.rows.map((row: { oid: number; typname: string }) => [Number(row.oid), row.typname]));
      })();
    }
    await this.typeNamesLoading;
  }

  private async onLog(log: unknown): Promise<void> {
    // deno-lint-ignore no-explicit-any
    const msg = log as any;
    this.backoffMs = BACKOFF_MIN_MS; // healthy traffic resets backoff
    switch (msg.tag) {
      case "begin":
        this.txn = [];
        break;
      case "insert":
      case "update":
      case "delete": {
        // If the parser left any typeName null, load the oid→name fallback once.
        if (msg.relation?.columns?.some((c: { typeName: string | null }) => !c.typeName)) {
          await this.ensureTypeNames();
        }
        const c = shapeChange(msg, this.resolveType);
        if (c) this.txn.push(c);
        break;
      }
      case "truncate":
        this.txn.push(...shapeTruncates(msg));
        break;
      case "commit": {
        const changes = this.txn;
        this.txn = [];
        if (changes.length > 0) {
          const commitTime = typeof msg.commitTime === "bigint"
            ? commitTimeToIso(msg.commitTime)
            : new Date().toISOString();
          try {
            await this.onTransaction(changes, commitTime);
          } catch (e) {
            console.error("[realtime] fan-out failed:", e);
          }
        }
        // Yield to the event loop between transaction batches so a burst of WAL
        // doesn't starve the single V8 isolate.
        await Promise.resolve();
        break;
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    try {
      await this.service?.stop();
    } catch (_e) {
      // already stopped / never connected — ignore
    }
    this.service = null;
    try {
      const pool = await getPool();
      await pool.query(
        `SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = $1`,
        [SLOT],
      );
    } catch (_e) {
      // slot already gone — stop() is idempotent
    }
  }
}
