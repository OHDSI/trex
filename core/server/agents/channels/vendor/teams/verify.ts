// Reimplemented from eve@0.19.0 dist/src/public/channels/teams/verify.js
// (Apache-2.0). eve's `verify.js` validates the inbound Azure Bot Framework JWT
// with **jose** (`importJWK` + `jwtVerify` from eve's bundled `#compiled/jose`)
// and imports `#internal/logging` — both eve runtime primitives absent in the
// Deno worker — so the WHOLE validator is REIMPLEMENTED on **WebCrypto**
// (`crypto.subtle`, RSASSA-PKCS1-v1_5 + SHA-256, `importKey("jwk", …)`). The
// SECURITY SEMANTICS are byte-for-byte eve's (which are the Bot Framework
// requirements):
//   1. Bearer token from `Authorization` (else reject).
//   2. RS256 signature over `header.payload`, verified against the JWK selected
//      from the Bot Framework JWKS by `kid` (or `x5t`). The JWKS is fetched from
//      the OpenID metadata's `jwks_uri`, CACHED (24h TTL), and REFRESHED once on
//      an unknown `kid` (Bot Framework rotates keys).
//   3. `alg` MUST be `RS256` — `none`/HS*/any other alg is REJECTED before the
//      signature step (accepting `alg:none` would be a total auth bypass).
//   4. `iss === "https://api.botframework.com"`, `aud === MICROSOFT_APP_ID`,
//      `exp`/`nbf` within a 300s skew (eve's `clockTolerance`).
// This JWT is the ONLY authentication for the webhook, so `verifyTeamsInbound`
// FAILS CLOSED — missing app id / unfetchable JWKS / unknown kid after refresh /
// any claim mismatch → it returns `null` (never throws) so the route can 401
// BEFORE any session work. The JWKS fetch is injectable (`opts.jwks`) so tests
// exercise the full validator against an ephemeral RSA keypair with no network.
// NOTE: like eve, the `serviceUrl` claim is NOT cross-checked against the
// Activity's serviceUrl (jose's `jwtVerify` checks only aud/iss/exp/nbf).
// See vendor/VENDOR.md.

import { base64UrlToBytes, base64UrlToString, isObject } from "./shared.ts";
import { type TeamsCredential, resolveTeamsAppId } from "./api.ts";

/** Fetch implementation override for tests or non-standard runtimes. */
export type TeamsFetch = typeof fetch;

/** A JWK as it appears in the Bot Framework JWKS (RSA public key + selectors). */
export type TeamsJsonWebKey = JsonWebKey & { readonly kid?: string; readonly x5t?: string };

/** An injected JWKS: a static key set, or a resolver (called with `{forceRefresh}`). */
export type TeamsJwksSource =
  | readonly TeamsJsonWebKey[]
  | ((opts: { forceRefresh: boolean }) => readonly TeamsJsonWebKey[] | Promise<readonly TeamsJsonWebKey[]>);

/**
 * Caller-supplied inbound verifier. Replaces the JWT check when an integration
 * authenticates forwarded requests upstream. Return falsy to reject; a string to
 * accept and use it as the (rewritten) raw body; any other truthy value to
 * accept and keep the original body.
 */
export type TeamsWebhookVerifier = (request: Request, body: string) => unknown | Promise<unknown>;

export interface TeamsVerifyOptions {
  /** The bot's app id — the required `aud`. Falls back to `MICROSOFT_APP_ID` / `TEAMS_APP_ID`. */
  readonly appId?: TeamsCredential;
  /** Injected JWKS (tests / upstream key mirrors). When set, the network fetch is bypassed. */
  readonly jwks?: TeamsJwksSource;
  /** Fetch override for the OpenID-metadata + JWKS requests. */
  readonly fetch?: TeamsFetch;
  /** Override the OpenID metadata document URL. */
  readonly openIdMetadataUrl?: string;
  /** Override the JWKS URL (skips the OpenID-metadata lookup). */
  readonly jwksUrl?: string;
  /** Clock skew tolerance in seconds for `exp`/`nbf`. Defaults to eve's 300. */
  readonly maxSkewSeconds?: number;
  /** Required issuer. Defaults to the Bot Framework issuer. */
  readonly issuer?: string;
  /** Caller-supplied inbound verifier (replaces the JWT check for upstream-authenticated forwards). */
  readonly webhookVerifier?: TeamsWebhookVerifier;
  /** Clock injection for deterministic tests (epoch ms). Defaults to `Date.now`. */
  readonly now?: () => number;
}

