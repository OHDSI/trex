// Replaces core/server/auth/oidc/router.ts. Every option here exists because
// the plugin's default differs from what trex has served since V7, and each
// difference is one a relying party would notice.
import { oauthProvider } from "@better-auth/oauth-provider";
import { accessTokenClaims, idTokenClaims, userInfoClaims } from "./custom-claims.ts";
import { oidcIssuer, SERVICE_SCOPE } from "./config.ts";
import { refreshTokenTtlDays } from "../refresh-token-ttl.ts";

export function trexOAuthProvider() {
  return oauthProvider({
    // idp_groups is trex's own scope and has to be declared before a client may
    // be granted it. offline_access is the plugin's gate on issuing a refresh
    // token at all (dist/introspect-njKASm3q.mjs:1799); trex issued one
    // unconditionally, so without it every relying party silently loses refresh.
    // SERVICE_SCOPE is declared here because the plugin requires a
    // client_credentials scope to be one the provider advertises
    // (dist/introspect-njKASm3q.mjs:939-940); no client's `scopes` column lists
    // it, so no authorize request can ever be granted it.
    scopes: ["openid", "profile", "email", "idp_groups", "offline_access", SERVICE_SCOPE],
    // Declared so the access token is a signed JWT rather than an opaque
    // string: the d2e portal decodes it to read `roles` and sends it as its
    // bearer to d2e-compat, which verifies it against the JWKS.
    resources: [oidcIssuer()],
    // trex's codes lived 60 seconds (the deleted codes.ts); the plugin defaults
    // to 600.
    codeExpiresIn: 60,
    // trex's id_tokens lived 3600 seconds (the deleted claims.ts); the plugin
    // defaults to 36000.
    idTokenExpiresIn: 3600,
    accessTokenExpiresIn: 3600,
    // REFRESH_TOKEN_TTL_DAYS, the same knob trex's own refresh tokens read
    // (refresh-token-ttl.ts), so a deployment that shortened one does not find
    // the other still at 30 days. The two are not the same rule and cannot be:
    // trex's is an ABSOLUTE age measured from the first issuance, while the
    // plugin recomputes exp as `iat + ttl` on every rotation
    // (dist/introspect-njKASm3q.mjs:1610-1616), so this is a rolling window.
    // Wired anyway, because one inert knob is worse than one whose units are
    // documented.
    refreshTokenExpiresIn: refreshTokenTtlDays() * 24 * 60 * 60,
    // Required options with no defaults. The login page is d2e's; consent is
    // never reached because the seeded client carries skipConsent, but a string
    // is still mandatory.
    loginPage: Deno.env.get("TREX_OIDC_LOGIN_URL") ?? "/",
    consentPage: Deno.env.get("TREX_OIDC_CONSENT_URL") ?? Deno.env.get("TREX_OIDC_LOGIN_URL") ?? "/",
    customIdTokenClaims: idTokenClaims,
    customAccessTokenClaims: accessTokenClaims,
    customUserInfoClaims: userInfoClaims,
    // The document advertised exactly this list before, and d2e's CI diffs it.
    advertisedMetadata: {
      claims_supported: [
        "iss",
        "sub",
        "aud",
        "exp",
        "iat",
        "auth_time",
        "nonce",
        "email",
        "email_verified",
        "name",
        "trex_role",
        "idp_groups",
        "idp_provider",
      ],
    },
    // Without a clientPrivileges callback every client_credentials
    // configuration call is UNAUTHORIZED (dist/authorize-riRRCSbC.mjs:1178).
    // Client administration over HTTP is not a surface trex offers: clients are
    // seeded from the environment, so this refuses everything.
    clientPrivileges: () => false,
    // The same answer for the resource CRUD endpoints. They live under
    // /admin/oauth2/, which oidc/mount.ts already 404s, so this is the second
    // lock on the same door rather than the only one — and the one that would
    // still hold if the mount's prefix list ever grew.
    resourcePrivileges: () => false,
  });
}
