// OIDC signing keys.
//
// id_tokens are signed RS256, not with the HS256 secret the native IdP uses for
// its own access tokens: a relying party must be able to verify a token without
// holding a key that would also let it mint one. The public half is published
// through the JWKS endpoint; the private half is stored encrypted with the same
// DEK the rest of trex's secrets use.

import { pool } from "../../db.ts";
import { decryptSecret, encryptSecret } from "../crypto.ts";

export interface SigningKey {
  kid: string;
  alg: "RS256";
  privateKey: CryptoKey;
}

export interface PublicJwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n: string;
  e: string;
}

const ALGORITHM: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
  hash: "SHA-256",
};

let cached: SigningKey | null = null;

/** Cleared by rotation and by tests; the key is otherwise stable for the process. */
export function _resetSigningKeyCache(): void {
  cached = null;
}

const toBase64 = (buf: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buf)));

const fromBase64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function importPrivateKey(pkcs8Base64: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "pkcs8",
    fromBase64(pkcs8Base64).buffer as ArrayBuffer,
    { name: ALGORITHM.name, hash: ALGORITHM.hash },
    false,
    ["sign"],
  );
}

async function generate(): Promise<{ kid: string; privateKey: CryptoKey; jwk: PublicJwk; pkcs8: string }> {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ["sign", "verify"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const pkcs8 = toBase64(await crypto.subtle.exportKey("pkcs8", pair.privateKey));

  // Derived from the public modulus so the same key always yields the same kid,
  // and two nodes generating concurrently cannot collide on a counter.
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(publicJwk.n ?? "").buffer as ArrayBuffer,
  );
  const kid = Array.from(new Uint8Array(digest).slice(0, 16))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    kid,
    privateKey: pair.privateKey,
    pkcs8,
    jwk: {
      kid,
      kty: publicJwk.kty ?? "RSA",
      alg: "RS256",
      use: "sig",
      n: publicJwk.n ?? "",
      e: publicJwk.e ?? "AQAB",
    },
  };
}

/**
 * Returns the active signing key, creating one on first use.
 *
 * Two nodes starting together can both generate; the insert is
 * ON CONFLICT DO NOTHING and the reader then takes whichever landed, so they
 * converge on one key rather than fighting over it.
 */
export async function getActiveSigningKey(): Promise<SigningKey> {
  if (cached) return cached;

  const existing = await pool.query<{ kid: string; private_key_encrypted: string }>(
    `SELECT kid, private_key_encrypted FROM trexdb.oidc_signing_key
      WHERE is_active ORDER BY created_at DESC LIMIT 1`,
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    cached = {
      kid: row.kid,
      alg: "RS256",
      privateKey: await importPrivateKey(await decryptSecret(row.private_key_encrypted)),
    };
    return cached;
  }

  const fresh = await generate();
  await pool.query(
    `INSERT INTO trexdb.oidc_signing_key (kid, alg, private_key_encrypted, public_jwk, is_active)
     VALUES ($1, 'RS256', $2, $3, true)
     ON CONFLICT (kid) DO NOTHING`,
    [fresh.kid, await encryptSecret(fresh.pkcs8), JSON.stringify(fresh.jwk)],
  );

  // Re-read rather than trusting the generated pair: another node may have won
  // the race, and every node must sign with the key the JWKS advertises.
  cached = null;
  return await getActiveSigningKey();
}

/**
 * Imports a published key for verification, by kid. Returns null for a kid this
 * provider never published, so a token naming an unknown key is rejected rather
 * than trusted.
 */
export async function getVerificationKey(kid: string): Promise<CryptoKey | null> {
  if (!kid) return null;
  const result = await pool.query<{ public_jwk: PublicJwk }>(
    `SELECT public_jwk FROM trexdb.oidc_signing_key WHERE kid = $1`,
    [kid],
  );
  if (!result.rows.length) return null;
  const jwk = result.rows[0].public_jwk;
  return await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: ALGORITHM.name, hash: ALGORITHM.hash },
    false,
    ["verify"],
  );
}

/**
 * Every published key, active first. Retired keys stay listed until their last
 * id_token has expired so rotation does not break verification mid-session.
 */
export async function getJwks(): Promise<{ keys: PublicJwk[] }> {
  const result = await pool.query<{ public_jwk: PublicJwk }>(
    `SELECT public_jwk FROM trexdb.oidc_signing_key
      ORDER BY is_active DESC, created_at DESC`,
  );
  return { keys: result.rows.map((r) => r.public_jwk) };
}
