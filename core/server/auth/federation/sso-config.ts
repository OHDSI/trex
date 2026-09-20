// The shape of trexdb.sso_provider as Better Auth sees it, and the per-provider
// OIDC configuration built from the columns trex already has.
//
// Nothing here mounts the plugin. This module is the declaration; wiring it
// into better-auth.ts waits on the migration that gives the table the plugin's
// own seven columns (see the note under ssoProviderSchema).

/**
 * The shape of trexdb.sso_provider as Better Auth sees it.
 *
 * The plugin's own model has exactly issuer, oidcConfig, samlConfig, userId,
 * providerId, organizationId and domain. Every policy trex carries per provider
 * has no column there, so each one is declared as an additional field. That is
 * not decoration and it is not only for reads:
 *
 *  - Undeclared columns are silently dropped from every adapter read, including
 *    the one resolveUser makes, so a resolver written against an undeclared
 *    column reads `undefined` and treats every provider as unrestricted
 *    (spike §3/Q3b).
 *  - `diffSchema` (@better-auth/core/dist/db/schema-diff.mjs:44-53) reports any
 *    NOT NULL column without a default that Better Auth does not write as an
 *    "unexpected-required-column", and `runWithTransaction` turns that into a
 *    thrown BetterAuthError on every transactional path — sign-up included, not
 *    only SSO sign-in. displayName, clientId and clientSecret are exactly those
 *    columns (NOT NULL, no default, since V1). Declaring them is what settles
 *    the schema check's complaint about them without relaxing the columns and
 *    without turning the check off for every table.
 *
 * The same diff counts a declared field as a column Better Auth writes and
 * reports a "missing-column" for one the table has not got, which throws just
 * as hard. So every field below names a column that exists at V19, and nothing
 * below describes a column that does not — jwks_endpoint in particular is NOT a
 * column: the resolved JWKS URL is baked into the serialized oidcConfig by
 * oidcConfigFor, which is itself persisted, so no column is needed for it.
 *
 * Still missing at V19, and the migration task's work rather than this one's:
 * the plugin's own "providerId" (UNIQUE), "domain", "oidcConfig", "samlConfig",
 * "userId" and "organizationId". Until those exist, mounting sso() makes the
 * schema check throw on every transactional path.
 *
 * modelName points at the existing table rather than creating a second one. One
 * row per provider stays the whole truth, so the admin API, loadProviders'
 * successor and the plugin can never disagree about which upstreams exist.
 */
export const ssoProviderSchema = {
  modelName: "sso_provider",
  additionalFields: {
    displayName: { type: "string", required: true, input: false },
    clientId: { type: "string", required: true, input: false },
    clientSecret: { type: "string", required: true, input: false },
    enabled: { type: "boolean", required: false, input: false },
    discovery_url: { type: "string", required: false, input: false },
    authorization_endpoint: { type: "string", required: false, input: false },
    scopes: { type: "string", required: false, input: false },
    // jsonb, not text. Better Auth maps `json` to jsonb and `string` to text
    // unconditionally — the same reason user_metadata and app_metadata are
    // `json` in better-auth.ts.
    claim_map: { type: "json", required: false, input: false },
    groups_source: { type: "string", required: false, input: false },
    groups_claim: { type: "string", required: false, input: false },
    link_policy: { type: "string", required: false, input: false },
    auto_provision: { type: "boolean", required: false, input: false },
    // TEXT[] (V12). The spike read this column back both ways and got a real JS
    // array each time — node-postgres parses the array before the adapter sees
    // it — so "string[]" is the honest description rather than a risk.
    email_domain_allowlist: { type: "string[]", required: false, input: false },
    allow_elevated_auto_link: { type: "boolean", required: false, input: false },
  },
  // `input: false` throughout is what stops a value arriving on the plugin's
  // own register/update endpoints from reaching one of trex's policy columns.
  // Provider rows are written by /admin/federation and nothing else.
} as const;

/** One trexdb.sso_provider row, as much of it as the OIDC configuration needs. */
export interface SsoProviderRow {
  clientId: string;
  clientSecret: string;
  issuer: string;
  discovery_url: string | null;
  authorization_endpoint: string | null;
  scopes: string;
  claim_map: Record<string, string>;
  /**
   * The upstream's JWKS URL, resolved from its discovery document by whoever
   * writes the row. Not a column: it is persisted inside the oidcConfig JSON
   * this function returns.
   */
  jwks_endpoint: string | null;
}

