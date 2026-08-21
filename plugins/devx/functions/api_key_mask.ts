// The non-secret display mask every GET that returns a provider credential
// emits in place of the real key, and the predicate that recognises one
// coming back in.
//
// Both halves live here because they are two sides of one contract: GET
// /settings and GET /provider-configs hand the client a mask, and a client
// that echoes its whole loaded form back on save will hand that mask straight
// to PUT. Nothing downstream can tell a mask from a key by looking at it
// (there is no reserved character — the shape is just "first 8, ellipsis,
// last 4"), so the only reliable test is "does this equal the mask of the key
// we currently store", which is what isMaskOf answers.

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
