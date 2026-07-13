// One-shot migration of the legacy d2e `trex.db` connection registry into the
// trex-native `trexdb.database` + `trexdb.database_credential` store.
//
// The d2e fork kept source-database connections in `trex.db` (knex-managed, with
// credentials held as an RSA-encrypted jsonb array). trex resolves connections
// exclusively from `trexdb.database`, so any connection that was never
// re-registered through POST /trex/db/ is invisible to boot-attach and to
// analytics-svc — every dataset on it fails with "No analytics credential found
// for dataset". This migration mirrors each legacy row into the trexdb store,
// decrypting the credential with the d2e RSA scheme and re-encrypting it under
// the trex DEK so the two stores agree. The legacy `trex.db` table is left in
// place.
//
// Runs once, guarded by the `d2e_compat.legacyDbMigrated` setting.

import { pool } from "../db.ts";
import { upsertDatabaseCredential } from "./db-credential.ts";

const MIGRATED_SETTING_KEY = "d2e_compat.legacyDbMigrated";

export async function migrateLegacyDatabaseRegistry(): Promise<void> {
  const log = (m: string) => console.log(`[d2e-compat] [db-migrate] ${m}`);
  const client = await pool.connect();
  try {
    const legacyTable = await client.query(`SELECT to_regclass('trex.db') AS t`);
    if (legacyTable.rows[0]?.t == null) return;

    const done = await client.query(
      `SELECT 1 FROM trexdb.setting WHERE key = $1`,
      [MIGRATED_SETTING_KEY],
    );
    if (done.rows.length > 0) return;

    const legacy = await client.query(
      `SELECT id, host, port, name, dialect, vocab_schemas, db_extra, credentials
         FROM trex.db`,
    );

    await client.query("BEGIN");
    let migrated = 0;
    for (const row of legacy.rows) {
      await client.query(
        `INSERT INTO trexdb.database
           (id, host, port, "databaseName", dialect, "vocabSchemas", extra)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           host = EXCLUDED.host,
           port = EXCLUDED.port,
           "databaseName" = EXCLUDED."databaseName",
           dialect = EXCLUDED.dialect,
           "vocabSchemas" = EXCLUDED."vocabSchemas",
           extra = EXCLUDED.extra,
           "updatedAt" = NOW()`,
        [
          row.id,
          row.host,
          row.port,
          row.name,
          row.dialect,
          row.vocab_schemas != null ? JSON.stringify(row.vocab_schemas) : null,
          row.db_extra != null ? JSON.stringify(row.db_extra) : null,
        ],
      );

      // Replace the credential set from the legacy row so a stale username left
      // by a partial re-register can't shadow the migrated Admin credential
      // during boot-attach.
      await client.query(
        `DELETE FROM trexdb.database_credential WHERE "databaseId" = $1`,
        [row.id],
      );
      const creds = Array.isArray(row.credentials) ? row.credentials : [];
      for (const cred of creds) {
        if (!cred?.username) continue;
        await upsertDatabaseCredential(client, row.id, cred);
      }
      migrated++;
    }

    await client.query(
      `INSERT INTO trexdb.setting (key, value)
       VALUES ($1, to_jsonb(NOW()::text))
       ON CONFLICT (key) DO NOTHING`,
      [MIGRATED_SETTING_KEY],
    );
    await client.query("COMMIT");
    log(`migrated ${migrated} legacy database(s) into trexdb`);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    console.error(`[d2e-compat] [db-migrate] failed: ${(e as Error).message}`);
  } finally {
    client.release();
  }
}
