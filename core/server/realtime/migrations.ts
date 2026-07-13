import { escapeSql } from "../lib/sql.ts";
import { waitForAttachedDatabase } from "../lib/db-wait.ts";

declare const Trex: any;

/**
 * Apply the vendored WALRUS realtime schema migrations.
 *
 * Mirrors Plugins.applyMigrations (core/server/plugin/plugin.ts): opens an
 * in-memory TrexDB connection, waits for the attached `_config` (Postgres)
 * catalog to appear — core/server is spawned before the host ATTACHes it — then
 * runs trex_migration_run_schema against the migrations directory. Idempotent:
 * trex_migration_run_schema tracks applied versions and the SQL itself is
 * re-runnable, so this is safe to call on every boot.
 */
export async function applyRealtimeMigrations(): Promise<void> {
  const dir = new URL("./migrations", import.meta.url).pathname;
  const conn = new Trex.TrexDB("memory");
  const ready = await waitForAttachedDatabase(conn, "_config");
  if (!ready) {
    throw new Error("realtime migrations: _config catalog not attached");
  }
  const sql =
    `SELECT version, name, status FROM trex_migration_run_schema('${escapeSql(dir)}', 'realtime', '_config')`;
  const result = await conn.execute(sql, []);
  const rows = result?.rows || result || [];
  const failed = rows.filter((r: any) => (r.status ?? r[2]) === "failed");
  if (failed.length > 0) {
    throw new Error(`realtime migrations failed: ${JSON.stringify(failed)}`);
  }
  console.log(`realtime: ${rows.length} migration(s) checked`);
}