/**
 * The plugin's per-provider OIDC configuration, built from the columns trex
 * already has.
 *
 * jwksEndpoint is not optional in practice: the callback refuses outright when
 * an id_token arrives and the provider has none
 * (@better-auth/sso/dist/index.mjs:3893-3894), and an id_token always arrives
 * because resolveUser makes one mandatory (:3908). It is resolved from
 * discovery at write time rather than at sign-in time so a callback never
 * depends on an extra fetch succeeding.
 *
 * mapping.email names a claim, it cannot compute one. For an upstream whose
 * accounts are username-only this is the ONLY thing standing between a linked
 * user and dist/index.mjs:3938 — `if (!userInfo.email || !userInfo.id) return
 * redirectOIDCError(...)`, which runs after mapping and before the account
 * lookup, with no hook in between. A provider with no configured claim falls
 * back to "sub", which every id_token carries by definition. The value is never
 * treated as an address: with the account already linked, handleOAuthUserInfo
 * finds the owner by (providerId, accountId) and never compares it against, nor
 * writes it to, user.email.
 */
export function oidcConfigFor(row: SsoProviderRow): string {
  const map = row.claim_map ?? {};
  return JSON.stringify({
    issuer: row.issuer,
    clientId: row.clientId,
    clientSecret: row.clientSecret,
    pkce: true,
    discoveryEndpoint: row.discovery_url ??
      row.issuer.replace(/\/+$/, "") + "/.well-known/openid-configuration",
    ...(row.authorization_endpoint ? { authorizationEndpoint: row.authorization_endpoint } : {}),
    ...(row.jwks_endpoint ? { jwksEndpoint: row.jwks_endpoint } : {}),
    scopes: row.scopes.split(" ").filter((s) => s.length > 0),
    // What federation/router.ts:193 already does: the client secret goes in the
    // token request body. Moving to client_secret_basic would change how trex
    // authenticates at every registered upstream, which is not this cutover's
    // change to make.
    tokenEndpointAuthentication: "client_secret_post",
    // trex never rewrites a user's address from the upstream: user.email is
    // trex's own identifier, it is UNIQUE, and it is what the password grant
    // authenticates against. Leaving this false is what keeps the migrated
    // users' addresses intact when mapping.email points at a username claim.
    overrideUserInfo: false,
    mapping: {
      email: map.email ?? "sub",
      emailVerified: map.email_verified ?? "email_verified",
      name: map.name ?? "name",
    },
  });
}

/**
 * The redirect_uri every provider already has registered.
 *
 * request.ts's callbackUri derives this from the request when
 * TREX_FEDERATION_REDIRECT_URI is unset, but the plugin takes one fixed value
 * at construction time and has no request to derive anything from. A
 * deployment that federates therefore has to state it, and a missing value is
 * a boot-time error rather than a sign-in that fails at the upstream with a
 * redirect_uri it never registered.
 */
export function federationRedirectUri(
  configured: string | undefined = Deno.env.get("TREX_FEDERATION_REDIRECT_URI"),
): string {
  const value = configuredFederationRedirectUri(configured);
  if (value) return value;
  throw new Error(
    "TREX_FEDERATION_REDIRECT_URI must be set when federation is enabled: " +
      "@better-auth/sso takes one fixed redirect_uri and cannot derive it per request",
  );
}

/**
 * The same value, or `undefined` where a deployment has not stated one.
 *
 * This is what better-auth.ts passes, because the plugin is mounted
 * unconditionally and `federationRedirectUri()` evaluates at module scope: the
 * throwing form would make the variable mandatory for every deployment,
 * federating or not, and a missing one an import-time crash of the whole engine
 * rather than a federation that is simply switched off.
 *
 * Omitting the option is not a silent default into something wrong. The plugin
 * falls back to `${baseURL}/sso/callback` (getOIDCRedirectURI,
 * dist/index.mjs:3141-3143), which no upstream has registered — so a deployment
 * that federates without setting the variable fails at the upstream with an
 * unregistered redirect_uri, visibly, rather than anywhere quieter. The
 * throwing form stays for whoever needs the value to exist.
 */
export function configuredFederationRedirectUri(
  configured: string | undefined = Deno.env.get("TREX_FEDERATION_REDIRECT_URI"),
): string | undefined {
  return configured && configured.length > 0 ? configured : undefined;
}
