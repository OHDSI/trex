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
    // Suppress "Error getting dialect for memory" log from the runtime's
    // getConnection() which tries to look up credentials for "memory" db.
    // The error is harmless (dialect defaults to "duckdb") but spams logs.
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("Error getting dialect for memory")) return;
      origError.apply(console, args);
    };
    try {
      const conn = dbm.getConnection("memory", "main", "main", "main", {});
      return conn.connection; // TrexDB instance
    } finally {
      console.error = origError;
    }
  }
  return null;
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
  if (conn) {
    const rows = await conn.execute(sql, params);
    return rows?.[0]?.column0 ?? "";
  }

  throw new Error("DuckDB not available - Trex.databaseManager() not found");
}
