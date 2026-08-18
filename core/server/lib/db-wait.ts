import { escapeSql } from "./sql.ts";

/** Minimal TrexDB-connection shape needed to probe the catalog. */
export interface CatalogConn {
  execute: (sql: string, params: unknown[]) => Promise<any>;
}

export interface WaitOptions {
  timeoutMs?: number;
  /** Injectable clock/sleep — for deterministic tests. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Poll DuckDB's catalog until `db` is attached, with exponential backoff up to
 * `timeoutMs`. Returns true once present, false on timeout (never throws —
 * transient engine errors are swallowed and retried).
 *
 * Exists because core/server is spawned by the trexas extension *before* the
 * host attaches the _config (Postgres) catalog and runs core migrations
 * (src/main.rs loads extensions, then ATTACHes _config). Anything that targets an
 * attached catalog at boot can otherwise race that ATTACH and fail with
 * `Catalog "<db>" does not exist`.
 */
export async function waitForAttachedDatabase(
  conn: CatalogConn,
  db: string,
  opts: WaitOptions = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const deadline = now() + timeoutMs;
  let delay = 100;
  while (true) {
    try {
      const result = await conn.execute(
        `SELECT 1 FROM duckdb_databases() WHERE database_name = '${escapeSql(db)}'`,
        [],
      );
      const rows = result?.rows || result || [];
      if (rows.length > 0) return true;
    } catch {
      // Engine not ready yet — keep polling until the deadline.
    }
    if (now() >= deadline) return false;
    await sleep(delay);
    delay = Math.min(delay * 2, 1000);
  }
}

/**
 * Poll the core migration history table until `expected` core migrations have
 * been applied, with exponential backoff up to `timeoutMs`. Returns true once
 * the row count reaches `expected`, false on timeout (never throws — a missing
 * table or transient engine error is treated as "not ready yet" and retried).
 *
 * Exists because src/main.rs runs the core `trexdb` migration
 * (trex_migration_run_schema against _config) concurrently with core/server's
 * own Plugins.applyMigrations(). Both run DDL against the same attached
 * Postgres catalog, and Postgres can deadlock the two transactions on
 * pg_class. waitForAttachedDatabase only proves _config is ATTACHed, not that
 * the core migration finished — this closes that gap by waiting for
 * refinery_schema_history to actually contain `expected` rows.
 *
 * The history table is created before any migration runs, so its mere
 * existence proves nothing; only the row count does. src/main.rs also skips
 * the core migration entirely on nodes that are not data nodes ("Skipping
 * schema migrations (this node is not a data node)") — if the table is still
 * absent after `graceMs`, core migrations are assumed not to be running here
 * and this returns true immediately rather than waiting out the full timeout.
 */
export async function waitForCoreMigrations(
  conn: CatalogConn,
  db: string,
  expected: number,
  opts: WaitOptions & { graceMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const graceMs = opts.graceMs ?? 5_000;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const start = now();
  const graceDeadline = start + graceMs;
  const deadline = start + timeoutMs;
  let delay = 100;
  while (true) {
    try {
      const result = await conn.execute(
        `SELECT count(*) AS n FROM "${escapeSql(db)}"."trexdb"."refinery_schema_history"`,
        [],
      );
      const rows = result?.rows || result || [];
      if (rows.length > 0) {
        const n = Number(rows[0]?.n ?? rows[0]?.[0] ?? 0);
        if (n >= expected) return true;
      }
    } catch {
      // Table absent or engine not ready — fall through to the grace/backoff
      // checks below, exactly like a row count that hasn't reached `expected`.
      if (now() >= graceDeadline) return true;
    }
    if (now() >= deadline) return false;
    await sleep(delay);
    delay = Math.min(delay * 2, 1000);
  }
}
