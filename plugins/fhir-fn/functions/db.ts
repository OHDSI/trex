// @ts-nocheck - Deno edge function

export interface Conn {
  /** Execute SQL; returns parsed rows (array of objects). */
  query(sql: string, params?: unknown[]): Promise<any[]>;
}

function leaseMemoryConnection() {
  const dbm = (globalThis as any).Trex?.databaseManager?.();
  if (!dbm) throw new Error("DuckDB not available — Trex.databaseManager() not found");
  // Suppress the harmless "Error getting dialect for memory" log (see devx/duckdb.ts).
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Error getting dialect for memory")) return;
    origError.apply(console, args);
  };
  try {
    const c = dbm.getConnection("memory", "main", "main", "main", {});
    return c.connection; // TrexDB instance (leases one pool session)
  } finally {
    console.error = origError;
  }
}

/**
 * Run `fn` with a single pinned DuckDB session, released afterwards.
 * One lease + one close per request — preserves the RequestConn isolation
 * model and avoids draining the shared pool.
 */
export async function withConnection<T>(fn: (conn: Conn) => Promise<T>): Promise<T> {
  const raw = leaseMemoryConnection();
  const conn: Conn = {
    async query(sql: string, params: unknown[] = []) {
      return await raw.execute(sql, params);
    },
  };
  try {
    return await fn(conn);
  } finally {
    try { raw.close?.(); } catch { /* best-effort */ }
  }
}

/** Convenience: a query helper that returns the first row's `column0` JSON string,
 *  matching how the native handlers read scalar JSON results. */
export async function scalarJson(conn: Conn, sql: string, params: unknown[] = []): Promise<string> {
  const rows = await conn.query(sql, params);
  return rows?.[0]?.column0 ?? "";
}
