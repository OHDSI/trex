// Signed, expiring `state` for the trex-native OAuth broker (spec §5, §7).
//
// The OAuth start/callback routes are served WITHOUT a trex JWT (they are
// auth-exempt at the proxy, like channel routes — an OAuth provider redirects
// the user's browser back to the callback with no trex credential). The ONLY
// thing that authenticates a callback is this signed `state`: an HMAC-SHA256
// MAC over the {session, principalType, principalId, connector, nonce, exp}
// payload keyed by a server secret. It is the anti-CSRF / anti-replay token —
//   * tamper (any field changed) → the MAC no longer verifies → rejected;
//   * replay past `exp` → rejected;
//   * the `nonce` makes each authorization request's state unique.
// verifyState MUST be called (and MUST return ok) before ANY redirect to a
// provider or ANY token write. The secret never leaves the server.
//
// Dependency-free (Web Crypto only) so it runs unchanged in the agent worker.

export interface StatePayload {
  /** The session id whose turn is parked awaiting this authorization. */
  session: string;
  /** "user" | "app" | a channel principal type — the token's owner class. */
  principalType: string;
  /** The principal id the minted token is stored under ("__app__" for app). */
  principalId: string;
  /** The connector id this authorization is for. */
  connector: string;
  /** Single-use random value — anti-replay/CSRF. */
  nonce: string;
  /** Absolute expiry, epoch milliseconds. */
  exp: number;
}

export type VerifyResult =
  | { ok: true; payload: StatePayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? norm : norm + "=".repeat(4 - (norm.length % 4));
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret).buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data).buffer as ArrayBuffer);
  return new Uint8Array(sig);
}

// Length-independent, content-constant-time comparison of two ASCII strings
// (the base64url signatures). Never short-circuits on the first differing
// char, so it does not leak how much of a forged signature was correct.
function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Sign a state payload → `${base64url(json)}.${base64url(hmac)}`. */
export async function signState(payload: StatePayload, secret: string): Promise<string> {
  if (!secret) throw new Error("signState: server secret is required");
  const body = b64urlFromBytes(encoder.encode(JSON.stringify(payload)));
  const sig = b64urlFromBytes(await hmac(secret, body));
  return `${body}.${sig}`;
}

/**
 * Verify + decode a signed state string. Returns the payload only when the MAC
 * verifies AND the payload is well-formed AND it has not expired. A tampered
 * body, a forged signature, a malformed string, or a past `exp` all return
 * `{ ok: false, reason }` — never a payload. Callers MUST NOT act on a
 * `{ ok: false }` result (no redirect, no token write).
 */
export async function verifyState(str: string, secret: string, now: number = Date.now()): Promise<VerifyResult> {
  if (!secret) throw new Error("verifyState: server secret is required");
  if (typeof str !== "string") return { ok: false, reason: "malformed" };
  const dot = str.indexOf(".");
  if (dot <= 0 || dot === str.length - 1) return { ok: false, reason: "malformed" };
  const body = str.slice(0, dot);
  const sig = str.slice(dot + 1);
  const expected = b64urlFromBytes(await hmac(secret, body));
  if (!timingSafeEqual(sig, expected)) return { ok: false, reason: "bad_signature" };

  let payload: StatePayload;
  try {
    payload = JSON.parse(decoder.decode(b64urlToBytes(body)));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object") return { ok: false, reason: "malformed" };
  const { session, principalType, principalId, connector, nonce, exp } = payload;
  if (
    typeof session !== "string" || typeof principalType !== "string" ||
    typeof principalId !== "string" || typeof connector !== "string" ||
    typeof nonce !== "string" || typeof exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
