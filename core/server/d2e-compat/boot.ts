// d2e-compat/boot.ts
// Ports the boot side-effects from d2e services/trex/core/server/index.ts (lines 33-175)
// into the trex-native runtime. Called only when D2E_COMPAT=true.
//
// ── Schema assumptions for blocks 6–7 (HANA cache + source/strategus attach) ──
//
// Trex column                    → d2e field
// ─────────────────────────────────────────────────────────────────────────────
// trexdb.database.id             → row.id (and row.code in d2e)
// trexdb.database.host           → row.host
// trexdb.database.port           → row.port
// trexdb.database."databaseName" → row.name
// trexdb.database.dialect        → row.dialect
//   NOTE: d2e uses "hana" as a dialect value for HANA cache attach (block 6).
//   Trex's schema only stores "postgresql" and "bigquery" in practice. If a row
//   has dialect="hana" it will be processed; if not, block 6 is a no-op.
// trexdb.database_credential."userScope" = 'Admin' → adminCred.userScope === "Admin"
// trexdb.database_credential.username    → adminCred.username
// trexdb.database_credential.password_encrypted → adminCred.password (decrypted via decryptSecret)
//
// getCacheIdsFromPortal() in d2e read from portal.dataset.cache_id — that table
// does NOT exist in trex's schema. Block 7 therefore skips the portal cache_id
// enumeration and only attaches connections + strategus_results (logged as a
// [d2e-compat] warning at boot if the block runs with zero connections).
//
// The human must verify:
//   1. dialect values stored in trexdb.database are consistent with what
//      ensureSourceAttached() expects ("postgres", "bigquery", "hana").
//   2. The "Admin" userScope convention matches whatever credential rows are
//      present in trexdb.database_credential.
//   3. If portal.dataset exists in a future migration it can be re-enabled by
//      un-commenting the getCacheIdsFromPortal equivalent below.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ensureAttached,
  ensureCacheAttached,
  snowflakeExtrasFromRow,
  type ExecFn,
  type SourceCredential,
} from "./lib/attach.ts";
import { pool } from "../db.ts";
import { decryptSecret } from "../auth/crypto.ts";
import { migrateLegacyDatabaseRegistry } from "./dbm-migrate.ts";

declare const Trex: any;
declare const EdgeRuntime: any;

