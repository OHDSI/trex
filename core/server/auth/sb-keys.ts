import { type AccessTokenClaims, verifyAccessToken } from "./jwt.ts";

export interface SbKeyRecord {
  id: string;
  key: string;
  inserted_at: string;
}

export interface SbKeys {
  publishable: SbKeyRecord;
  secret: SbKeyRecord;
}

export type ResolvedCredential = AccessTokenClaims | {
  role: "anon" | "service_role";
};

const PUBLISHABLE_PREFIX = "sb_publishable_";
const SECRET_PREFIX = "sb_secret_";

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function randomSuffix(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

export function generatePublishableKey(): string {
  return PUBLISHABLE_PREFIX + randomSuffix();
}

export function generateSecretKey(): string {
  return SECRET_PREFIX + randomSuffix();
}

export function isSbKey(candidate: string): boolean {
  return candidate.startsWith(PUBLISHABLE_PREFIX) ||
    candidate.startsWith(SECRET_PREFIX);
}

let sbKeysCache: SbKeys | null = null;

export function _setSbKeysCacheForTest(keys: SbKeys | null): void {
  sbKeysCache = keys;
}

async function persistSbKey(
  settingKey: string,
  record: SbKeyRecord,
): Promise<void> {
  const { pool } = await import("../db.ts");
  await pool.query(
    `INSERT INTO trexdb.setting (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [settingKey, JSON.stringify(record)],
  );
}

function parseSbKeyRow(value: unknown): SbKeyRecord | null {
  const obj = typeof value === "string" ? JSON.parse(value) : value;
  if (obj && typeof obj.id === "string" && typeof obj.key === "string") {
    return obj as SbKeyRecord;
  }
  return null;
}

function mintRecord(key: string): SbKeyRecord {
  return {
    id: crypto.randomUUID(),
    key,
    inserted_at: new Date().toISOString(),
  };
}

/**
 * Ensure sb keys exist in trexdb.setting, minting on first run. Random
 * secrets, not derived from the JWT signing key — the boot hard-cut purge
 * in index.ts must not touch them.
 */
export async function ensureSbKeys(): Promise<SbKeys> {
  const { pool } = await import("../db.ts");
  const existing = await pool.query(
    `SELECT key, value FROM trexdb.setting WHERE key IN ('auth.publishableKey', 'auth.secretKey')`,
  );
  const found: Record<string, SbKeyRecord> = {};
  for (const row of existing.rows) {
    const rec = parseSbKeyRow(row.value);
    if (rec) found[row.key] = rec;
  }

  let publishable = found["auth.publishableKey"];
  if (!publishable) {
    publishable = mintRecord(generatePublishableKey());
    await persistSbKey("auth.publishableKey", publishable);
  }
  let secret = found["auth.secretKey"];
  if (!secret) {
    secret = mintRecord(generateSecretKey());
    await persistSbKey("auth.secretKey", secret);
  }

  sbKeysCache = { publishable, secret };
  console.log(`[auth] Publishable key: ${publishable.key.slice(0, 20)}...`);
  console.log(`[auth] Secret key: ${secret.key.slice(0, 14)}...`);
  return sbKeysCache;
}

export async function getSbKeys(): Promise<SbKeys> {
  return sbKeysCache ?? await ensureSbKeys();
}

export async function rotatePublishableKey(): Promise<string> {
  const record = mintRecord(generatePublishableKey());
  await persistSbKey("auth.publishableKey", record);
  if (sbKeysCache) sbKeysCache = { ...sbKeysCache, publishable: record };
  else await ensureSbKeys();
  return record.key;
}

export async function rotateSecretKey(): Promise<string> {
  const record = mintRecord(generateSecretKey());
  await persistSbKey("auth.secretKey", record);
  if (sbKeysCache) sbKeysCache = { ...sbKeysCache, secret: record };
  else await ensureSbKeys();
  return record.key;
}

/**
 * Rewrite sb keys in `apikey`/`Authorization` headers to the legacy JWT of
 * the same role, for proxies whose vendored backends only validate legacy
 * JWTs. Invalid sb keys pass through so the downstream validator rejects.
 */
export async function translateSbHeaders(
  headers: Headers,
  legacy?: { anonKey: string; serviceRoleKey: string },
): Promise<void> {
  const legacyFor = async (candidate: string): Promise<string | null> => {
    const role = await resolveSbKeyRole(candidate);
    if (!role) return null;
    const keys = legacy ??
      await (await import("./api-keys.ts")).ensureAuthKeys();
    return role === "anon" ? keys.anonKey : keys.serviceRoleKey;
  };

  const apikey = headers.get("apikey");
  if (apikey && isSbKey(apikey)) {
    const swapped = await legacyFor(apikey);
    if (swapped) headers.set("apikey", swapped);
  }
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer sb_")) {
    const swapped = await legacyFor(auth.slice(7));
    if (swapped) headers.set("authorization", `Bearer ${swapped}`);
  }
}

// Constant-time over the max length; length mismatch flips a bit instead of
// short-circuiting.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

export async function resolveSbKeyRole(
  candidate: string,
): Promise<"anon" | "service_role" | null> {
  let keys: SbKeys;
  try {
    keys = await getSbKeys();
  } catch {
    return null;
  }
  if (timingSafeEqual(candidate, keys.publishable.key)) return "anon";
  if (timingSafeEqual(candidate, keys.secret.key)) return "service_role";
  return null;
}

/**
 * Unified credential resolver: new-format sb keys resolve by equality,
 * everything else falls back to legacy JWT verification.
 */
export async function resolveApiCredential(
  token: string,
): Promise<ResolvedCredential | null> {
  if (isSbKey(token)) {
    const role = await resolveSbKeyRole(token);
    return role ? { role } : null;
  }
  return await verifyAccessToken(token);
}
