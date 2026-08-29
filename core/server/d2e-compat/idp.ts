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
    // discovery document (see registerOidcRoutes) — derived the same way rather
    // than restated, so the two cannot drift apart.
    // The issuer carries the mount's base path, because every endpoint the
    // provider advertises is built from it (see registerOidcRoutes/buildReturnTo).
    // Includes the `/oidc` mount, matching what registerOidcRoutes advertises
    // and where the discovery document actually lives.
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
      audiences: splitList(env.D2E_IDP_AUDIENCES ?? env.TREX_OIDC_CLIENT_ID),
      clientId: env.TREX_OIDC_CLIENT_ID ?? "",
      clientSecret: env.TREX_OIDC_CLIENT_SECRET ?? "",
      scope: env.D2E_IDP_SCOPE ?? "openid profile email",
      tokenUrl: `${internalBase}/token`,
      resource: env.D2E_IDP_RESOURCE ?? "",
      // Browser-visible paths, relative to the public gateway origin. They carry
      // the mount's base path because the d2e front door does NOT strip it: it
      // proxies /trex/* to this node as-is, and routes a bare /oidc/* to Logto.
      // Emitting "oidc/authorize" therefore sent the portal's login to Logto,
      // which knows nothing of trex's clients or sessions. Derived from the same
      // issuer the discovery document advertises, so the two cannot drift.
      authorizePath: `${new URL(issuer).pathname.replace(/^\//, "")}/authorize`,
      endSessionPath: `${new URL(issuer).pathname.replace(/^\//, "")}/session/end`,
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
