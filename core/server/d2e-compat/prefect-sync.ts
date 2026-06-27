// d2e-compat: keep the Prefect `database-credentials` secret block in sync with the
// trexdb registry on every /trex/db write (and delete).
//
// Prefect flows (datamodel-create, DQD, data-characterization) resolve a dataset's
// connection by loading the `database-credentials` Secret block and finding the entry
// whose `databaseCode` matches — see plugins/flows/_shared_flow_utils/dao/daobase.py
// (`Secret.load("database-credentials").get()`). The d2e main re-seeded this block on
// every DatabaseManager write (services/trex/core/server/lib/dbm.ts →
// PrefectAPI.createBlockDocument). The trexsql d2e-compat port had dropped that call
// ("PrefectAPI.createBlockDocument — not available in trex; skipped." in routes.ts), so
// a database registered during setup (demo_database, demo_database_hana) only ever made
// it into the block if alp-dataflow-gen-init happened to seed AFTER it existed — a boot
// race. When it lost the race the flow failed with:
//   ValueError: Database code '<code>' not found in 'DATABASE_CREDENTIALS' secret
//
// This module restores the re-seed by calling the Prefect REST API directly (the same
// endpoints alp-dataflow-gen-init/src/PrefectAPI.ts uses to seed the block at boot).
// It never throws: a Prefect hiccup must not 500 the /trex/db write (mirrors how
// syncTrexDatabaseManager degrades to a warning).

import { pool } from "../db.ts";
import { decryptSecret } from "../auth/crypto.ts";

const BLOCK_NAME = "database-credentials";
const SECRET_SLUG = "secret";

/** Prefect REST API base (e.g. http://d2e-dataflow-gen-1:41120/d2e/api), or null when unset. */
function prefectBaseUrl(): string | null {
  const url = Deno.env.get("PREFECT_API_URL") ?? "";
  return url.length > 0 ? url.replace(/\/+$/, "") : null;
}

/** Decrypt a credential password with trex's native secret scheme, falling back to the
 *  plaintext column (scripts/tests may store plaintext) — same as dbm-sync.ts. */
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

/** The flow's DAO matches dialects against "postgres"/"hana" — normalize "postgresql". */
function flowDialect(dialect: string | null | undefined): string {
  const d = (dialect ?? "").toLowerCase();
  return d === "postgresql" ? "postgres" : d;
}

/**
 * Build the flow's DBCredentialsType[] from the trexdb registry. Mirrors the boot
 * seeder (plugins/functions/alp-dataflow-gen-init/src/types.ts transformDBCredentials)
 * so a runtime-added DB is shaped identically to the boot-seeded ones.
 */
