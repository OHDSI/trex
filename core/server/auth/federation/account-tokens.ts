// The DEK envelope, kept where Better Auth writes accounts.
//
// Not account.encryptOAuthTokens: its cipher is XChaCha20-Poly1305 over
// SHA-256(the Better Auth secret), it never covers idToken, and every row this
// installation already has holds base64 DEK output that its isLikelyEncrypted
// test does not recognise — it would hand the ciphertext back as plaintext
// rather than failing. There is no injectable cipher; setTokenUtil takes none.
//
// These hooks run in createWithHooks/updateWithHooks before the adapter write,
// and what they return is MERGED over the pending row:
// `actualData = { ...actualData, ...result.data }`
// (better-auth/dist/db/with-hooks.mjs:18-21, :55-58). That merge is the whole
// shape of this file. Declining to name a field does not omit it from the
// write — it hands the adapter the value Better Auth built, unsealed. So every
// token field present in the input must be named in the output, as ciphertext
// or as null; there is no third, "leave it alone" option, and believing there
// was is what put a non-string refresh token in the table in clear text.
//
// Nothing upstream of here is typed. @better-auth/core/src/oauth2/utils.ts:34
// maps `refreshToken: data.refresh_token` straight off the token response with
// no coercion and no schema, so the IdP's JSON decides what arrives: a string,
// `null`, `""`, a number, an object. Only a non-empty string is a token; the
// rest become SQL NULL, which is the one state every reader already handles.
//
// Only the three token fields are written. With resolveUser configured the
// plugin sets requireExactAccountBinding, so a hook that changed accountId,
// providerId or userId would abort the sign-in with
// account_hook_binding_conflict (dist/oauth2/link-account.mjs:111-114,
// 168-171, 232-235) — which is the behaviour we want, and the reason this hook
// never goes near them.
//
// The reader stays providers.ts's readAccountTokens; nothing else may SELECT
// these columns. Two Better Auth paths would misread them if they were ever
// reachable, and they are kept unreachable by oidc/mount.ts, which 404s
// everything outside /oauth2/ and /.well-known/:
//   - getAccessToken would hand the ciphertext to a caller as if it were a
//     token, because with encryptOAuthTokens false its decryptOAuthToken is a
//     pass-through. That is disclosure of a useless value, and a bug report.
//   - api/routes/account.mjs:369-379 reads the stored columns and feeds them
//     back into updateAccount, which would run them through this hook a second
//     time and store the ciphertext of the ciphertext. That one is corruption,
//     not disclosure: the original token is then unrecoverable.
import { encryptWithDek } from "../dek.ts";

const TOKEN_FIELDS = ["accessToken", "refreshToken", "idToken"] as const;

type AccountData = Record<string, unknown>;

async function sealTokens(data: AccountData): Promise<{ data: Record<string, string | null> }> {
  const out: Record<string, string | null> = {};
  for (const field of TOKEN_FIELDS) {
    const value = data[field];
    if (typeof value === "string" && value.length > 0) {
      try {
        out[field] = await encryptWithDek(value);
      } catch (err) {
        // Never log the value; name the column and re-throw. Failing the
        // sign-in is the point: a live upstream credential must not be stored
        // in the clear because encryption was unavailable.
        throw new Error(`could not encrypt upstream ${field}: ${err}`);
      }
      continue;
    }
    // Present but not a token. `undefined` is the only value that must NOT be
    // named: Better Auth has already filtered it out of an update
    // (dist/oauth2/link-account.mjs:151), and naming it would turn "the
    // upstream said nothing about this column" into "clear this column".
    // Everything else — null, "", a number — is named as null rather than left
    // to the merge, which would write it verbatim.
    //
    // This does NOT reproduce upsertAccount's
    // COALESCE(EXCLUDED."refreshToken", stored): an upstream that sends
    // `refresh_token: null` clears a stored refresh token. The hook cannot
    // prevent that, because updateWithHooks passes it the update payload and
    // not the `where` clause, so it cannot tell which row is being written.
    // Preserving the stored value has to happen where the old row is visible —
    // a BEFORE UPDATE trigger on trexdb.account (a new migration), which would
    // also cover every other writer. Not done here; recorded so the gap is not
    // rediscovered as a surprise.
    if (value !== undefined) out[field] = null;
  }
  return { data: out };
}

export const accountTokenHooks = {
  create: { before: (data: AccountData) => sealTokens(data) },
  update: { before: (data: AccountData) => sealTokens(data) },
};
