// Provider configuration and small request helpers. No database, no express:
// everything here is a pure function of its input so it can be tested directly.
import { BASE_PATH } from "../../config.ts";

/** Off unless explicitly enabled, like the native IdP. */
export function oidcProviderEnabled(
  raw: string | undefined = Deno.env.get("TREX_OIDC_PROVIDER_ENABLED"),
): boolean {
  return raw === "true" || raw === "1";
}

/**
 * The issuer every token carries and every relying party validates, so it comes
 * from configuration rather than from the request: a proxied Host header would
 * otherwise vary the `iss` claim between callers and break validation.
 */
export function issuerUrl(
  base: string | undefined = Deno.env.get("TREX_OIDC_ISSUER"),
  basePath = "",
): string {
  return (base ?? "http://localhost:33001").replace(/\/+$/, "") + basePath;
}

/**
 * The `iss` every token carries, and — since the provider's endpoint URLs are
 * all built from Better Auth's base URL — the URL the whole engine is mounted
 * at. The same expression d2e-compat/idp.ts:65 uses to tell relying parties
 * where to look, so the two cannot drift.
 *
 * Lives here rather than in better-auth.ts because provider.ts needs the same
 * value for its RFC 8707 resource identifier, and better-auth.ts imports
 * provider.ts.
 */
export function oidcIssuer(
  base: string | undefined = Deno.env.get("TREX_OIDC_ISSUER"),
): string {
  const issuer = issuerUrl(base, `${BASE_PATH}/oidc`);
  assertIssuerScheme(issuer);
  return issuer;
}

/**
 * The one scope the client_credentials grant may carry.
 *
 * It has to be invented, because none of the four scopes trex already declares
 * can serve: the plugin's USER_DELEGATED_SCOPES set is exactly
 * {openid, profile, email, offline_access}, and both the grant handler
 * (dist/introspect-njKASm3q.mjs:2077-2084) and the plugin's own
 * client_credentials-scope validator (:939-940) refuse a delegated scope
 * outright. `["openid"]`, which Task 5 seeded, therefore produces the worst
 * possible shape: a request that sends no `scope` at all succeeds, while the
 * same request sending `scope=openid` is answered invalid_scope.
 *
 * Named with trex's own prefix rather than something generic so it can never
 * collide with a standard OIDC scope a future relying party asks for, and
 * declared in the provider's `scopes` list because the plugin's validator
 * requires a client_credentials scope to be one the provider advertises.
 *
 * Declaring it there does NOT put it on a user token by itself: /authorize
 * narrows every request to `client.scopes ?? opts.scopes`
 * (dist/authorize-riRRCSbC.mjs:5558-5565), and the seeder never writes it into
 * a client's `scopes` column. A deployment that sets
 * TREX_OIDC_CLIENT_SCOPES="trex:service" can still put it on one — harmless
 * today, since the claims callback keys `trex_role` off the user's own role and
 * a user token stays "user", but it is a scope that means nothing on that path.
 */
export const SERVICE_SCOPE = "trex:service";

/**
 * The OAuth provider plugin does not refuse an `http:` issuer on a routable
 * host: validateIssuerUrl rewrites the scheme to `https:` and strips query and
 * hash (@better-auth/oauth-provider@1.7.5). Tokens would then be minted with an
 * `iss` nobody configured, and the mismatch surfaces at the relying party as an
 * invalid token rather than here as a misconfiguration. Fail boot instead.
 *
 * Since the cutover this is a startup refusal rather than a first-request 500:
 * index.ts imports the engine while it mounts the provider, so a bad
 * TREX_OIDC_ISSUER stops the node coming up. That is deliberate — a node that
 * boots and then issues tokens no relying party accepts is the worse outcome,
 * and a failed boot fails /trex/api/ready loudly.
 *
 * Deliberately no laxer than the plugin's own loopback test: anything this
 * accepts, validateIssuerUrl leaves alone.
 */
