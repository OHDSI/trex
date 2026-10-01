// d2e-compat: bridge the d2e DatabaseManager interface to trex's NATIVE
// DatabaseManager (the `Trex.DatabaseManager` ambient global).
//
// This mirrors how the d2e main's lib/dbm.ts worked: the d2e-shaped /trex/db API
// is the façade, but the single source of truth for *attaching* source databases
// (so trexas/functions can query them) is the trex-native manager. On every
// mutation — and once at boot — we read the full registry from the `trexdb`
// tables, decrypt credential passwords (d2e RSA scheme), and push the result into
// `Trex.DatabaseManager.getDatabaseManager().setCredentials(...)`. The native
// manager then ATTACHes each source DB into DuckDB (`<id>__srcdb`) and tracks
// publications — exactly what d2e relied on.

import { pool } from "../db.ts";
import { decryptSecret } from "../auth/crypto.ts";
import {
  bigqueryCredentialsFromRow,
  bigquerySecretSql,
  redactSecrets,
  writeGoogleCredentials,
} from "./lib/attach.ts";

// Monotonic counter bumped on every deliberate registry sync (boot + /trex/db
// writes, via syncTrexDatabaseManager). Function workers (plugin/function.ts) read
// it to forceCreate a fresh worker once after a registration, so a runtime-added DB
// becomes visible. Intentionally not derived from getCredentials() content: cache
// attaches (/trex/attach) mutate that view mid-flow, which would churn workers.
let _registrationEpoch = 0;
export function getRegistrationEpoch(): number {
  return _registrationEpoch;
}

