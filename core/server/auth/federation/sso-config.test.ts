import { assertEquals } from "jsr:@std/assert";
import { federationRedirectUri, oidcConfigFor, ssoProviderSchema } from "./sso-config.ts";

Deno.test("every trex-only provider column is declared as an additional field", () => {
  // Better Auth's ssoProvider has issuer, oidcConfig, samlConfig, userId,
  // providerId, organizationId and domain, and nothing else. Any NOT NULL
  // column on trexdb.sso_provider that it does not know about makes every
  // insert into the table fail, and its schema check reports it as an
  // "unexpected-required-column".
  const declared = Object.keys(ssoProviderSchema.additionalFields);
  for (
    const column of [
      "displayName",
      "clientId",
      "clientSecret",
      "enabled",
      "discovery_url",
      "authorization_endpoint",
      "scopes",
      "claim_map",
      "groups_source",
      "groups_claim",
      "link_policy",
      "auto_provision",
      "email_domain_allowlist",
      "allow_elevated_auto_link",
    ]
  ) {
    assertEquals(declared.includes(column), true, `${column} is not declared`);
  }
});

Deno.test("the declared model names the existing table rather than a second one", () => {
  // One row per provider stays the whole truth: the admin API, loadProviders'
  // successor and the plugin all address trexdb.sso_provider or they can
  // disagree about which upstreams exist.
  assertEquals(ssoProviderSchema.modelName, "sso_provider");
});

Deno.test("no additional field names a column trexdb.sso_provider has not got", () => {
  // diffSchema counts every declared field as a column Better Auth writes and
  // reports a "missing-column" for one the table has not got — which throws on
  // every transactional path, sign-up included, not only on SSO sign-in. So an
  // additional field is a claim about the live schema, and this pins the claim
  // against core/schema rather than against the brief that listed them.
  //
  // The plugin's OWN seven columns are a separate matter: they are missing at
  // V19 too and the migration task adds them. This test is only about the
  // fields declared here.
  const columnsAtV19 = new Set([
    "id",
    "displayName",
    "clientId",
    "clientSecret",
    "enabled",
    "createdAt",
    "updatedAt",
    "issuer",
    "discovery_url",
    "scopes",
    "claim_map",
    "groups_source",
    "groups_claim",
    "link_policy",
    "auto_provision",
    "email_domain_allowlist",
    "allow_elevated_auto_link",
    "authorization_endpoint",
  ]);
  for (const [field, attrs] of Object.entries(ssoProviderSchema.additionalFields)) {
    const column = (attrs as { fieldName?: string }).fieldName ?? field;
    assertEquals(
      columnsAtV19.has(column),
      true,
      `${column} is declared but trexdb.sso_provider has no such column at V19`,
    );
  }
});

Deno.test("claim_map is declared as json, because the column is jsonb", () => {
  // Better Auth maps `json` onto jsonb and `string` onto text unconditionally,
  // the same reason user_metadata and app_metadata are `json` in
  // better-auth.ts. Declaring a jsonb column as `string` describes the wrong
  // column type and hands the resolver a string where the row holds an object.
  assertEquals(ssoProviderSchema.additionalFields.claim_map.type, "json");
});

Deno.test("no additional field is writable through the plugin's own endpoints", () => {
  // Provider rows are written by /admin/federation and nothing else. `input:
  // false` is what stops a value arriving on the plugin's register/update
  // endpoints from reaching one of trex's policy columns.
  for (const [field, attrs] of Object.entries(ssoProviderSchema.additionalFields)) {
    assertEquals((attrs as { input?: boolean }).input, false, `${field} accepts input`);
  }
});

Deno.test("oidcConfig carries the jwksEndpoint the callback insists on", () => {
  // dist/index.mjs:3893-3894: a callback with no jwksEndpoint redirects with
  // invalid_provider/jwks_endpoint_not_found before anything else happens.
  const config = JSON.parse(oidcConfigFor({
    clientId: "c",
    clientSecret: "s",
    issuer: "https://logto.example.test",
    discovery_url: null,
    authorization_endpoint: null,
    scopes: "openid profile email",
    claim_map: {},
    jwks_endpoint: "https://logto.example.test/oidc/jwks",
  }));
  assertEquals(config.jwksEndpoint, "https://logto.example.test/oidc/jwks");
  assertEquals(
    config.discoveryEndpoint,
    "https://logto.example.test/.well-known/openid-configuration",
  );
  assertEquals(config.pkce, true);
  assertEquals(config.scopes, ["openid", "profile", "email"]);
  assertEquals(config.overrideUserInfo, false);
});