export async function d2eBoot(): Promise<void> {
  const log = (m: string) => console.log(`[d2e-compat] ${m}`);
  const err = (m: string) => console.error(`[d2e-compat] ${m}`);

  // ── Block 1: native WebAPI ────────────────────────────────────────────────
  // webapi.trex (from the trexsql base) registers webapi_start(), which starts
  // WebAPI on :8080. Gated by WEBAPI_NATIVE_ENABLED so builds without the
  // extension still start.
  if ((Deno.env.get("WEBAPI_NATIVE_ENABLED") ?? "true") !== "false") {
    try {
      const webapiConn = new Trex.TrexDB("memory");
      const startRows = await webapiConn.execute("SELECT webapi_start() AS msg", []);
      log(`native WebAPI — ${startRows[0]?.msg}`);
    } catch (e) {
      err(`webapi_start failed: ${(e as Error).message}`);
    }
  }

  // ── Block 2: ICU extension ───────────────────────────────────────────────
  // Load ICU extension for DuckDB functions like current_date.
  try {
    const icuConn = new Trex.TrexDB("memory");
    await icuConn.execute("LOAD icu", []);
    const icuTest = await icuConn.execute("SELECT current_date AS today", []);
    log(`Loaded ICU extension (current_date = ${icuTest[0]?.today})`);
  } catch (e) {
    err(`LOAD icu failed: ${(e as Error).message}`);
  }

  // ── Block 3: FTS extension ───────────────────────────────────────────────
  // Load FTS (Full-Text Search) extension for DuckDB.
  try {
    const ftsConn = new Trex.TrexDB("memory");
    await ftsConn.execute("LOAD fts", []);
    log(`Loaded FTS extension`);
  } catch (e) {
    err(`LOAD fts failed: ${(e as Error).message}`);
  }

  // ── Block 4: FHIR server ─────────────────────────────────────────────────
  // Start the in-process FHIR HTTP server (from @trex/fhir extension).
  // The trex runtime auto-loads fhir.trex at boot, which registers
  // trex_fhir_start/_stop/_status/_version SQL functions. Calling
  // trex_fhir_start spins up an Axum HTTP server in the engine process
  // that serves FHIR R4 traffic, reachable here at FHIR__HOST:FHIR__PORT.
  try {
    const fhirHost = Deno.env.get("FHIR__HOST") || "0.0.0.0";
    const fhirPort = parseInt(Deno.env.get("FHIR__PORT") || "8094", 10);
    const fhirDbName = Deno.env.get("FHIR__DB_NAME") || "FHIR";
    const fhirDbPath = Deno.env.get("FHIR__DB_PATH") || `./data/cache/${fhirDbName}.db`;
    const fhirConn = new Trex.TrexDB("memory");
    await fhirConn.execute(
      `ATTACH IF NOT EXISTS '${fhirDbPath}' AS ${fhirDbName}`,
      [],
    );
    const versionRows = await fhirConn.execute("SELECT trex_fhir_version() AS v", []);
    const fhirVersion = versionRows[0]?.v ?? "unknown";
    const startRows = await fhirConn.execute(
      `SELECT trex_fhir_start('${fhirHost}', ${fhirPort}, '${fhirDbName}', '${fhirDbPath}') AS msg`,
      [],
    );
    log(
      `Started FHIR server (${fhirVersion}) at ${fhirHost}:${fhirPort} (db=${fhirDbName} @ ${fhirDbPath}) — ${startRows[0]?.msg}`,
    );
  } catch (e) {
    err(`Failed to start FHIR server: ${(e as Error).message}`);
  }

  // ── Block 5: cdw_config_svc attach ───────────────────────────────────────
  // Attach the built-in cdw_config_svc validation schema so cdw-svc
  // queries against datasetId="DEFAULT" can resolve `cdw_config_svc`.
  try {
    const cdwConn = new Trex.TrexDB("memory");
    await cdwConn.execute(
      "ATTACH IF NOT EXISTS '/usr/src/cdw_data/built_in/cdw_config_svc_validation_schema' AS cdw_config_svc (READ_ONLY)",
      [],
    );
    log("Attached cdw_config_svc validation schema");
  } catch (e) {
    err(`Failed to attach cdw_config_svc validation schema: ${(e as Error).message}`);
  }

  // ── Block 5.5: legacy trex.db → trexdb registry migration ─────────────────
  // Reconcile the legacy d2e `trex.db` connection registry into trexdb before
  // the attach blocks read it, so migrated connections are attached this boot.
  await migrateLegacyDatabaseRegistry();

  // ── Block 6: HANA cache attach ───────────────────────────────────────────
  // For each credential with dialect="hana", attach its DuckDB cache file.
  // Replaces d2e's DatabaseManager.get().getCredentialsDecrypted() with a
  // direct query on trex's pg pool.
  //
  // Schema mapping (see file-header comment for full details):
  //   database.id → ds.code (used as cacheId)
  //   database.dialect → ds.dialect (filter for "hana")
  try {
    const dbResult = await pool.query<{ id: string; dialect: string }>(
      `SELECT id, dialect FROM trexdb.database WHERE enabled = true`,
    );
    const hanaConn = new Trex.TrexDB("memory");
    const hanaExec: ExecFn = (sql) => hanaConn.execute(sql, []);
    for (const ds of dbResult.rows) {
      if (ds.dialect !== "hana") continue;
      try {
        // PR #2835: attach the HANA cache as `${code}_cache.db`. The file is
        // created by the create_cachedb_hana_plugin flow (pgwire ATTACH cannot
        // create it); createDbFileIfMissing only lets the re-attach proceed.
        await ensureCacheAttached(`${ds.id}_cache`, {
          cacheDir: "/usr/src/data/cache",
          createDbFileIfMissing: true,
          exec: hanaExec,
        });
        log(`Attached HANA ${ds.id} as ${ds.id}_cache`);
      } catch (e) {
        err(`Failed to attach HANA cache for '${ds.id}': ${e}`);
      }
    }
  } catch (e) {
    err(`Failed to enumerate HANA datasets for cache attach: ${e}`);
  }

  // ── Block 7: source + strategus attach ───────────────────────────────────
  // Attach each enabled database as a DuckDB source alias (<id>__srcdb), then
  // attach the strategus results catalog.
  //
  // d2e's getCacheIdsFromPortal() read from portal.dataset.cache_id — that
  // table does not exist in trex's schema. That sub-block is omitted; only
  // direct connection attaches and the strategus_results attach are performed.
  //
  // Schema mapping (see file-header comment for full details):
  //   database.id             → connection.id
  //   database.dialect        → connection.dialect
  //   database.host           → connection.host
  //   database.port           → connection.port
  //   database."databaseName" → connection.name
  //   database_credential.username (where userScope='Admin') → adminUsername
  //   database_credential.password_encrypted (decrypted)     → adminPassword
  try {
    const rows = await pool.query<{
      id: string;
      dialect: string;
      host: string;
      port: number;
      databaseName: string;
      extra: unknown;
      cred_username: string | null;
      cred_password_encrypted: string | null;
    }>(
      `SELECT
         d.id,
         d.dialect,
         d.host,
         d.port,
         d."databaseName",
         d.extra,
         dc.username AS cred_username,
         dc.password_encrypted AS cred_password_encrypted
       FROM trexdb.database d
       LEFT JOIN trexdb.database_credential dc
         ON dc."databaseId" = d.id AND dc."userScope" = 'Admin'
       WHERE d.enabled = true`,
    );

    const connections: SourceCredential[] = [];
    for (const row of rows.rows) {
      if (!row.cred_username) {
        log(`[attach-startup] no Admin credential for ${row.id} — skipping __srcdb attach`);
        continue;
      }
      let adminPassword: string;
      try {
        if (!row.cred_password_encrypted) {
          log(`[attach-startup] no encrypted password for ${row.id} Admin credential — skipping`);
          continue;
        }
        adminPassword = await decryptSecret(row.cred_password_encrypted);
      } catch (e) {
        err(`[attach-startup] failed to decrypt password for ${row.id}: ${(e as Error).message}`);
        continue;
      }
      connections.push({
        id: row.id,
        dialect: row.dialect,
        host: row.host,
        port: row.port,
        name: row.databaseName,
        adminUsername: row.cred_username,
        adminPassword,
        ...(row.dialect === "snowflake" ? snowflakeExtrasFromRow(row.extra) : {}),
      });
    }

    // d2e's getCacheIdsFromPortal() read cache_ids from portal.dataset.cache_id,
    // which is not in trex's schema. Instead, enumerate the persisted cache .db
    // files on disk and re-attach each as its <cacheId> catalog. The cache dir is
    // a named volume, so the files survive a restart — but DuckDB ATTACHes do not.
    // Without re-attaching, after `docker compose restart` a dataset's cache
    // catalog is gone and queries against it fail with "Catalog <cacheId> does
    // not exist" (e.g. the cohort builder's concept search). FHIR and
    // strategus_results are attached separately (above / below), so skip them.
    const cacheDir = "/usr/src/data/cache";
    const systemDbNames = new Set<string>([
      Deno.env.get("FHIR__DB_NAME") || "FHIR",
      Deno.env.get("TREX__STRATEGUS_RESULTS_DB_NAME") || "strategus_results",
    ]);
    const cacheIds: string[] = [];
    try {
      for (const entry of Deno.readDirSync(cacheDir)) {
        if (!entry.isFile || !entry.name.endsWith(".db")) continue;
        const cid = entry.name.slice(0, -3);
        if (systemDbNames.has(cid)) continue;
        cacheIds.push(cid);
      }
      log(
        `[attach-startup] discovered ${cacheIds.length} dataset cache file(s) in ${cacheDir}`,
      );
    } catch (e) {
      log(
        `[attach-startup] cache file enumeration failed (${cacheDir}): ${(e as Error).message}`,
      );
    }

    const attachConn = new Trex.TrexDB("memory");
    const attachExec: ExecFn = (sql) => attachConn.execute(sql, []);

    for (const c of connections) {
      try {
        await ensureAttached({ connections: [c] }, { exec: attachExec });
      } catch (e) {
        log(`[attach-startup] connection ${c.id} attach failed: ${(e as Error).message}`);
      }
    }
    for (const cid of cacheIds) {
      try {
        await ensureAttached({ cacheIds: [cid] }, { exec: attachExec, cacheDir, createDbFileIfMissing: true});
      } catch (e) {
        log(`[attach-startup] cache ${cid} attach failed: ${(e as Error).message}`);
      }
    }
    log(
      `[attach-startup] ensureAttached over ${connections.length} connection(s) and ${cacheIds.length} cache_id(s)`,
    );

    // Strategus results catalog — always attach (create if missing).
    const strategusDbName =
      Deno.env.get("TREX__STRATEGUS_RESULTS_DB_NAME") || "strategus_results";
    try {
      await ensureAttached(
        { cacheIds: [strategusDbName] },
        { exec: attachExec, createDbFileIfMissing: true },
      );
      log(`[attach-startup] strategus_results attach successful`);
    } catch (error) {
      log(
        `[attach-startup] cache strategus_results attach failed: ${(error as Error).message}`,
      );
    }
  } catch (e) {
    log(`[attach-startup] failed: ${(e as Error).message}`);
  }

  // ── Block 8: native DatabaseManager sync ─────────────────────────────────
  // Push the trexdb registry into Trex.DatabaseManager (op_get_dbc store) so the
  // d2e /trex/db façade and any worker reading Trex.DatabaseManager.getCredentials()
  // see the live registry, and the native manager (re)attaches/publishes sources.
  // This is the trex-native equivalent of d2e's DatabaseManager.get() priming
  // trexdbm.setCredentials() at startup.
  try {
    const { syncTrexDatabaseManager } = await import("./dbm-sync.ts");
    await syncTrexDatabaseManager();
  } catch (e) {
    err(`native DatabaseManager sync failed: ${(e as Error).message}`);
  }
}
