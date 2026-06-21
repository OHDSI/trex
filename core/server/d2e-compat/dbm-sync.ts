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
      });
    }
    return out;
  } finally {
    client.release();
  }
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
  try {
    console.log(
      `[d2e-compat] syncing ${creds.length} database(s) to Trex.DatabaseManager: [${creds.map((c) => c.id).join(", ")}]`,
    );
    dbm.setCredentials(creds);
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