Deno.test("mapping.email names a claim the upstream emits, falling back to sub", () => {
  // @better-auth/sso@1.7.5 dist/index.mjs:3938 refuses an identity whose
  // mapped email claim is absent, after mapping and before the account lookup,
  // with no hook in between. `sub` is the one claim every OIDC upstream is
  // required to emit, so it is the only safe fallback.
  const fallback = JSON.parse(oidcConfigFor({
    clientId: "c",
    clientSecret: "s",
    issuer: "https://logto.example.test",
    discovery_url: null,
    authorization_endpoint: null,
    scopes: "openid",
    claim_map: {},
    jwks_endpoint: null,
  }));
  assertEquals(fallback.mapping.email, "sub");

  const configured = JSON.parse(oidcConfigFor({
    clientId: "c",
    clientSecret: "s",
    issuer: "https://logto.example.test",
    discovery_url: null,
    authorization_endpoint: null,
    scopes: "openid",
    claim_map: { email: "username", name: "display_name" },
    jwks_endpoint: null,
  }));
  assertEquals(configured.mapping.email, "username");
  assertEquals(configured.mapping.name, "display_name");
  assertEquals(configured.mapping.emailVerified, "email_verified");
});

Deno.test("an absent jwks endpoint is omitted rather than serialized as null", () => {
  // OIDCConfig declares jwksEndpoint optional; a literal null is not the same
  // as absent to a `if (!provider.jwksEndpoint)` test, but it IS the same to
  // one reading the JSON back into a typed object, and a null would pass a
  // presence check written as `"jwksEndpoint" in config`.
  const config = JSON.parse(oidcConfigFor({
    clientId: "c",
    clientSecret: "s",
    issuer: "https://logto.example.test/",
    discovery_url: null,
    authorization_endpoint: null,
    scopes: "openid",
    claim_map: {},
    jwks_endpoint: null,
  }));
  assertEquals("jwksEndpoint" in config, false);
  assertEquals("authorizationEndpoint" in config, false);
  // The trailing slash on the issuer must not produce a double slash.
  assertEquals(
    config.discoveryEndpoint,
    "https://logto.example.test/.well-known/openid-configuration",
  );
});

Deno.test("an explicit discovery_url and authorization_endpoint win", () => {
  // V13's reason: d2e's Logto serves discovery over an internal hostname but
  // names an authorize URL no browser can resolve.
  const config = JSON.parse(oidcConfigFor({
    clientId: "c",
    clientSecret: "s",
    issuer: "https://logto.internal:3001/oidc",
    discovery_url: "https://logto.internal:3001/oidc/.well-known/openid-configuration",
    authorization_endpoint: "https://logto.example.test/oidc/auth",
    scopes: "openid",
    claim_map: {},
    jwks_endpoint: null,
  }));
  assertEquals(
    config.discoveryEndpoint,
    "https://logto.internal:3001/oidc/.well-known/openid-configuration",
  );
  assertEquals(config.authorizationEndpoint, "https://logto.example.test/oidc/auth");
});

Deno.test("the token endpoint authentication matches what federation/router.ts sends today", () => {
  // router.ts:193 posts client_secret in the body. Switching the cutover to
  // client_secret_basic at the same time would change how trex authenticates
  // at every upstream, which is not this phase's change to make.
  const config = JSON.parse(oidcConfigFor({
    clientId: "c",
    clientSecret: "s",
    issuer: "https://logto.example.test",
    discovery_url: null,
    authorization_endpoint: null,
    scopes: "openid",
    claim_map: {},
    jwks_endpoint: null,
  }));
  assertEquals(config.tokenEndpointAuthentication, "client_secret_post");
});

Deno.test("federationRedirectUri refuses to invent a value", () => {
  // The plugin takes one fixed redirect_uri at construction and has no request
  // to derive one from. A missing value must be a boot-time error, not a
  // sign-in that fails at the upstream with a redirect_uri it never registered.
  assertEquals(federationRedirectUri("https://trex.example.test/auth/v1/callback"), "https://trex.example.test/auth/v1/callback");
  let threw = false;
  try {
    federationRedirectUri(undefined);
  } catch (error) {
    threw = true;
    assertEquals((error as Error).message.includes("TREX_FEDERATION_REDIRECT_URI"), true);
  }
  assertEquals(threw, true);

  let threwOnEmpty = false;
  try {
    federationRedirectUri("");
  } catch {
    threwOnEmpty = true;
  }
  assertEquals(threwOnEmpty, true);
});
