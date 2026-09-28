// Which identity provider d2e-compat verifies bearer tokens against.
//
// d2e has always been fronted by Logto, and every token check in auth.ts read
// LOGTO__* directly. trex now ships its own OIDC provider
// (TREX_OIDC_PROVIDER_ENABLED), so a d2e stack can be run without Logto at all —
// but only if the d2e-compat gate can be pointed at the other issuer.
//
// D2E_IDP selects; it defaults to `logto`, so an existing deployment that sets
// nothing keeps the behaviour it had.

import { issuerUrl } from "../auth/oidc/config.ts";
import { BASE_PATH } from "../config.ts";

export type D2eIdp = "logto" | "trex";

export interface IdpConfig {
  idp: D2eIdp;
  /** Expected `iss`. Empty when the deployment has not configured one. */
  issuer: string;
  jwksUri: string;
  /** Accepted `aud`. Empty means the audience is not checked. */
  audiences: string[];
  /** Client the portal authenticates as, and its secret for the code exchange. */
  clientId: string;
  clientSecret: string;
  /**
   * How the /oauth/token proxy must present that secret.
   *
   * Not a preference: an OAuth client is registered for exactly one method and
   * the provider refuses any other. trex's own provider refuses a mismatch with
   * `client registered for … cannot use …`; Logto refuses a request that
   * presents client auth two ways at once. So the proxy has to know which side
   * it is talking to, and this is where that is decided.
   */
  tokenEndpointAuthMethod: "client_secret_basic" | "client_secret_post";
  scope: string;
  /** Token endpoint the /oauth/token proxy forwards to. */
  tokenUrl: string;
  /** Resource indicator appended to the token request; empty to omit. */
  resource: string;
  /** Browser-facing endpoints, relative to the public gateway origin. */
  authorizePath: string;
  endSessionPath: string;
}

/** An unrecognised value is an error rather than a silent fall back to Logto:
 *  a typo would otherwise verify tokens against the wrong issuer. */
export function d2eIdp(env: Record<string, string | undefined>): D2eIdp {
  const raw = (env.D2E_IDP ?? "").trim().toLowerCase();
  if (raw === "" || raw === "logto") return "logto";
  if (raw === "trex") return "trex";
  throw new Error(`[d2e-compat] unknown D2E_IDP "${raw}" (expected "logto" or "trex")`);
}

function splitList(raw: string | undefined): string[] {
  return (raw ?? "").split(",").map((a) => a.trim()).filter(Boolean);
}

/** `basePath` is injectable so the trex issuer can be asserted without the
 *  process-wide BASE_PATH constant; callers pass nothing. */