const BOT_FRAMEWORK_ISSUER = "https://api.botframework.com";
const DEFAULT_OPENID_METADATA_URL = "https://login.botframework.com/v1/.well-known/openidconfiguration";
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SKEW_SECONDS = 300;

// Module-level JWKS cache keyed by the resolved metadata/JWKS source. Bot
// Framework keys rotate slowly, so a 24h TTL is ample; an unknown `kid` forces
// a refresh regardless of the TTL (see loadJwks).
const jwksCache = new Map<string, { keys: readonly TeamsJsonWebKey[]; fetchedAtMs: number }>();

/** Clears the JWKS cache (tests / key rotation). */
export function clearTeamsJwksCache(): void {
  jwksCache.clear();
}

function readBearerToken(header: string): string | null {
  const [scheme, token] = header.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

async function fetchJwksFromNetwork(opts: TeamsVerifyOptions): Promise<readonly TeamsJsonWebKey[]> {
  const doFetch = opts.fetch ?? fetch;
  const jwksUrl = opts.jwksUrl ?? await fetchJwksUrl(opts, doFetch);
  const res = await doFetch(jwksUrl, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`teamsChannel: JWKS route returned HTTP ${res.status}.`);
  const doc = await res.json();
  if (!isObject(doc) || !Array.isArray(doc.keys)) throw new Error("teamsChannel: JWKS response is malformed.");
  return doc.keys.filter(isObject) as TeamsJsonWebKey[];
}

async function fetchJwksUrl(opts: TeamsVerifyOptions, doFetch: TeamsFetch): Promise<string> {
  const res = await doFetch(opts.openIdMetadataUrl ?? DEFAULT_OPENID_METADATA_URL, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`teamsChannel: OpenID metadata route returned HTTP ${res.status}.`);
  const doc = await res.json();
  if (!isObject(doc) || typeof doc.jwks_uri !== "string") {
    throw new Error("teamsChannel: OpenID metadata response is missing jwks_uri.");
  }
  return doc.jwks_uri;
}

/**
 * Loads the JWKS. An injected `opts.jwks` short-circuits the network (a static
 * array, or a resolver invoked with `{forceRefresh}`). Otherwise the JWKS is
 * fetched from the OpenID metadata's `jwks_uri` and cached with a 24h TTL;
 * `forceRefresh` (set when a `kid` is unknown) bypasses the cache.
 */
async function loadJwks(opts: TeamsVerifyOptions, forceRefresh: boolean): Promise<readonly TeamsJsonWebKey[]> {
  if (opts.jwks !== undefined) {
    return typeof opts.jwks === "function" ? await opts.jwks({ forceRefresh }) : opts.jwks;
  }
  const cacheKey = opts.jwksUrl ?? opts.openIdMetadataUrl ?? DEFAULT_OPENID_METADATA_URL;
  const nowMs = opts.now?.() ?? Date.now();
  const cached = jwksCache.get(cacheKey);
  if (!forceRefresh && cached !== undefined && nowMs - cached.fetchedAtMs < JWKS_TTL_MS) return cached.keys;
  const keys = await fetchJwksFromNetwork(opts);
  jwksCache.set(cacheKey, { keys, fetchedAtMs: nowMs });
  return keys;
}

function selectJwk(keys: readonly TeamsJsonWebKey[], header: { kid?: string; x5t?: string }): TeamsJsonWebKey | undefined {
  const kid = typeof header.kid === "string" ? header.kid : undefined;
  const x5t = typeof header.x5t === "string" ? header.x5t : undefined;
  return keys.find((k) => (kid !== undefined && k.kid === kid) || (x5t !== undefined && k.x5t === x5t)) ??
    (keys.length === 1 ? keys[0] : undefined);
}

async function verifyRs256Signature(token: string, jwk: TeamsJsonWebKey): Promise<boolean> {
  if (jwk.kty !== "RSA" || typeof jwk.n !== "string" || typeof jwk.e !== "string") {
    throw new Error("teamsChannel: JWKS key is not an RSA public key.");
  }
  const dot = token.lastIndexOf(".");
  const signingInput = token.slice(0, dot);
  const signature = base64UrlToBytes(token.slice(dot + 1));
  // Import a MINIMAL RSA public JWK — stripping `alg`/`use`/`key_ops` so a real
  // Bot Framework key (which may omit or diverge on those) imports cleanly; the
  // algorithm is pinned by us, not the key.
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature.buffer as ArrayBuffer,
    new TextEncoder().encode(signingInput),
  );
}

