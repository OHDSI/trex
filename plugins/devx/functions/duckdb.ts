// @ts-nocheck - Deno edge function
/**
 * DuckDB query helper — executes SQL against the in-memory DuckDB instance
 * where .trex extensions (including devx-ext) are loaded.
 *
 * Uses Trex.databaseManager() -> TrexDB -> op_execute_query_pinned under the hood.
 */

/** Escape a single-quote for SQL string literals. */
export function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

/** Get a TrexDB connection for the in-memory DuckDB instance. */
function getMemoryConnection() {
  const dbm = globalThis.Trex?.databaseManager?.();
  if (dbm) {
    const conn = dbm.getConnection("memory", "main", "main", "main", {});
    return conn.connection; // TrexDB instance
  }
  return null;
}

/**
 * Open ONE in-memory DuckDB connection and reuse it across many queries,
 * leasing a single pool session for the connection's whole lifetime.
 *
 * Long-lived pollers (the dev-server output SSE loop) MUST use this instead of
 * calling duckdb() per tick. duckdb() leases AND should release a fresh pool
 * session every call; at a 500ms poll cadence that is a brutal churn on the
 * shared pool, and any per-call imbalance drains all 64 sessions within
 * seconds — every sql() then blocks on a lease and the node wedges. Reusing one
 * session turns N leases per stream into exactly one.
 *
 * The caller MUST call close() when done (e.g. on stream teardown) to return
 * the session to the pool.
 */
export function openMemoryConnection(): { query(sql: string, params?: unknown[]): Promise<string>; close(): void } {
  const conn = getMemoryConnection();
  if (!conn) {
    throw new Error("DuckDB not available - Trex.databaseManager() not found");
  }
  let closed = false;
  return {
    async query(sql: string, params: unknown[] = []): Promise<string> {
      if (closed) throw new Error("memory connection already closed");
      const rows = await conn.execute(sql, params);
      return rows?.[0]?.column0 ?? "";
    },
    close() {
      if (closed) return;
      closed = true;
      try { conn.close?.(); } catch { /* best-effort */ }
    },
  };
}

/**
 * Execute a DuckDB SQL query against the in-memory database and return
 * the first row's column0 value. All devx_* table functions return a
 * single row with a JSON VARCHAR `column0`.
 *
 * devx_ext is loaded by pg_trex at startup on the shared DuckDB connection.
 * The Deno runtime uses that shared connection via CONNECTION_PROVIDER
 * (set by trexas before TREX_DB initializes). Do NOT LOAD devx_ext here —
 * that creates a separate extension instance with its own static process
 * registry, breaking process management across requests.
 */
export async function duckdb(sql: string, params: unknown[] = []): Promise<string> {
  const conn = getMemoryConnection();
  if (!conn) {
    throw new Error("DuckDB not available - Trex.databaseManager() not found");
  }
  // getConnection() leases a fresh pool session (op_create_session) on every
  // call and never reuses it, so the session MUST be returned via close() or
  // the shared DuckDB pool (default 64) drains one slot per devx DB call until
  // it is exhausted — at which point every pgwire/sql() lease blocks forever
  // and the whole node wedges. close() only returns the pooled connection; the
  // devx_ext process registry is extension-global and unaffected.
  try {
    const rows = await conn.execute(sql, params);
    return rows?.[0]?.column0 ?? "";
  } finally {
    try {
      conn.close?.();
    } catch {
      // best-effort: never let cleanup mask the query result/error
    }
  }
}
