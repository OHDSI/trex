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
