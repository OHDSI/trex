import type { Pool } from "pg";
import {
  type Channel,
  onJoinHooks,
  onLeaveHooks,
  type PgChangesBinding,
} from "./channel.ts";

type Entry = { channel: Channel; binding: PgChangesBinding };

// "schema.table" -> subscription uuid -> entry. Wildcard bindings (table === "*")
// are stored under "schema.*" so hasSubscribers() can match any table in that schema.
export const subscriptionIndex = new Map<string, Map<string, Entry>>();
const byUuid = new Map<string, Entry>();

function keyOf(schema: string, table: string): string {
  return `${schema}.${table}`;
}

export function hasSubscribers(schema: string, table: string): boolean {
  return (subscriptionIndex.get(keyOf(schema, table))?.size ?? 0) > 0 ||
    (subscriptionIndex.get(keyOf(schema, "*"))?.size ?? 0) > 0;
}

export function lookupSubscription(uuid: string): Entry | undefined {
  return byUuid.get(uuid);
}

// db.ts throws at import time if DATABASE_URL is unset (it constructs the shared
// Pool eagerly). Loading it lazily — only when a function here actually needs the
// pool — lets subscriptions.test.ts skip gracefully when DATABASE_URL is unset
// instead of crashing at module-load time before the skip-guard ever runs.
let poolPromise: Promise<Pool> | null = null;
function getPool(): Promise<Pool> {
  if (!poolPromise) poolPromise = import("../db.ts").then((m) => m.pool);
  return poolPromise;
}

function quoteIdent(s: string): string {
  return `"${s.replaceAll('"', '""')}"`;
}

// realtime.user_defined_filter is the composite (column_name text, op equality_op,
// value text, negate boolean). Record literal syntax quotes each text field and
// leaves negate empty (null): ("col",eq,"val",) — verified against the live
// walrus schema; a 3-field literal is rejected ("Too few columns").
function filterLiteral(binding: PgChangesBinding): string[] {
  if (!binding.filter) return [];
  const m = binding.filter.match(/^([^=]+)=([^.]+)\.(.*)$/);
  if (!m) throw new Error(`invalid filter: ${binding.filter}`);
  const [, column, op, value] = m;
  const esc = (s: string) => s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return [`("${esc(column)}",${op},"${esc(value)}",)`];
}

export async function _insertSubscriptions(ch: Channel): Promise<void> {
  // Concrete-table bindings only. Schema-wide postgres_changes (table "*") isn't
  // supported: realtime.subscription.entity is regclass — a concrete table — so
  // `public."*"::regclass` would error. Skip them (no row, no index entry) and
  // warn; the join still succeeds for the real-table bindings.
  const insertable = ch.bindings.filter((b) => {
    if (b.table === "*") {
      console.warn(
        `[realtime] schema-wide postgres_changes subscriptions are not yet supported; ignoring binding for "${b.schema}".*`,
      );
      return false;
    }
    return true;
  });
  if (insertable.length === 0) return;
  const pool = await getPool();

  // Atomic per-channel insert. All rows go in one transaction, and the in-memory
  // index is only mutated after COMMIT succeeds. If any binding is rejected (bad
  // filter, tr_check_filters, etc.) the transaction is rolled back and no rows or
  // index/byUuid entries survive — _handleJoin discards the channel without
  // calling _deleteSubscriptions, so partial state here would orphan rows.
  const client = await pool.connect();
  const staged: Array<{ uuid: string; binding: PgChangesBinding }> = [];
  try {
    await client.query("BEGIN");
    for (const binding of insertable) {
      const uuid = crypto.randomUUID();
      const entity = `${quoteIdent(binding.schema)}.${
        quoteIdent(binding.table)
      }`;
      await client.query(
        `INSERT INTO realtime.subscription (subscription_id, entity, filters, claims)
         VALUES ($1, $2::regclass, $3::realtime.user_defined_filter[], $4)`,
        [
          uuid,
          entity,
          filterLiteral(binding),
          JSON.stringify(ch.socket.claims),
        ],
      );
      staged.push({ uuid, binding });
    }
    await client.query("COMMIT");
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection may be broken; DELETE-less ROLLBACK is best-effort */
    }
    throw e;
  } finally {
    client.release();
  }

  // Commit succeeded: publish the staged rows into the in-memory index.
  for (const { uuid, binding } of staged) {
    ch.subscriptionIds.push(uuid);
    const entry: Entry = { channel: ch, binding };
    const k = keyOf(binding.schema, binding.table);
    let m = subscriptionIndex.get(k);
    if (!m) subscriptionIndex.set(k, m = new Map());
    m.set(uuid, entry);
    byUuid.set(uuid, entry);
  }
}

export async function _deleteSubscriptions(ch: Channel): Promise<void> {
  if (ch.subscriptionIds.length === 0) return;
  const pool = await getPool();
  await pool.query(
    "DELETE FROM realtime.subscription WHERE subscription_id = ANY($1::uuid[])",
    [
      ch.subscriptionIds,
    ],
  );
  for (const uuid of ch.subscriptionIds) {
    const entry = byUuid.get(uuid);
    byUuid.delete(uuid);
    if (entry) {
      subscriptionIndex.get(keyOf(entry.binding.schema, entry.binding.table))
        ?.delete(uuid);
    }
  }
  ch.subscriptionIds = [];
}

/** Startup janitor: deletes every realtime.subscription row and clears the index. */
export async function clearAllSubscriptions(): Promise<void> {
  const pool = await getPool();
  await pool.query("DELETE FROM realtime.subscription");
  subscriptionIndex.clear();
  byUuid.clear();
}

onJoinHooks.push(async (ch) => {
  if (ch.bindings.length > 0) await _insertSubscriptions(ch);
});
onLeaveHooks.push(async (ch) => {
  await _deleteSubscriptions(ch);
});
