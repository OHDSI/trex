// id_token signing and verification.
//
// Signed RS256 with the key published in the JWKS, so a relying party verifies
// with the public half alone and never holds a key that could also mint tokens.
// The claim rules themselves live in claims.ts.

import { getActiveSigningKey, getVerificationKey } from "./keys.ts";
import { buildIdTokenClaims, type IdTokenClaims, type IdTokenOptions, type IdTokenUser } from "./claims.ts";

export type { IdTokenClaims, IdTokenOptions, IdTokenUser };
export { buildIdTokenClaims, DEFAULT_ID_TOKEN_TTL_SECONDS } from "./claims.ts";

const encoder = new TextEncoder();

const base64urlBytes = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const base64urlText = (s: string): string => base64urlBytes(encoder.encode(s));

const base64urlDecode = (v: string): Uint8Array =>
  Uint8Array.from(
    atob(v.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(v.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );

export async function signIdToken(user: IdTokenUser, opts: IdTokenOptions): Promise<string> {
  const key = await getActiveSigningKey();
  const header = base64urlText(JSON.stringify({ alg: "RS256", typ: "JWT", kid: key.kid }));
  const payload = base64urlText(JSON.stringify(buildIdTokenClaims(user, opts)));
  const signingInput = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    key.privateKey,
    encoder.encode(signingInput).buffer as ArrayBuffer,
  );

  return `${signingInput}.${base64urlBytes(new Uint8Array(signature))}`;
}

/**
 * Verifies an id_token this provider issued: signature against the published key
 * named in the header, then issuer and expiry. Returns null rather than throwing,
 * so a caller cannot mistake a rejected token for a valid one by forgetting a
 * try/catch.
 */
export async function verifyIdToken(
  token: string,
  expectedIssuer: string,
): Promise<IdTokenClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header: { alg?: string; kid?: string };
  let claims: IdTokenClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
  } catch {
    return null;
  }

  // Pinned to RS256: taking the header's word for the algorithm is how "alg:
  // none" and HMAC-with-the-public-key forgeries get in.
  if (header.alg !== "RS256" || !header.kid) return null;

  const key = await getVerificationKey(header.kid);
  if (!key) return null;

  const ok = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    base64urlDecode(parts[2]).buffer as ArrayBuffer,
    encoder.encode(`${parts[0]}.${parts[1]}`).buffer as ArrayBuffer,
  );
  if (!ok) return null;

  if (claims.iss !== expectedIssuer) return null;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) return null;

  return claims;
}