export function resolveIdpConfig(
  env: Record<string, string | undefined>,
  basePath: string = BASE_PATH,
): IdpConfig {
  const idp = d2eIdp(env);

  if (idp === "trex") {
    // Same issuer the provider stamps into its tokens and advertises in its
    // discovery document — derived the same way rather than restated, so the
    // two cannot drift apart. It carries the `/oidc` mount, because that is
    // where the discovery document lives and because Better Auth builds every
    // endpoint URL it advertises from exactly this value (auth/better-auth.ts
    // makes it the engine's base URL for that reason).
    const issuer = issuerUrl(env.TREX_OIDC_ISSUER, `${basePath}/oidc`);
    // Where THIS process fetches the provider's own endpoints. Normally the
    // issuer itself, but a deployment can point it at an address that resolves
    // from inside the container.
    //
    // The two differ only where the public FQDN is not a route back to the
    // gateway from within the network — a local stack or CI, where it is
    // `localhost` and therefore resolves to this container. Real deployments
    // leave it unset and both are the public issuer.
    //
    // Only server-to-server calls use it. `iss` stays the public issuer, so
    // tokens still verify for anyone outside; a spec-compliant third-party
    // client that fetches the issuer directly is unaffected.
    const internalBase = env.TREX_OIDC_INTERNAL_BASE
      ? issuerUrl(env.TREX_OIDC_INTERNAL_BASE, `${basePath}/oidc`)
      : issuer;
    // The identifier the token request names as its RFC 8707 resource, and
    // therefore the value the access token carries in `aud`. Hoisted out of the
    // returned object because the audience list is derived from it: the two
    // describe the same identifier from opposite ends, and a deployment that
    // overrides one without the other rejects every access token it issues.
    //
    // The issuer rather than nothing. `resolveResourcePolicy` returns no
    // audience claim at all for a request that named no resource
    // (dist/introspect-njKASm3q.mjs:453-462), and the access token is then an
    // opaque string rather than a JWT — which the portal cannot decode for
    // `roles` and auth.ts cannot verify against the JWKS. The portal's
    // authorize request carries no `resource`, so the /oauth/token proxy is
    // the only leg that can supply one; the plugin honours it there because
    // the stored code named none to narrow it against
    // (`resource ?? storedResources`, :1937).
    const resource = env.D2E_IDP_RESOURCE ?? issuer;
    return {
      idp,
      issuer,
      jwksUri: `${internalBase}/.well-known/jwks.json`,
      // Two values, not the client id alone. The access token's `aud` is the
      // RFC 8707 resource identifier plus `<issuer>/oauth2/userinfo`, which the
      // plugin appends whenever `openid` was granted. The id_token's `aud` is
      // still the client id, and that is the token scripts/lib/idp-login.cjs
      // picks (`id_token || access_token`). The portal sends the ACCESS token as
      // its bearer, so the client id alone 401s every portal call on an audience
      // mismatch. jose accepts a token whose `aud` carries any one of the
      // configured values, so naming both verifies both without widening either.
      //
      // Derived from `resource`, not from `issuer`: they are the same string
      // until a deployment sets D2E_IDP_RESOURCE, and from then on it is the
      // resource that lands in `aud`. Deriving from the issuer would leave that
      // deployment refusing every access token it just configured.
      audiences: splitList(
        env.D2E_IDP_AUDIENCES ?? `${resource},${env.TREX_OIDC_CLIENT_ID ?? ""}`,
      ),
      clientId: env.TREX_OIDC_CLIENT_ID ?? "",
      clientSecret: env.TREX_OIDC_CLIENT_SECRET ?? "",
      // Basic, because there is exactly ONE seeded client row and WebAPI has to
      // be able to use it too. Spring Security authenticates
      // `client_secret_basic` and cannot be told otherwise, so a
      // `client_secret_post` row 401s every WebAPI and Atlas sign-in. This
      // proxy is the side that can move, so it moves; seed-client.ts registers
      // the row to match.
      tokenEndpointAuthMethod: "client_secret_basic",
      // offline_access is not optional here: the plugin issues a refresh token
      // only when that scope was granted
      // (dist/introspect-njKASm3q.mjs:1798), where trex's own provider issued
      // one unconditionally. Without it the portal — which renews 180s before
      // expiry — gets no refresh token at all and drops the user back to the
      // login page an hour in.
      scope: env.D2E_IDP_SCOPE ?? "openid profile email offline_access",
      // /oauth2/*, not the bare paths the hand-written provider served:
      // @better-auth/oauth-provider hard-codes them and its discovery document
      // cannot be overridden. This is the one thing a relying party sees change
      // in the cutover, and the reason to read them from the document rather
      // than to restate them here is exactly this line.
      tokenUrl: `${internalBase}/oauth2/token`,
      resource,
      // Browser-visible paths, relative to the public gateway origin. They carry
      // the mount's base path because the d2e front door does NOT strip it: it
      // proxies /trex/* to this node as-is, and routes a bare /oidc/* to Logto.
      // Emitting "oidc/authorize" therefore sent the portal's login to Logto,
      // which knows nothing of trex's clients or sessions. Derived from the same
      // issuer the discovery document advertises, so the two cannot drift.
      authorizePath: `${new URL(issuer).pathname.replace(/^\//, "")}/oauth2/authorize`,
      endSessionPath: `${new URL(issuer).pathname.replace(/^\//, "")}/oauth2/end-session`,
    };
  }

  // Logto: every value is exactly what auth.ts/routes.ts read before the switch
  // existed, so a deployment that sets no D2E_IDP is bit-for-bit unchanged.
  const issuer = env.LOGTO__ISSUER ?? "";
  return {
    idp,
    issuer,
    jwksUri: issuer ? `${issuer}/jwks` : "",
    audiences: splitList(
      env.D2E_IDP_AUDIENCES ?? env.LOGTO__AUDIENCES ?? env.LOGTO__RESOURCE_API,
    ),
    clientId: env.LOGTO__CLIENT_ID ?? "",
    // LOGTO__* first. SECURITY_AUTH_OIDC_APISECRET is only an alias, kept
    // because d2e env.ts maps env.LOGTO_CLIENT_SECRET <- SECURITY_AUTH_OIDC_APISECRET
    // and some deployments set nothing else. It is WebAPI's variable, and WebAPI
    // may now be pointed at a different issuer than the portal is: a stack whose
    // WebAPI authenticates against trex while d2e-compat still verifies Logto
    // tokens has trex's client secret in there. Preferring the alias then sends
    // that secret to Logto, which answers 401 on the code exchange, and the only
    // visible symptom is an undefined access_token failing much later.
    clientSecret: env.LOGTO__CLIENT_SECRET || env.SECURITY_AUTH_OIDC_APISECRET || "",
    // Unchanged from every d2e release that predates trex's own provider: the
    // secret goes in the body and no Basic header is sent alongside it, because
    // Logto refuses a request that presents client auth twice. A deployment
    // that sets no D2E_IDP is bit-for-bit what it was.
    tokenEndpointAuthMethod: "client_secret_post",
    scope: env.LOGTO__SCOPE ?? "",
    tokenUrl: env.LOGTO__TOKEN_URL ?? "",
    resource: env.LOGTO__RESOURCE_API ?? "",
    authorizePath: "oidc/auth",
    endSessionPath: "oidc/session/end",
  };
}