function audienceMatches(aud: unknown, expected: string): boolean {
  if (typeof aud === "string") return aud === expected;
  if (Array.isArray(aud)) return aud.includes(expected);
  return false;
}

/**
 * Validates an inbound Azure Bot Framework JWT and returns its claims. Throws on
 * ANY failure (bad shape, non-RS256 alg, unknown kid, bad signature, wrong
 * iss/aud, expired/not-yet-valid). Security-critical — a caller turns a throw
 * into a 401 BEFORE any session work.
 */
export async function verifyTeamsJwt(token: string, opts: TeamsVerifyOptions): Promise<Record<string, unknown>> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("teamsChannel: malformed JWT.");
  const [rawHeader, rawPayload] = parts;

  let header: Record<string, unknown>;
  try {
    const parsed = JSON.parse(base64UrlToString(rawHeader));
    if (!isObject(parsed)) throw new Error("not an object");
    header = parsed;
  } catch {
    throw new Error("teamsChannel: unreadable JWT header.");
  }
  // REJECT any alg but RS256 — especially `alg:none` (an auth bypass).
  if (header.alg !== "RS256") throw new Error(`teamsChannel: unsupported JWT alg ${String(header.alg)} (expected RS256).`);

  const expectedAud = await resolveTeamsAppId(opts.appId);
  const expectedIss = opts.issuer ?? BOT_FRAMEWORK_ISSUER;

  // Select the signing key, refreshing the JWKS ONCE if the kid is unknown.
  let keys = await loadJwks(opts, false);
  let jwk = selectJwk(keys, header as { kid?: string; x5t?: string });
  if (jwk === undefined) {
    keys = await loadJwks(opts, true);
    jwk = selectJwk(keys, header as { kid?: string; x5t?: string });
  }
  if (jwk === undefined) throw new Error("teamsChannel: JWT signing key not found in JWKS.");

  if (!await verifyRs256Signature(token, jwk)) throw new Error("teamsChannel: JWT signature verification failed.");

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(base64UrlToString(rawPayload));
    if (!isObject(parsed)) throw new Error("not an object");
    payload = parsed;
  } catch {
    throw new Error("teamsChannel: unreadable JWT payload.");
  }

  if (payload.iss !== expectedIss) throw new Error("teamsChannel: JWT issuer mismatch.");
  if (!audienceMatches(payload.aud, expectedAud)) throw new Error("teamsChannel: JWT audience mismatch.");

  const nowSeconds = Math.floor((opts.now?.() ?? Date.now()) / 1000);
  const skew = opts.maxSkewSeconds ?? DEFAULT_SKEW_SECONDS;
  if (typeof payload.exp !== "number" || nowSeconds > payload.exp + skew) {
    throw new Error("teamsChannel: JWT is expired or missing exp.");
  }
  if (typeof payload.nbf === "number" && nowSeconds < payload.nbf - skew) {
    throw new Error("teamsChannel: JWT is not yet valid (nbf).");
  }

  return payload;
}

/**
 * Reads + verifies an inbound Teams request, returning the RAW body on success
 * or `null` on ANY failure (missing bearer, bad signature, claim mismatch,
 * unfetchable/unknown JWKS, missing app id) so a route can turn the null into a
 * 401 BEFORE any session work — this JWT is the only thing gating the webhook.
 * The body is read ONCE (Teams sends signed claims, not a body HMAC).
 */
export async function verifyTeamsInbound(request: Request, opts: TeamsVerifyOptions): Promise<string | null> {
  try {
    const body = await request.text();
    if (opts.webhookVerifier !== undefined) {
      const result = await opts.webhookVerifier(request, body);
      if (!result) throw new Error("teamsChannel: inbound webhook verifier rejected the request.");
      return typeof result === "string" ? result : body;
    }
    const token = readBearerToken(request.headers.get("authorization") ?? "");
    if (!token) throw new Error("teamsChannel: inbound request missing bearer token.");
    await verifyTeamsJwt(token, opts);
    return body;
  } catch (error) {
    console.warn("teams inbound verification failed", error);
    return null;
  }
}
