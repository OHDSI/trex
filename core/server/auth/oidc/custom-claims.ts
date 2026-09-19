// The claims trex's own OIDC provider emits, rebuilt on the plugin's callbacks.
//
// @better-auth/oauth-provider routes every OIDC standard claim to /userinfo and
// blanks it in the id_token by design (ID_TOKEN_SCOPE_CLAIM_GUARDS sets each of
// them to undefined before the custom claims are spread on top). trex's two
// relying parties do not work that way: WebAPI reads its authorities out of the
// id_token's `roles` (SECURITY_AUTH_OIDC_ROLESCLAIM=roles) and d2e-compat reads
// `trex_role` out of the bearer, so both are put back here. None of these names
// is on the plugin's reserved list for either token, so none is stripped.
//
// The callbacks are handed only the user and the granted scopes — no client, no
// session, no grant — so the application roles are read straight from
// trexdb.user_role, exactly as the deleted oidc/router.ts's fetchUser did.
import { pool } from "../../db.ts";
import { federationFromAppMetadata } from "./claims.ts";

/** The subset of the plugin's user object these claims are built from. */
interface ClaimUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  emailVerified: boolean | null;
  app_metadata: unknown;
}

export async function appRolesFor(userId: string): Promise<string[]> {
  const roles = await pool.query<{ name: string }>(
    `SELECT r.name
       FROM trexdb.user_role ur
       JOIN trexdb.role r ON r.id = ur."roleId"
      WHERE ur."userId" = $1
      ORDER BY r.name`,
    [userId],
  );
  return roles.rows.map((r) => r.name);
}

export async function idTokenClaims(
  info: { user: Record<string, unknown>; scopes: readonly string[] },
): Promise<Record<string, unknown>> {
  const user = info.user as unknown as ClaimUser;
  const scopes = new Set(info.scopes);

  const claims: Record<string, unknown> = {
    trex_role: user.role,
    // Application roles, never the system role: they are different concepts and
    // conflating them would grant application access on a trex admin flag.
    roles: await appRolesFor(user.id),
    app_metadata: { trex_role: user.role },
  };

  // An absent claim rather than a null one: a relying party that keys accounts
  // off `email` must fail to find one rather than key off a null. Since V17
  // restored user.email NOT NULL no user reaches that branch, but a federated
  // user whose upstream asserted no address carries a synthesised
  // <subject>@d2e.local that is never "emailVerified" — so the pair goes out as
  // email_verified: false, which is the whole of the protection.
  if (scopes.has("email") && user.email) {
    claims.email = user.email;
    claims.email_verified = Boolean(user.emailVerified);
  }
  if (scopes.has("profile") && user.name) claims.name = user.name;

  // Behind its own scope because group lists are large and only usermgmt needs
  // them, and gated on the provider as well so a native password login emits
  // neither claim however it was scoped: there is no upstream identity to
  // report.
  const { idpProvider, idpGroups } = federationFromAppMetadata(user.app_metadata);
  if (scopes.has("idp_groups") && idpProvider) {
    claims.idp_groups = idpGroups ?? [];
    claims.idp_provider = idpProvider;
  }
  return claims;
}

/**
 * The access token carries the same set, because today's provider mints one
 * token and returns it as both `access_token` and `id_token` — the d2e portal
 * decodes whichever it was handed to read `roles` and passes it to d2e-compat.
 *
 * `user` is null or absent on a client_credentials grant, which has no end
 * user. Such a token authorizes as the service it was issued to, so `roles`
 * carries the CLIENT's own roles — the deleted router.ts emitted
 * `appRoles: client.clientRoles` there, seeded from TREX_OIDC_CLIENT_ROLES
 * (ALP_USER_ADMIN, ALP_SYSTEM_ADMIN), and a service token that authorizes as
 * nobody is a silent loss of every machine-to-machine permission.
 *
 * The roles arrive in `metadata`, which the plugin fills with
 * `parseClientMetadata(client.metadata)` before calling this
 * (dist/introspect-njKASm3q.mjs:1802, 239-260) — there is no column for them,
 * and the callback is handed no client object to read one from.
 *
 * NOTE this callback only ever runs for a JWT access token: `createUserTokens`
 * gates it on `isJwtAccessToken`, which is `audienceClaim && !disableJwtPlugin`
 * (:1800), and `audienceClaim` is undefined unless the request carried a
 * `resource` (:454). client_credentials has no authorize leg to inherit one
 * from, so the token request itself must send `resource=` — otherwise the
 * token is opaque and none of this is reached. provider.ts's
 * `requireServiceResource` is what makes sure it does.
 */
export async function accessTokenClaims(
  info: {
    user?: Record<string, unknown> | null;
    referenceId?: string;
    scopes: readonly string[];
    metadata?: Record<string, unknown> | null;
  },
): Promise<Record<string, unknown>> {
  if (!info.user) {
    const clientRoles = info.metadata?.clientRoles;
    return {
      trex_role: "service",
      roles: Array.isArray(clientRoles) ? clientRoles.map(String) : [],
      // The pair the id_token path emits too: d2e-compat reads trex_role off
      // the bearer, and the deleted claims.ts put it in both places.
      app_metadata: { trex_role: "service" },
    };
  }
  return await idTokenClaims({ user: info.user, scopes: info.scopes });
}

/**
 * Today's /userinfo returns strictly {sub, email?, email_verified?, name?,
 * trex_role} (the deleted oidc/router.ts's userinfo handler).
 *
 * The plugin merges this on top of its own standard-claim set without a base
 * argument, which is its documented first-party override path: what is returned
 * here wins over the provider's value for the same name, and `sub` is re-pinned
 * by the caller afterwards. So the standard claims are restated rather than
 * left to the provider, and the values are the ones the id_token carries.
 */
export function userInfoClaims(
  info: { user: Record<string, unknown>; scopes: readonly string[] },
): Promise<Record<string, unknown>> {
  const user = info.user as unknown as ClaimUser;
  const scopes = new Set(info.scopes);
  const claims: Record<string, unknown> = { sub: user.id, trex_role: user.role };
  if (scopes.has("email") && user.email) {
    claims.email = user.email;
    claims.email_verified = Boolean(user.emailVerified);
  }
  if (scopes.has("profile") && user.name) claims.name = user.name;
  return Promise.resolve(claims);
}
