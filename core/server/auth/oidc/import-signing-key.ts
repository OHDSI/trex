// Carries trex's RS256 key into the jwt plugin's table under the same kid.
// Without this the plugin mints a fresh key on first use and every id_token
// already in a browser stops verifying until its holder signs in again.
import { symmetricEncrypt } from "better-auth/crypto";
import { pool } from "../../db.ts";
import { decryptSecret } from "../crypto.ts";
import { auth } from "../better-auth.ts";

/**
 * Idempotent, and meant to run on every boot: the row is written once and every
 * later call is a single SELECT. It is a no-op on an installation that never
 * ran the hand-written provider and so has no key to carry over — there the
 * plugin mints its own first key, which is correct because nothing has ever
 * been signed.
 */
export async function importOidcSigningKey(): Promise<{ kid: string; imported: boolean }> {
  const active = await pool.query<
    { kid: string; private_key_encrypted: string; public_jwk: unknown }
  >(
    `SELECT kid, private_key_encrypted, public_jwk FROM trexdb.oidc_signing_key
      WHERE is_active ORDER BY created_at DESC LIMIT 1`,
  );
  if (!active.rows.length) return { kid: "", imported: false };
  const row = active.rows[0];

  const already = await pool.query(`SELECT 1 FROM trexdb.jwks WHERE id = $1`, [row.kid]);
  if (already.rows.length) return { kid: row.kid, imported: false };

  // keys.ts imports the stored PKCS#8 non-extractable, which is right for
  // signing and wrong here: the plugin stores a JWK, so it has to come back out.
  const pkcs8 = Uint8Array.from(
    atob(await decryptSecret(row.private_key_encrypted)),
    (c) => c.charCodeAt(0),
  );
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["sign"],
  );
  const privateJwk = JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey));

  // secretConfig is `string | SecretConfig` and may carry a key version, so it
  // is read off the live context rather than reconstructed from options.secret.
  const { secretConfig } = await auth.$context;

  // JSON-encoded, not the bare ciphertext. createJwk writes
  // `JSON.stringify(await symmetricEncrypt(...))` and resolveSigningKey unwraps
  // with `symmetricDecrypt({ data: JSON.parse(key.privateKey) })`
  // (better-auth@1.7.5 plugins/jwt/utils.ts, plugins/jwt/sign.ts). The
  // ciphertext is bare hex, which JSON.parse rejects, so a row holding it
  // surfaces as "Failed to decrypt private key" on the first token signed.
  await pool.query(
    `INSERT INTO trexdb.jwks (id, "publicKey", "privateKey", alg, "createdAt")
     VALUES ($1, $2, $3, 'RS256', NOW())
     ON CONFLICT (id) DO NOTHING`,
    [
      row.kid,
      JSON.stringify(row.public_jwk),
      JSON.stringify(await symmetricEncrypt({ key: secretConfig, data: privateJwk })),
    ],
  );
  return { kid: row.kid, imported: true };
}