// deno-lint-ignore no-explicit-any
function getTrexDbm(): any {
  // deno-lint-ignore no-explicit-any
  const Trex = (globalThis as any).Trex;
  try {
    return Trex?.DatabaseManager?.getDatabaseManager?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * Recover a plaintext credential password using trex's native secret scheme —
 * the same path boot.ts uses for source attach: `decryptSecret(password_encrypted)`.
 * Falls back to the plaintext `password` column when there's no encrypted value
 * (scripts/tests may store plaintext), so registration works either way.
 */
async function recoverPassword(
  password: string | null | undefined,
  passwordEncrypted: string | null | undefined,
): Promise<string> {
  if (passwordEncrypted) {
    try {
      return await decryptSecret(passwordEncrypted);
    } catch {
      /* fall through to plaintext column */
    }
  }
  return password ?? "";
}

/** Map a trexdb dialect token to what the native engine's #updatePublications expects. */
function nativeDialect(dialect: string | null | undefined): string {
  const d = (dialect ?? "").toLowerCase();
  if (d === "postgresql" || d === "postgres") return "postgres";
  return d;
}

/** Read the full database registry (decrypted) from the trexdb tables, in the
 *  shape the trex-native DatabaseManager.getCredentials()/setCredentials() use. */
export async function readRegistryDecrypted(): Promise<any[]> {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT d.id, d.host, d.port, d."databaseName" AS name, d.dialect,
              d."vocabSchemas" AS vocab_schemas, d.extra,
              COALESCE(
                json_agg(
                  json_build_object(
                    'username', dc.username,
                    'password', dc.password,
                    'password_encrypted', dc.password_encrypted,
                    'userScope', dc."userScope",
                    'serviceScope', dc."serviceScope"
                  )
                ) FILTER (WHERE dc.id IS NOT NULL),
                '[]'::json
              ) AS credentials
         FROM trexdb.database d
         LEFT JOIN trexdb.database_credential dc ON dc."databaseId" = d.id
        WHERE d.enabled IS NOT FALSE
        GROUP BY d.id`,
    );
    const out: any[] = [];
    for (const row of r.rows) {
      const credentials = [];
      for (const c of row.credentials ?? []) {
        credentials.push({
          username: c.username,
          password: await recoverPassword(c.password, c.password_encrypted),
          userScope: c.userScope,
          serviceScope: c.serviceScope,
        });
      }
      out.push({
        id: row.id,
        // d2e keyed analytics credentials by `code` (its DatabaseManager selected
        // `id AS code`). analytics-svc reads rest.code → values.code →
        // credentials.code, and main.ts maps by credentials.code; without it the
        // lookup key is `undefined` and every dataset 404s with "No analytics
        // credential found". Mirror d2e: code == id.
        code: row.id,
        host: row.host,
        port: row.port,
        name: row.name,
        dialect: nativeDialect(row.dialect),
        vocabSchemas: row.vocab_schemas ?? [],
        publications: [],
        credentials,
        // Forward the trexdb `extra` jsonb so it round-trips through the native
        // DatabaseManager. Consumers disagree on the field name — the flow seeder
        // reads `db_extra` (getDatabaseCredentials) while buildDatabaseCredentials
        // reads `extra ?? db_extra` (getCredentials) — so emit both. Without this,
        // dialect-specific extras (e.g. the Snowflake key-pair privateKey/
        // warehouse/schema/role) never reach the flow's database-credentials seed
        // or the function-worker DATABASE_CREDENTIALS.
        extra: row.extra ?? {},
        db_extra: row.extra ?? {},
      });
    }
    return out;
  } finally {
    client.release();
  }
}

/** What the registry sync must prepare for BigQuery: a scoped DuckDB secret per
 *  source, and the one key WebAPI's ADC file can hold. Pure, for testing. */
export function planBigQueryCredentials(
  creds: Array<{ id: string; host: string; dialect: string; extra?: unknown }>,
): { secrets: string[]; adcKey?: Record<string, unknown>; warnings: string[] } {
  const secrets: string[] = [];
  const warnings: string[] = [];
  const byProject = new Map<string, string>();
  const emails = new Set<string>();
  let adcKey: Record<string, unknown> | undefined;
  for (const c of creds) {
    if (c.dialect !== "bigquery") continue;
    const key = bigqueryCredentialsFromRow(c.extra);
    if (!key) {
      warnings.push(`bigquery source ${c.id} has no service-account key in extra`);
      continue;
    }
    const email = String(key.client_email);
    const seen = byProject.get(c.host);
    if (seen && seen !== email) {
      warnings.push(`bigquery project ${c.host} has sources with different keys; the native attach picks one by scope`);
    }
    byProject.set(c.host, email);
    emails.add(email);
    secrets.push(bigquerySecretSql(c.id, c.host, key));
    adcKey = key;
  }
  if (emails.size > 1) {
    warnings.push(
      `GOOGLE_APPLICATION_CREDENTIALS holds one key; WebAPI uses ${String(adcKey?.client_email)} for every BigQuery source`,
    );
  }
  return { secrets, adcKey, warnings };
}

/** Push the trexdb registry into the trex-native DatabaseManager so source DBs
 *  get attached/published. No-op (with a warning) if the native manager is absent
 *  — e.g. a trex build without the ambient global — so the API still functions. */
export async function syncTrexDatabaseManager(): Promise<void> {
  const dbm = getTrexDbm();
  if (!dbm) {
    console.warn("[d2e-compat] Trex.DatabaseManager unavailable — skipping native db sync");
    return;
  }
  let creds: any[] = [];
  try {
    creds = await readRegistryDecrypted();
  } catch (e) {
    console.error(`[d2e-compat] dbm sync: failed to read trexdb registry: ${e}`);
    return;
  }
  // Own try: a BigQuery key problem must not keep the other sources from syncing.
  try {
    const plan = planBigQueryCredentials(creds);
    for (const w of plan.warnings) console.warn(`[d2e-compat] dbm sync: ${w}`);
    if (plan.secrets.length > 0) {
      // Same DuckDB instance the native manager attaches on, so its
      // #add_bigquery picks these up by SCOPE.
      // deno-lint-ignore no-explicit-any
      const conn = new (globalThis as any).Trex.TrexDB("memory");
      try {
        await conn.execute("LOAD bigquery", []);
      } catch {
        await conn.execute("INSTALL bigquery FROM community", []);
        await conn.execute("LOAD bigquery", []);
      }
      for (const sql of plan.secrets) await conn.execute(sql, []);
    }
    // WebAPI reads ADC (OAuthType=3) from this file.
    if (plan.adcKey) await writeGoogleCredentials(plan.adcKey);
  } catch (e) {
    console.error(`[d2e-compat] dbm sync: bigquery credentials not prepared: ${redactSecrets(String(e))}`);
  }
  try {
    console.log(
      `[d2e-compat] syncing ${creds.length} database(s) to Trex.DatabaseManager: [${creds.map((c) => c.id).join(", ")}]`,
    );
    dbm.setCredentials(creds);
    // Signal function workers that the registry changed so they refresh on next call.
    _registrationEpoch++;
  } catch (e) {
    console.error(`[d2e-compat] dbm sync: setCredentials failed: ${e}`);
  }
}

/** Publications map from the trex-native manager (replaces the degraded []). */
export function getTrexPublications(): unknown {
  const dbm = getTrexDbm();
  try {
    return dbm?.getPublications?.() ?? {};
  } catch {
    return {};
  }
}

/** Live credentials view from the trex-native manager (op_get_dbc store). */
export function getTrexDbCredentials(): any[] {
  const dbm = getTrexDbm();
  try {
    return dbm?.getCredentials?.() ?? [];
  } catch {
    return [];
  }
}

/**
 * Build the d2e DATABASE_CREDENTIALS value (IDatabaseCredential[] shape) from the
 * live registry, for injection into d2e function workers — the same env d2e fed
 * its services. Each entry is tagged `analytics` so the analytics-svc envConverter
 * (which runs the DATABASE_CREDENTIALS → VCAP_SERVICES mapping in-plugin) picks it
 * up. The engine only PROVIDES the data; the mapping stays in the plugin.
 */
export function buildDatabaseCredentials(): any[] {
  return getTrexDbCredentials().map((c: any) => ({
    code: c.id,
    id: c.id,
    host: c.host,
    port: c.port,
    name: c.name,
    dialect: c.dialect,
    credentials: c.credentials ?? [],
    vocab_schemas: c.vocabSchemas ?? c.vocab_schemas ?? [],
    publications: c.publications ?? [],
    db_extra: c.extra ?? c.db_extra ?? {},
    tags: ["analytics"],
  }));
}
