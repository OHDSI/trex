import { pool } from "../db.ts";

const encoder = new TextEncoder();

async function sha256hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Valid key prefixes: trex_ (MCP keys) and sbp_ (Supabase CLI keys)
const KEY_PREFIXES = ["trex_", "sbp_"];

export interface ApiKeyResult {
  id: string;
  key: string;
}

export async function generateApiKey(
  userId: string,
  name: string,
  expiresAt?: Date,
  prefix: string = "trex_",
): Promise<ApiKeyResult> {
  // sbp_ keys need exactly 40 hex chars after prefix to match Supabase CLI pattern
  const hexLen = prefix === "sbp_" ? 20 : 24;
  const raw = prefix + randomHex(hexLen);
  const keyHash = await sha256hex(raw);
  const keyPrefix = raw.slice(0, 13);

  const result = await pool.query(
    `INSERT INTO trexdb.api_key (name, key_hash, key_prefix, "userId", "expiresAt")
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [name, keyHash, keyPrefix, userId, expiresAt || null],
  );

  return { id: result.rows[0].id, key: raw };
}

export interface ValidatedUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export async function validateApiKey(
  key: string,
): Promise<ValidatedUser | null> {
  if (!KEY_PREFIXES.some((p) => key.startsWith(p))) return null;

  const keyHash = await sha256hex(key);

  const result = await pool.query(
    `UPDATE trexdb.api_key ak
     SET "lastUsedAt" = NOW()
     FROM trexdb."user" u
     WHERE ak.key_hash = $1
       AND ak."revokedAt" IS NULL
       AND (ak."expiresAt" IS NULL OR ak."expiresAt" > NOW())
       AND ak."userId" = u.id
       AND u.banned = false
       AND u.role = 'admin'
     RETURNING u.id, u.name, u.email, u.role`,
    [keyHash],
  );

  if (result.rows.length === 0) return null;
  return result.rows[0];
}