export function assertIssuerScheme(issuer: string): void {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new Error(`TREX_OIDC_ISSUER is not a URL: ${issuer}`);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopback = host === "localhost" || host.endsWith(".localhost") ||
    host === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  if (url.protocol !== "https:" && !loopback) {
    throw new Error(
      `The OIDC issuer must be https: or a loopback host, not ${issuer}. ` +
        "Better Auth silently rewrites the scheme to https:, so tokens would " +
        "be issued with an `iss` no relying party expects.",
    );
  }
  if (url.search || url.hash) {
    throw new Error(
      `The OIDC issuer must carry no query and no fragment, not ${issuer}. ` +
        "Better Auth strips both, so the issued `iss` would not be this value.",
    );
  }
}

/** Where an unauthenticated /authorize sends the browser; trex hosts no login UI. */
export function loginUrl(
  raw: string | undefined = Deno.env.get("TREX_OIDC_LOGIN_URL"),
): string | null {
  return raw && raw.length > 0 ? raw : null;
}

/**
 * Reads one cookie off the raw header: the server mounts no cookie parser, and
 * this is the only route that needs one. Matches the whole name, so a cookie
 * merely ending in the wanted name is not mistaken for it.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

export interface SeedClientSpec {
  clientId: string;
  clientSecret?: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  /** Roles the client itself carries, for the client credentials grant. */
  clientRoles: string[];
  /**
   * Scopes this client may be granted. Undefined means "not configured": the
   * row keeps whatever it has (or the column default on a first insert), so a
   * deployment that set them by hand does not have them reset on every boot.
   *
   * It exists because a scope is grantable only when the client lists it —
   * grantedScopes() narrows every request to allowed_scopes — and the column
   * default is openid/profile/email. Without this, the `idp_groups` scope that
   * carries federated group membership could never reach the client trex seeds
   * itself, and the whole claims contract would be inert for it.
   */
  allowedScopes?: string[];
  /**
   * The RFC 8707 resource identifier this client is linked to. One value, not
   * "whatever rows exist": `enforcePerClientResources` is the control an
   * operator has over which resources a client may target, and a seeder that
   * links every row takes it away — a second resource added later would be
   * granted to this client without anyone saying so.
   */
  resourceIdentifier: string;
}

