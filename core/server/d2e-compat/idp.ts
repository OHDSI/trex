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
    return {
      idp,
      issuer,
      jwksUri: `${internalBase}/.well-known/jwks.json`,
      // Two values, not the client id alone. The access token's `aud` is the
      // RFC 8707 resource identifier — the issuer, because that is what
      // provider.ts declares as the only resource — plus
      // `<issuer>/oauth2/userinfo`, which the plugin appends whenever `openid`
      // was granted. The id_token's `aud` is still the client id, and that is
      // the token scripts/lib/idp-login.cjs picks (`id_token || access_token`).
      // The portal sends the ACCESS token as its bearer, so the client id alone
      // 401s every portal call on an audience mismatch. jose accepts a token
      // whose `aud` carries any one of these, so naming both verifies both
      // without widening either.
      audiences: splitList(
        env.D2E_IDP_AUDIENCES ?? `${issuer},${env.TREX_OIDC_CLIENT_ID ?? ""}`,
      ),
      clientId: env.TREX_OIDC_CLIENT_ID ?? "",
      clientSecret: env.TREX_OIDC_CLIENT_SECRET ?? "",
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
      // The issuer rather than nothing. `resolveResourcePolicy` returns no
      // audience claim at all for a request that named no resource
      // (dist/introspect-njKASm3q.mjs:453-462), and the access token is then an
      // opaque string rather than a JWT — which the portal cannot decode for
      // `roles` and auth.ts cannot verify against the JWKS. The portal's
      // authorize request carries no `resource`, so the /oauth/token proxy is
      // the only leg that can supply one; the plugin honours it there because
      // the stored code named none to narrow it against
      // (`resource ?? storedResources`, :1937).
      resource: env.D2E_IDP_RESOURCE ?? issuer,
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
