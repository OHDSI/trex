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

export type ResolvedCredential = AccessTokenClaims | { role: "anon" | "service_role" };

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
  return candidate.startsWith(PUBLISHABLE_PREFIX) || candidate.startsWith(SECRET_PREFIX);
}

let sbKeysCache: SbKeys | null = null;

export function _setSbKeysCacheForTest(keys: SbKeys | null): void {
  sbKeysCache = keys;
}

// Filled in by Task 2 (DB-backed ensure). Task 1 only reads the cache.
export async function getSbKeys(): Promise<SbKeys> {
  if (!sbKeysCache) throw new Error("sb keys not initialized — call ensureSbKeys() at boot");
  return sbKeysCache;
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