const splitList = (raw: string | undefined): string[] =>
  (raw ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

/**
 * Reads one client from the environment. Returns null when no client id is set,
 * which is the ordinary case for a deployment that registers clients another way.
 */
export function parseSeedClient(
  env: Record<string, string | undefined>,
): SeedClientSpec | null {
  const clientId = env.TREX_OIDC_CLIENT_ID?.trim();
  if (!clientId) return null;

  const redirectUris = splitList(env.TREX_OIDC_CLIENT_REDIRECT_URIS);
  // A client with no redirect URI can never complete a flow, and registering it
  // would only produce a confusing invalid_request later.
  if (redirectUris.length === 0) return null;

  return {
    clientId,
    clientSecret: env.TREX_OIDC_CLIENT_SECRET?.trim() || undefined,
    name: env.TREX_OIDC_CLIENT_NAME?.trim() || clientId,
    redirectUris,
    postLogoutRedirectUris: splitList(env.TREX_OIDC_CLIENT_POST_LOGOUT_URIS),
    clientRoles: splitList(env.TREX_OIDC_CLIENT_ROLES),
    allowedScopes: parseScopes(env.TREX_OIDC_CLIENT_SCOPES),
    // The same expression provider.ts hands the plugin as its `resources`
    // option, read off the same environment, so the row the plugin seeds and
    // the row the client is linked to cannot drift.
    resourceIdentifier: oidcIssuer(env.TREX_OIDC_ISSUER),
  };
}

/**
 * `openid` is added when it is missing: without it /authorize refuses the
 * request outright with invalid_scope, so a scope list that omits it can only
 * ever be a configuration mistake, and one whose symptom points nowhere near
 * the setting that caused it.
 *
 * `offline_access` is added on the same argument, which now holds for it
 * verbatim. /authorize narrows a request to `client.scopes ?? opts.scopes` and
 * refuses any scope outside it (dist/authorize-riRRCSbC.mjs:5558-5562), and
 * d2e-compat asks for `openid profile email offline_access` on every sign-in
 * (d2e-compat/idp.ts) because the plugin issues a refresh token only when that
 * scope was granted. So a deployment that sets
 * TREX_OIDC_CLIENT_SCOPES="openid,profile,email" — the list it would have
 * written before, and one this column's own first-insert default disagrees with
 * (seed-client.ts) — fails EVERY sign-in, with an invalid_scope naming a scope
 * the operator never typed.
 *
 * Adding it to the column grants nothing by itself: /authorize issues only what
 * the request asks for, and this list is the ceiling rather than the grant.
 */
function parseScopes(raw: string | undefined): string[] | undefined {
  const scopes = splitList(raw);
  if (scopes.length === 0) return undefined;
  const required = ["openid", "offline_access"].filter((s) => !scopes.includes(s));
  return required.length === 0 ? scopes : [...required, ...scopes];
}

/**
 * Per-path ceilings for the provider's own endpoints.
 *
 * The plugin ships `customRules` that are far tighter than anything trex has
 * served: `/oauth2/token` at 20 per 60 seconds and `/oauth2/authorize` at 30
 * (@better-auth/oauth-provider@1.7.5 dist/authorize-riRRCSbC.mjs:5235-5264).
 * Measured against the real mount, request 21 is a 429. The deleted router.ts
 * ran authLimiter — 600 per 15 minutes, TREX_AUTH_RATE_LIMIT_MAX — in front of
 * /authorize and /token, so the plugin's defaults would cap a whole deployment
 * at roughly twenty sign-ins a minute.
 *
 * Worse while the client IP cannot be resolved: better-auth then keys every
 * caller into ONE bucket per path (dist/api/rate-limiter/index.mjs:241-245), so
 * the ceiling is a deployment-wide budget rather than a per-caller one. Sized
 * from the old per-IP budget for that reason, and tuneable by the same kind of
 * knob.
 */
export function oidcRateLimitMax(
  raw: string | undefined = Deno.env.get("TREX_OIDC_RATE_LIMIT_MAX"),
): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 600;
}

/** The window those ceilings are measured over, in seconds. Matches authLimiter's 15 minutes. */
export const OIDC_RATE_LIMIT_WINDOW = 15 * 60;

/**
 * CIDRs to treat as proxies when reading `x-forwarded-for`, which is what Caddy
 * sends and already what Better Auth reads by default
 * (@better-auth/core utils/ip.mjs:196) — so naming the header buys nothing and
 * this is the setting that actually changes behaviour.
 *
 * With it set, getIPFromHeader walks the chain from the RIGHT and takes the
 * first address that is not a configured proxy (ip.mjs:180-189), which is
 * spoof-resistant: Caddy appends the peer it observed, so a value a client
 * prepended sits to the left and is never selected. With it empty, a header
 * carrying more than one value resolves to null (ip.mjs:190) and every caller
 * shares one bucket — safe, but a lever any anonymous caller can pull by
 * sending an `X-Forwarded-For` of their own.
 *
 * Deliberately EMPTY by default rather than seeded with the RFC 1918 ranges.
 * On an on-premise installation real clients live in 10/8 and 192.168/16; a
 * default that declared those trusted would skip the real address and select
 * whatever the client prepended, turning a shared bucket into an attacker-
 * chosen one. Which ranges are proxies is a property of the deployment, so the
 * deployment says so.
 */