async function buildFlowCredentials(): Promise<any[]> {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `SELECT d.id, d.host, d.port, d."databaseName" AS name, d.dialect, d.extra,
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
      const creds: any[] = row.credentials ?? [];
      const read = creds.find((c) => c.userScope === "Read");
      const admin = creds.find((c) => c.userScope === "Admin");
      const extra = row.extra ?? {};
      out.push({
        readUser: read ? read.username : null,
        readPassword: read ? await recoverPassword(read.password, read.password_encrypted) : null,
        adminUser: admin ? admin.username : null,
        adminPassword: admin ? await recoverPassword(admin.password, admin.password_encrypted) : null,
        dialect: flowDialect(row.dialect),
        databaseName: row.name,
        databaseCode: row.id,
        host: row.host,
        port: row.port,
        encrypt: extra.encrypt ?? false,
        validateCertificate: extra.validateCertificate ?? false,
        sslTrustStore: extra.sslTrustStore ?? "",
        hostnameInCertificate: extra.hostnameInCertificate ?? "",
        enableAuditPolicies: extra.enableAuditPolicies ?? false,
        readRole: extra.readRole ?? "",
        // trexdb.database has no authenticationMode column; the d2e demo (postgres + HANA)
        // authenticates with username/password, so default to Password — the flow's
        // Literal[AuthMode] validation rejects a missing value. Matches the boot seeder.
        authMode: "Password",
        // BigQuery-specific fields (empty unless set in `extra`).
        type: extra.type ?? "",
        project_id: extra.project_id ?? "",
        private_key_id: extra.private_key_id ?? "",
        private_key: extra.private_key ?? "",
        client_email: extra.client_email ?? "",
        client_id: extra.client_id ?? "",
        auth_uri: extra.auth_uri ?? "",
        token_uri: extra.token_uri ?? "",
        auth_provider_x509_cert_url: extra.auth_provider_x509_cert_url ?? "",
        client_x509_cert_url: extra.client_x509_cert_url ?? "",
        universe_domain: extra.universe_domain ?? "",
      });
    }
    return out;
  } finally {
    client.release();
  }
}

async function pfJson(res: Response, ctx: string): Promise<any> {
  if (!res.ok) throw new Error(`${ctx} -> ${res.status} ${await res.text()}`);
  return await res.json();
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Re-seed (create-or-update) the Prefect `database-credentials` secret block from the
 * current trexdb registry. No-op (with a warning) when PREFECT_API_URL is unset or
 * Prefect is unreachable, so the /trex/db write still succeeds.
 */
export async function syncPrefectDatabaseCredentials(): Promise<void> {
  const base = prefectBaseUrl();
  if (!base) {
    console.warn("[d2e-compat] PREFECT_API_URL unset — skipping Prefect 'database-credentials' re-seed");
    return;
  }

  let value: any[];
  try {
    value = await buildFlowCredentials();
  } catch (e) {
    console.error(`[d2e-compat] prefect sync: failed to read trexdb registry: ${e}`);
    return;
  }

  try {
    const blockType = await pfJson(
      await fetch(`${base}/block_types/slug/${SECRET_SLUG}`, { headers: JSON_HEADERS }),
      "get secret block type",
    );
    const blockTypeId = blockType.id;

    const schemas = await pfJson(
      await fetch(`${base}/block_schemas/filter`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ block_schemas: { block_type_id: { any_: [blockTypeId] } } }),
      }),
      "get secret block schema",
    );
    const blockSchemaId = schemas[0].id;

    const codes = value.map((v) => v.databaseCode).join(", ");
    // Trailing slash is required: Prefect's FastAPI redirects POST /block_documents →
    // /block_documents/ with a 307, which not every client re-issues with the body.
    const createRes = await fetch(`${base}/block_documents/`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        name: BLOCK_NAME,
        data: { value },
        block_schema_id: blockSchemaId,
        block_type_id: blockTypeId,
      }),
    });

    if (createRes.ok) {
      console.log(`[d2e-compat] seeded Prefect '${BLOCK_NAME}' with ${value.length} database(s): [${codes}]`);
      return;
    }
    if (createRes.status !== 409) {
      throw new Error(`create block -> ${createRes.status} ${await createRes.text()}`);
    }

    // Block already exists — look up its id and PATCH the data in place.
    const existing = await pfJson(
      await fetch(`${base}/block_types/slug/${SECRET_SLUG}/block_documents/name/${BLOCK_NAME}`, {
        headers: JSON_HEADERS,
      }),
      "lookup existing block",
    );
    const patchRes = await fetch(`${base}/block_documents/${existing.id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify({ block_schema_id: blockSchemaId, data: { value }, merge_existing_data: false }),
    });
    if (!patchRes.ok) {
      throw new Error(`update block -> ${patchRes.status} ${await patchRes.text()}`);
    }
    console.log(`[d2e-compat] updated Prefect '${BLOCK_NAME}' with ${value.length} database(s): [${codes}]`);
  } catch (e) {
    console.error(`[d2e-compat] prefect 'database-credentials' re-seed failed: ${e}`);
  }
}
