// @ts-nocheck - Deno edge function
// Read/write helpers for devx.provider_configs' API key. Encrypted at rest
// when DEVX_ENCRYPTION_KEY is configured, plaintext-tolerant when it is not,
// so a deployment without a key keeps working and rows migrate as they are
// written. A decryption FAILURE is deliberately loud: falling back to the
// plaintext column would mask a rotated key and keep running on a stale
// credential.
import { decryptToken, encryptToken } from "./crypto.ts";

export interface ProviderKeyFields {
  api_key: string | null;
  api_key_encrypted: string | null;
  api_key_iv: string | null;
}

let warned = false;

export function encryptionConfigured(): boolean {
  const v = Deno.env.get("DEVX_ENCRYPTION_KEY");
  return typeof v === "string" && v.trim() !== "";
}

// Minimal shape every call site's `sql`/`ctx.sql` helper satisfies.
type SqlFn = (query: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

// Tables whose api_key column has an encrypted-pair migration, and the
// migration that adds it.
const ENCRYPTION_MIGRATIONS = {
  provider_configs: "V15",
  settings: "V16",
} as const;
type EncryptionMigratedTable = keyof typeof ENCRYPTION_MIGRATIONS;

// Cache for assertEncryptionMigrated below: one probe query per table per
// process, not per request. Keyed by table name so that checking one table
// can never answer for another — a missing key means "not yet probed".
const migrationApplied = new Map<EncryptionMigratedTable, boolean>();

// V15 (plugins/devx/migrations/V15__provider_config_key_encryption.sql) and
// V16 (plugins/devx/migrations/V16__settings_key_encryption.sql) each add an
// api_key_encrypted/api_key_iv pair to one table. core/server's plugin
// migration runner applies these at boot but is deliberately non-fatal on
// failure (core/server/plugin/plugin.ts:302-305 — "Failures are logged but
// never crash startup") and has a known, previously-observed startup race
// with no retry (plugin.ts:319-324) that can leave a plugin's migrations
// never applied for the life of the process.
//
// Every credential read site in this plugin selects the new columns
// directly (`SELECT pc.api_key, pc.api_key_encrypted, pc.api_key_iv, ...`).
// If the relevant migration never applied, that SELECT itself throws a raw
// `column "api_key_encrypted" does not exist` — a string that gives no hint
// that a migration is the cause, thrown before readProviderKey's own
// try/catch even runs. Call this first, so the failure is diagnosable in one
// line instead of requiring someone to correlate a boot-time log line that
// has long since scrolled past.
//
// Cheap by design: probes information_schema.columns (not the table itself)
// and caches the boolean for the rest of the process, so this is one extra
// query per table total, not one per request.
export async function assertEncryptionMigrated(
  table: EncryptionMigratedTable,
  sql: SqlFn,
): Promise<void> {
  let applied = migrationApplied.get(table);
  if (applied === undefined) {
    const result = await sql(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'devx' AND table_name = $1 AND column_name = 'api_key_encrypted'`,
      [table],
    );
    // Assign only after the query resolves, and only into this table's slot
    // — a transient query failure throws above and leaves the cache
    // untouched, and a result for one table can never poison another's.
    applied = result.rows.length > 0;
    migrationApplied.set(table, applied);
  }
  if (!applied) {
    const migration = ENCRYPTION_MIGRATIONS[table];
    throw new Error(
      `devx migration ${migration} has not been applied — devx.${table}.api_key_encrypted ` +
        "is missing, so provider credentials cannot be read. Restart core/server (plugin " +
        `migrations apply at boot) or check the startup log for why ${migration} failed to apply.`,
    );
  }
}

// Thin wrapper kept so the many existing provider_configs call sites do not
// churn: same name, same signature, just delegates to the generalised,
// per-table assertion above.
export async function assertProviderConfigEncryptionMigrated(sql: SqlFn): Promise<void> {
  return assertEncryptionMigrated("provider_configs", sql);
}

// Test-only: clears the cache above (both tables) so a test can exercise
// both the "not applied" and "applied" branches of assertEncryptionMigrated
// within the same process. Not called anywhere outside tests.
export function __resetMigrationCacheForTests(): void {
  migrationApplied.clear();
}

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[provider_key] DEVX_ENCRYPTION_KEY is not set — provider API keys are stored in plaintext. " +
      "Set it and run POST /provider-configs/encrypt-existing to migrate.",
  );
}

export async function readProviderKey(
  row: Partial<ProviderKeyFields>,
): Promise<string | null> {
  if (row.api_key_encrypted && row.api_key_iv) {
    // The row holds an encrypted credential: never fall back to row.api_key
    // (a stale/legacy plaintext column that may still be populated) — that
    // would silently serve an unreachable or stale key. Both failure shapes
    // below are deliberate, distinguished errors whose message classifies as
    // `invalid_key` in error_codes.ts, so the route layer (Task 6) can
    // classify them the same way it classifies every other coder-turn error
    // instead of leaking a raw crypto/WebCrypto string.
    if (!encryptionConfigured()) {
      throw new Error(
        "Invalid encryption key: provider API key is encrypted but DEVX_ENCRYPTION_KEY " +
          "is not configured — this credential cannot be recovered without it. Set " +
          "DEVX_ENCRYPTION_KEY to the key used to encrypt it, or re-enter the API key.",
      );
    }
    try {
      return await decryptToken(row.api_key_encrypted, row.api_key_iv);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        "Invalid encryption key: failed to decrypt the stored provider API key with the " +
          `configured DEVX_ENCRYPTION_KEY (rotated or corrupted key) — cannot recover this ` +
          `credential. (${detail})`,
      );
    }
  }
  return row.api_key ?? null;
}

export async function writeProviderKeyFields(
  plaintext: string | null,
): Promise<ProviderKeyFields> {
  if (plaintext === null) return { api_key: null, api_key_encrypted: null, api_key_iv: null };
  if (!encryptionConfigured()) {
    warnOnce();
    return { api_key: plaintext, api_key_encrypted: null, api_key_iv: null };
  }
  const { ciphertext, iv } = await encryptToken(plaintext);
  return { api_key: null, api_key_encrypted: ciphertext, api_key_iv: iv };
}
