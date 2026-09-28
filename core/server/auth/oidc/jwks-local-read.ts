// Keeps the provider's own key-set lookup inside the process.
//
// THE UPSTREAM INCONSISTENCY, located rather than guessed. Three call sites in
// @better-auth/oauth-provider@1.7.5 need trex's key set. Two of them read it
// locally, by handing `getJwks` a FUNCTION:
//
//   jwksFetch: jwtPluginOptions?.jwks?.remoteUrl
//     ? jwtPluginOptions.jwks.remoteUrl
//     : async () => { ... }        (dist/authorize-riRRCSbC.mjs:3436, :2245)
//
// The third — the one that verifies an RP-initiated logout's `id_token_hint` —
// hands it a STRING, so it makes a real HTTP request instead:
//
//   jwksFetch: jwtPluginOptions?.jwks?.remoteUrl
//     ?? `${ctx.context.baseURL}${jwtPluginOptions?.jwks?.jwksPath ?? "/jwks"}`
//                                  (dist/authorize-riRRCSbC.mjs:547)
//
// `ctx.context.baseURL` is trex's issuer (better-auth.ts `authBaseUrl`), which
// is the PUBLIC origin. A deployment whose public host is not routable from
// inside its own container — every stack whose FQDN is `localhost`, which
// includes CI — cannot answer that request, so every hint is refused and
// RP-initiated logout degrades to a confirmation page. Measured:
//
//   [oidc] end-session: id_token_hint rejected — the id_token_hint is genuine
//   — trex verified it against its own key set — so the provider's refusal is
//   its own JWKS fetch failing, not a bad token.
//
// `jwks.remoteUrl` is NOT the fix. logout-hint.ts records why: :547 prefers it,
// but setting it also rewrites the advertised `jwks_uri` in the discovery
// document to that address and makes the jwt plugin's own JWKS route answer 404
// (better-auth@1.7.5 dist/plugins/jwt/index.mjs:116). There is no configuration
// that repairs the fetch without breaking discovery.
//
// So the request is answered without being made. This is deliberately the
// narrowest possible intervention: ONE exact URL, matched whole. trex fetches
// other key sets on the federation path — every upstream IdP has a `jwks_uri`
// of its own (auth/federation/) — and answering one of those locally would be a
// security bug, not a workaround. Matching a substring like "/jwks" would do
// exactly that, so the comparison is on the fully-resolved URL.

/** Everything the interceptor needs, injected so it can be tested without globals. */
export interface JwksLocalReadOptions {
  /**
   * The exact URL the provider builds at :547 — `${issuer}${jwksPath}`.
   * Derived by the caller from the same values the engine is configured with,
   * so the two cannot drift.
   */
  jwksUrl: string;
  /** Reads the key set without leaving the process. */
  readJwks: () => Promise<unknown>;
  /** Where everything else goes, unchanged. */
  realFetch: typeof fetch;
  /** Injectable so a test can assert on it. */
  onError?: (error: unknown) => void;
}

/**
 * The absolute URL a fetch argument refers to, or null when there isn't one.
 *
 * `fetch` accepts a string, a URL, or a Request, and a relative string has no
 * absolute form here — all three are handled rather than assumed, because
 * guessing wrong would mean either missing the interception or throwing inside
 * an unrelated request.
 */
function absoluteUrl(input: RequestInfo | URL): string | null {
  try {
    if (typeof input === "string") return new URL(input).href;
    if (input instanceof URL) return input.href;
    const candidate = (input as Request)?.url;
    if (typeof candidate === "string") return new URL(candidate).href;
  } catch {
    // A relative or malformed URL is never the provider's own key set.
  }
  return null;
}

/**
 * Wraps `realFetch` so that exactly `jwksUrl` is answered from `readJwks()`.
 *
 * Fails OPEN: if the local read throws, the real request is made after all.
 * The alternative — returning an error response — would convert a recoverable
 * condition into a refused logout, which is the very failure this exists to
 * remove.
 */
export function createJwksLocalReadFetch(options: JwksLocalReadOptions): typeof fetch {
  const { jwksUrl, readJwks, realFetch, onError } = options;

  // Normalised once, so a configured URL that differs only in a trailing
  // formality still matches what the provider builds.
  let target: string | null = null;
  try {
    target = new URL(jwksUrl).href;
  } catch {
    // Nothing can equal an unparseable target, so the wrapper becomes a
    // pass-through rather than an error at boot.
  }

  return async function jwksLocalReadFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    if (target !== null && absoluteUrl(input) === target) {
      try {
        const jwks = await readJwks();
        return new Response(JSON.stringify(jwks), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      } catch (error) {
        onError?.(error);
      }
    }
    return realFetch(input as Request, init);
  };
}

/**
 * The URL the provider will ask for, built from the same two values the engine
 * is configured with.
 *
 * Kept next to the interceptor, and taking its inputs rather than reading the
 * environment, so a test states the issuer and path it means instead of
 * arranging global state.
 */
export function providerJwksUrl(issuer: string, jwksPath: string): string {
  return `${issuer.replace(/\/+$/, "")}${jwksPath.startsWith("/") ? "" : "/"}${jwksPath}`;
}