export function trustedProxies(
  raw: string | undefined = Deno.env.get("TREX_TRUSTED_PROXIES"),
): string[] {
  return (raw ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Strips a transport port from every token of an `X-Forwarded-For` value.
 *
 * This is the whole reason per-IP rate limiting does not work in a d2e stack,
 * and it is a formatting mismatch rather than a policy one. d2e's Caddyfile
 * sends `header_up X-Forwarded-For {remote}`, and Caddy's `{remote}` is the
 * peer's `host:port`, not its host — so the header arrives as
 * `192.168.65.1:57097`. Better Auth's `isValidIP` refuses that, `getIPFromHeader`
 * returns null, and `getIP` then falls back to `127.0.0.1` under
 * `NODE_ENV=development` (which this container sets) or to null otherwise.
 * Either way every caller lands in ONE bucket per path, which is how 594
 * anonymous requests closed /oauth2/userinfo for the whole installation in 2.4
 * seconds during the cutover rehearsal. Measured against the package:
 *
 *   isValidIP("192.168.65.1:57097")              -> false
 *   getIP({x-forwarded-for: "192.168.65.1:57097"}) -> 127.0.0.1   (NODE_ENV=development)
 *                                                -> null         (otherwise)
 *   getIP({x-forwarded-for: "192.168.65.1"})     -> 192.168.65.1
 *
 * `TREX_TRUSTED_PROXIES` cannot fix it: the trusted-proxy path parses the same
 * malformed token with the same `ipToBytes` and gives up on the same value.
 * Normalising the header is the only lever trex holds, and it is the right one
 * — it makes the resolution work for ANY front door that forwards the peer in
 * Go/Caddy's `host:port` spelling, not just for a Caddyfile this repository
 * does not own.
 *
 * It adds no spoofing surface. Better Auth already honours a single-token
 * header from an untrusted peer; this only changes the spelling of a token that
 * was going to be accepted or rejected on its own merits. A header carrying
 * more than one token still resolves to null without `TREX_TRUSTED_PROXIES`,
 * exactly as before.
 *
 * Conservative by construction: a token is rewritten only when what remains is
 * unambiguous — `[v6]:port` and a `v4:port` with exactly one colon. A bare IPv6
 * address (many colons, no brackets) is left alone, because `2001:db8::1` and
 * `2001:db8::1:443` are indistinguishable and guessing would silently rewrite a
 * real address into a different one.
 */
export function normalizeForwardedFor(value: string): string {
  return value
    .split(",")
    .map((raw) => {
      const token = raw.trim();
      // [2001:db8::1]:443 -> 2001:db8::1. Also covers the bracketed form with
      // no port, which is equally unparseable to isValidIP.
      const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(token);
      if (bracketed) return bracketed[1];
      // 192.168.65.1:57097 -> 192.168.65.1. Exactly one colon, so a bare IPv6
      // address can never match.
      const first = token.indexOf(":");
      if (first !== -1 && first === token.lastIndexOf(":") && /^\d+$/.test(token.slice(first + 1))) {
        return token.slice(0, first);
      }
      return token;
    })
    .join(", ");
}

/**
 * How many /oauth2/userinfo requests one caller may have REFUSED per window
 * before the endpoint stops answering it at all.
 *
 * Separate from TREX_OIDC_RATE_LIMIT_MAX, and deliberately far smaller, because
 * the two count different things. That one is a ceiling on traffic; this is a
 * ceiling on failure, and a /oauth2/userinfo request that answers 401 has no
 * legitimate volume — a real sign-in's call answers 200 and is never counted
 * here. 60 leaves ample room for a client with a stale token retrying and no
 * room at all for the 594 requests that took the endpoint down in 2.4 seconds.
 *
 * This is what makes the FAILURE mode safe when the client IP cannot be
 * resolved. Better Auth's own limiter keys on `<ip>|<path>` with no hook to
 * change the key, so a tighter `customRules` entry would still share a counter
 * with the authenticated requests — an attacker would fill it and WebAPI's
 * sign-in would read it as full. Refusing the flood BEFORE it reaches Better
 * Auth is the only way the two budgets can be independent, and the mount is the
 * only place that can do it.
 */
export function userInfoFailureBudget(
  raw: string | undefined = Deno.env.get("TREX_OIDC_USERINFO_FAILURE_MAX"),
): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 60;
}
