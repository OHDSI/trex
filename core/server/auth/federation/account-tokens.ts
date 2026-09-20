// The DEK envelope, kept where Better Auth writes accounts.
//
// Not account.encryptOAuthTokens: its cipher is XChaCha20-Poly1305 over
// SHA-256(the Better Auth secret), it never covers idToken, and every row this
// installation already has holds base64 DEK output that its isLikelyEncrypted
// test does not recognise — it would hand the ciphertext back as plaintext
// rather than failing. There is no injectable cipher; setTokenUtil takes none.
//
// These hooks run in createWithHooks/updateWithHooks before the adapter write
// (better-auth/dist/db/with-hooks.mjs:7-41), and what they return is merged
// over the pending row: `actualData = { ...actualData, ...result.data }`. So a
// field this file does not name is left exactly as Better Auth built it.
//
// Only the three token fields are rewritten. With resolveUser configured the
// plugin sets requireExactAccountBinding, so a hook that changed accountId,
// providerId or userId would abort the sign-in with
// account_hook_binding_conflict (dist/oauth2/link-account.mjs:111-114,
// 168-171, 232-235) — which is the behaviour we want, and the reason this hook
// never goes near them.
//
// The reader stays providers.ts's readAccountTokens. Better Auth's own
// getAccessToken would hand these back as ciphertext, since with
// encryptOAuthTokens false its decryptOAuthToken is a pass-through; the routes
// that would do that are 404'd by oidc/mount.ts, and nothing else may SELECT
// these columns directly.
import { encryptWithDek } from "../dek.ts";

const TOKEN_FIELDS = ["accessToken", "refreshToken", "idToken"] as const;

type AccountData = Record<string, unknown>;

async function sealTokens(data: AccountData): Promise<{ data: Record<string, string> }> {
  const out: Record<string, string> = {};
  for (const field of TOKEN_FIELDS) {
    const value = data[field];
    // An absent token must stay absent. Encrypting "" produces a perfectly
    // good ciphertext, and Better Auth's update path only filters undefined
    // (dist/oauth2/link-account.mjs:151) — so a sign-in that carried no
    // refresh token would overwrite the stored one with the encryption of
    // nothing. A null must stay a NULL column for the same reason.
    if (typeof value !== "string" || value.length === 0) continue;
    try {
      out[field] = await encryptWithDek(value);
    } catch (err) {
      // Never log the value; name the column and re-throw. Failing the sign-in
      // is the point: a live upstream credential must not be stored in the
      // clear because encryption was unavailable.
      throw new Error(`could not encrypt upstream ${field}: ${err}`);
    }
  }
  return { data: out };
}

export const accountTokenHooks = {
  create: { before: (data: AccountData) => sealTokens(data) },
  update: { before: (data: AccountData) => sealTokens(data) },
};
