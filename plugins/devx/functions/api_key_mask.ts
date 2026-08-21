// The non-secret display mask every GET that returns a provider credential
// emits in place of the real key, and the guard that stops a client handing
// one back as though it were a credential.
//
// These live together because they are one contract: GET /settings and GET
// /provider-configs hand the client a mask, and a client that echoes its whole
// loaded form back on save hands that mask straight to PUT. Nothing downstream
// can tell a mask from a key by looking at it (there is no reserved character
// — the shape is just "first 8, ellipsis, last 4"), so the only reliable test
// is "does this equal the mask of the key we currently store", which is what
// isMaskOf answers.
//
// A masked string is not the only destructive payload that round trip
// produces. A client that unpacks the credential into per-field inputs before
// re-packing them on save gets EMPTY fields — the mask never parses — and
// sends a structurally valid credential blob carrying no credential. See
// isEmptyCredentialBlob.
import { readProviderKey } from "./provider_key.ts";

// Minimal shape every call site's `sql` helper satisfies, same as
// provider_key.ts's.
type SqlFn = (query: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

// The mask itself. Shape is load-bearing: it is what the SQL CASE
// expressions produced directly in the column before encryption existed, so
// changing it would silently change what every client has cached.
export function maskKey(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  return plaintext.substring(0, 8) + "..." + plaintext.slice(-4);
}

// True when `candidate` is exactly the mask this module would produce for
// `plaintext` — i.e. the caller sent back the masked value it was given
// rather than a real credential, and the request must not be treated as a
// key update.
//
// Deliberately an equality against the stored key's own mask rather than a
// pattern match on "looks masked": a real credential can contain an ellipsis
// too, and a pattern match would refuse to store it. The residual case is a
// key whose plaintext is byte-identical to its own mask (possible only for a
// 15-character key of the exact form `xxxxxxxx...xxxx`); such a key cannot be
// re-saved through a masking round trip, which is preferable to the reverse
// error of overwriting a live credential with its mask.
export function isMaskOf(candidate: unknown, plaintext: string | null | undefined): boolean {
  if (typeof candidate !== "string" || !plaintext) return false;
  return candidate === maskKey(plaintext);
}

// True when `candidate` is a JSON credential object with nothing in it —
// `{}`, `{"bearerToken":""}`, `{"accessKeyId":"","secretAccessKey":""}`.
//
// This is the OTHER thing a masking round trip produces. A client that shows
// bedrock credentials as separate bearer-token / access-key inputs has to
// JSON.parse the stored value to fill them; the value it gets is the mask,
// which throws, so the inputs stay empty and the next save re-packs those
// empty strings into a blob and posts it. The blob is not the mask, so
// isMaskOf does not catch it, and it overwrites a live credential.
//
// Refusing to store it loses nothing: agent.ts's bedrock branch and
// resolveModel both treat a JSON object with no usable credential field as
// absent (falling back to the environment), and deriveAuthShape reports it as
// having no recognizable structure. A value that never resolves to a
// credential is not worth destroying one for.
//
// Deliberately narrower than "the three bedrock fields are absent or empty":
// an object with some OTHER non-empty field (`{"foo":"bar"}`) is kept. Only
// bedrock reads this column as structured JSON — every other provider sends
// the stored string verbatim as an auth header — so discarding a JSON-shaped
// value that still carries content would be this guard inventing a rule no
// read site applies. Everything with no content at all is caught either way.
export function isEmptyCredentialBlob(candidate: unknown): boolean {
  if (typeof candidate !== "string") return false;
  const trimmed = candidate.trim();
  // Cheap reject before parsing: ordinary opaque keys (sk-..., ghp_...) are
  // not JSON objects and must never reach the emptiness test.
  if (!trimmed.startsWith("{")) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return false;
  return Object.values(parsed as Record<string, unknown>).every(
    (v) => v === null || v === undefined || v === "",
  );
}

// Resolves the caller's currently stored devx.settings credential, for
// comparison against an incoming one. Never throws: an undecryptable stored
// key yields null, which makes the guard below decline to claim the incoming
// value is an echo of it. Extracted from index.ts's PUT /settings so the guard
// is reachable from a test with a fake `sql` — index.ts itself has no
// injectable one.
export async function resolveStoredSettingsKey(sql: SqlFn, userId: string): Promise<string | null> {
  const row = (await sql(
    `SELECT api_key, api_key_encrypted, api_key_iv FROM devx.settings WHERE user_id = $1`,
    [userId],
  )).rows[0] as Record<string, string | null> | undefined;
  if (!row) return null;
  try {
    return await readProviderKey(row);
  } catch (err) {
    // Undecryptable: there is no mask to compare against, so the caller gets
    // null and the incoming value is stored. The stored credential is already
    // unusable and refusing the write would leave no way to replace it.
    console.warn(
      "[devx] could not resolve the stored settings key while checking an incoming one:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// The whole PUT /settings key guard, in one testable call: given the api_key a
// request wants to store, returns a reason string when it must be DISCARDED
// (and the stored credential left alone), or null when it is a real update.
//
// Callers must not pass an explicit clear (null): clearing a key is a genuine
// intent that this guard has no business overriding.
export async function discardableKeyUpdateReason(
  candidate: string,
  sql: SqlFn,
  userId: string,
): Promise<string | null> {
  if (isEmptyCredentialBlob(candidate)) {
    return "it is a credential blob with no credential in it (an unpacked mask, re-packed empty)";
  }
  const stored = await resolveStoredSettingsKey(sql, userId);
  if (isMaskOf(candidate, stored)) {
    return "it is the masked value this row's key is displayed as, not a key";
  }
  return null;
}
