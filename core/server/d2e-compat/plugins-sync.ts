import { pool } from "../db.ts";

/**
 * Mirror the in-memory plugin registry into the legacy `trex.plugins` table.
 *
 * The d2e Hono fork persisted every registered plugin to `trex.plugins`
 * (name, url, version, payload=pkg.trex) at scan time. trex's canonical core
 * keeps the registry in memory only (Plugins.activeRegistry), so the table is
 * never created on the new core. d2e's job plugins still read it:
 *   - jobplugins/index.ts:        SELECT name,url,payload::JSON FROM trex.plugins
 *                                 WHERE payload->'flow' is not null
 *   - DataModelFlowService.ts:    SELECT name, payload FROM trex.plugins
 * Both walk `payload.flow.flows`, i.e. payload === pkg.trex. Without this table
 * the DQD/data-model flows fail with `relation "trex.plugins" does not exist`.
 *
 * This restores the old behavior for D2E_COMPAT: create the `trex` schema +
 * table if missing and upsert each active plugin that declares a `trex` config.
 * A failure here must never take down boot — the readers degrade to "no flows".
 */
export async function syncTrexPluginsTable(
  activeRegistry: Map<string, { version: string; trexConfig?: unknown }>,
): Promise<void> {
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS trex`);
    await pool.query(
      `CREATE TABLE IF NOT EXISTS trex.plugins (
         name text PRIMARY KEY,
         url text,
         version text,
         payload jsonb
       )`,
    );

    let count = 0;
    for (const [shortName, entry] of activeRegistry) {
      // Only plugins with a `trex` config block were ever stored. The legacy
      // fork keyed both `name` and `url` on the short (unscoped) name.
      if (!entry.trexConfig) continue;
      await pool.query(
        `INSERT INTO trex.plugins (name, url, version, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO UPDATE
           SET url = EXCLUDED.url,
               version = EXCLUDED.version,
               payload = EXCLUDED.payload`,
        [shortName, shortName, entry.version, JSON.stringify(entry.trexConfig)],
      );
      count++;
    }
    console.log(`[d2e-compat] Synced ${count} plugin(s) into trex.plugins`);
  } catch (e) {
    console.error(
      "[d2e-compat] Failed to sync trex.plugins (flow plugins may be unavailable):",
      (e as Error)?.message ?? e,
    );
  }
}