/**
 * Whether verified claims carry d2e system-admin.
 *
 * The two Logto shapes are unchanged: the legacy
 * `userMgmtGroups.alp_role_system_admin` boolean and this stack's `roles` array
 * containing `role.systemadmin`. The `roles` shape also covers trex's provider,
 * whose app-roles API emits the same named roles; `trex_role` is accepted on top
 * because that is where trex puts its own admin flag.
 */
export function isSystemAdminClaims(
  payload: Record<string, unknown>,
  idp: D2eIdp,
): boolean {
  const userMgmtGroups = payload["userMgmtGroups"] as Record<string, unknown> | undefined;
  if (userMgmtGroups?.["alp_role_system_admin"] === true) return true;

  const roles = payload["roles"];
  if (Array.isArray(roles) && roles.includes("role.systemadmin")) return true;

  if (idp === "trex") {
    const appMetadata = payload["app_metadata"] as Record<string, unknown> | undefined;
    if (payload["trex_role"] === "admin" || appMetadata?.["trex_role"] === "admin") {
      return true;
    }
  }

  return false;
}

/**
 * Warns at boot when the configured audience list cannot match an access token.
 *
 * `D2E_IDP_AUDIENCES` REPLACES the default pair rather than adding to it, and
 * the value that was correct before the provider moved onto
 * `@better-auth/oauth-provider` — the bare client id — is now the one that
 * breaks. An operator who sets it that way sees every portal call answer 401
 * with nothing in the log connecting the two, because a token that fails the
 * audience check fails it the same way a forged one does.
 *
 * Checked against `resource`, not against the issuer: the access token's `aud`
 * is whatever the token request named as its RFC 8707 resource, and a
 * deployment that sets D2E_IDP_RESOURCE to a resource of its own has legitimate
 * reason for the issuer to be absent from the list. That is also the only such
 * reason, which is why this is a warning about the resource rather than one
 * about the issuer.
 *
 * A warning and not a refusal: a deployment may deliberately accept only
 * id_tokens, and boot is not the place to overrule it. An empty list — the
 * documented "do not check the audience at all" — is left alone for the same
 * reason.
 */
export function warnOnUnmatchableAudience(
  env: Record<string, string | undefined> = Deno.env.toObject(),
  log: (msg: string) => void = console.warn,
): boolean {
  const { idp, audiences, resource } = resolveIdpConfig(env);
  if (idp !== "trex") return false;
  if (audiences.length === 0 || !resource) return false;
  if (audiences.includes(resource)) return false;
  log(
    `[d2e-compat] D2E_IDP_AUDIENCES does not name "${resource}", the resource ` +
      `identifier every access token carries in its \`aud\` — access tokens ` +
      `will be rejected and every portal call will answer 401. ` +
      `Configured: ${audiences.join(", ")}`,
  );
  return true;
}
