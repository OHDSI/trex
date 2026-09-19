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
 */
function parseScopes(raw: string | undefined): string[] | undefined {
  const scopes = splitList(raw);
  if (scopes.length === 0) return undefined;
  return scopes.includes("openid") ? scopes : ["openid", ...scopes];
}
