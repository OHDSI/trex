// What survives of the hand-written provider's suite: the configuration
// helpers and the federation block, both of which outlived the eight modules
// the cutover deleted.
//
// Everything that asserted protocol behaviour — redirect_uri matching, PKCE,
// scope narrowing, code issue and consume, the id_token claim builder,
// return_to — asserted an implementation that no longer exists.
// @better-auth/oauth-provider owns those rules now, and the way to assert them
// is against the mounted provider rather than against a helper:
// discovery.test.ts and soft-delete.test.ts start that, and task 8 finishes it.
// The claim shapes themselves are covered by custom-claims.test.ts, which tests
// the callbacks that replaced buildIdTokenClaims.
import { assertEquals } from "jsr:@std/assert";
import { federationFromAppMetadata, IDP_METADATA_KEY } from "./claims.ts";
import {
  issuerUrl,
  loginUrl,
  oidcProviderEnabled,
  parseSeedClient,
  readCookie,
} from "./config.ts";

Deno.test("the provider is off unless explicitly enabled", () => {
  for (const v of [undefined, "", "false", "0", "yes", "TRUE"]) {
    assertEquals(oidcProviderEnabled(v), false, `expected off for ${JSON.stringify(v)}`);
  }
  assertEquals(oidcProviderEnabled("true"), true);
  assertEquals(oidcProviderEnabled("1"), true);
});

Deno.test("the issuer is taken from configuration, not from the request", () => {
  assertEquals(issuerUrl("https://example.test", "/trex"), "https://example.test/trex");
  // Trailing slashes would otherwise produce a doubled separator and an `iss`
  // that no relying party matches.
  assertEquals(issuerUrl("https://example.test/", "/trex"), "https://example.test/trex");
  assertEquals(issuerUrl("https://example.test///", ""), "https://example.test");
});

Deno.test("cookie reading picks the right value", () => {
  const header = "other=1; sb-access-token=abc.def.ghi; another=2";
  assertEquals(readCookie(header, "sb-access-token"), "abc.def.ghi");
  assertEquals(readCookie(header, "missing"), null);
  assertEquals(readCookie(undefined, "sb-access-token"), null);
  // A cookie whose name merely contains the one we want must not match.
  assertEquals(readCookie("xsb-access-token=nope", "sb-access-token"), null);
});

Deno.test("loginUrl is null unless configured, so the refusal redirect fails closed", () => {
  assertEquals(loginUrl(undefined), null);
  assertEquals(loginUrl(""), null);
  assertEquals(loginUrl("https://example.test/login"), "https://example.test/login");
});

Deno.test("no seeded client without an id or a redirect uri", () => {
  assertEquals(parseSeedClient({}), null);
  assertEquals(parseSeedClient({ TREX_OIDC_CLIENT_ID: "  " }), null);
  // An id with nowhere to redirect could never complete a flow.
  assertEquals(parseSeedClient({ TREX_OIDC_CLIENT_ID: "app" }), null);
  assertEquals(
    parseSeedClient({ TREX_OIDC_CLIENT_ID: "app", TREX_OIDC_CLIENT_REDIRECT_URIS: "  " }),
    null,
  );
});

Deno.test("a seeded client reads its uris as a list, however they are separated", () => {
  const spec = parseSeedClient({
    TREX_OIDC_CLIENT_ID: "d2e-webapi",
    TREX_OIDC_CLIENT_SECRET: "s3cret",
    TREX_OIDC_CLIENT_NAME: "WebAPI",
    TREX_OIDC_CLIENT_REDIRECT_URIS: "https://a.test/cb/openid, https://b.test/cb/openid",
    TREX_OIDC_CLIENT_POST_LOGOUT_URIS: "https://a.test/atlas/",
  });
  assertEquals(spec?.clientId, "d2e-webapi");
  assertEquals(spec?.clientSecret, "s3cret");
  assertEquals(spec?.name, "WebAPI");
  assertEquals(spec?.redirectUris, ["https://a.test/cb/openid", "https://b.test/cb/openid"]);
  assertEquals(spec?.postLogoutRedirectUris, ["https://a.test/atlas/"]);
});

// A scope is grantable only if the client lists it, and the column default is
// openid/profile/email — so without this the idp_groups scope could never
// reach the client trex seeds for itself.
Deno.test("a seeded client can be configured with the scopes it may be granted", () => {
  const base = {
    TREX_OIDC_CLIENT_ID: "d2e-webapi",
    TREX_OIDC_CLIENT_REDIRECT_URIS: "https://a.test/cb/openid",
  };
  assertEquals(
    parseSeedClient({ ...base, TREX_OIDC_CLIENT_SCOPES: "openid profile email idp_groups" })
      ?.allowedScopes,
    ["openid", "profile", "email", "idp_groups"],
  );
  // openid is what makes the request an OIDC one; /authorize refuses without
  // it, so a list that omits it gets it.
  assertEquals(
    parseSeedClient({ ...base, TREX_OIDC_CLIENT_SCOPES: "email, idp_groups" })?.allowedScopes,
    ["openid", "email", "idp_groups"],
  );
  // Unset means "leave the row's scopes alone", not "reset them".
  assertEquals(parseSeedClient(base)?.allowedScopes, undefined);
  assertEquals(
    parseSeedClient({ ...base, TREX_OIDC_CLIENT_SCOPES: "  " })?.allowedScopes,
    undefined,
  );
});

Deno.test("a seeded client carries the roles it is configured with", () => {
  const spec = parseSeedClient({
    TREX_OIDC_CLIENT_ID: "d2e-webapi",
    TREX_OIDC_CLIENT_SECRET: "s3cret",
    TREX_OIDC_CLIENT_REDIRECT_URIS: "https://a.test/cb/openid",
    TREX_OIDC_CLIENT_ROLES: "ALP_USER_ADMIN, ALP_SYSTEM_ADMIN",
  });
  assertEquals(spec?.clientRoles, ["ALP_USER_ADMIN", "ALP_SYSTEM_ADMIN"]);
});

Deno.test("a seeded client with no roles configured carries none", () => {
  const spec = parseSeedClient({
    TREX_OIDC_CLIENT_ID: "d2e-webapi",
    TREX_OIDC_CLIENT_REDIRECT_URIS: "https://a.test/cb/openid",
  });
  assertEquals(spec?.clientRoles, []);
});

Deno.test("a seeded client without a secret is public and falls back to its id for a name", () => {
  const spec = parseSeedClient({
    TREX_OIDC_CLIENT_ID: "atlas",
    TREX_OIDC_CLIENT_REDIRECT_URIS: "https://a.test/cb",
  });
  assertEquals(spec?.clientSecret, undefined);
  assertEquals(spec?.name, "atlas");
  assertEquals(spec?.postLogoutRedirectUris, []);
});

// ── The federated-session end of the claims contract ────────────────────────
//
// The producer is federation/router.ts, which writes trexdb."user".app_metadata
// inside the callback transaction; the consumer is oidc/custom-claims.ts, which
// spreads federationFromAppMetadata(user.app_metadata) into the claims the
// plugin emits. These exercise the join between the two without a database.

Deno.test("a federated session's app_metadata is read back as provider and groups", () => {
  const written = {
    provider: "sso",
    trex_role: "user",
    [IDP_METADATA_KEY]: { provider: "logto", groups: ["alp-admins", "study-42"] },
  };
  assertEquals(federationFromAppMetadata(written), {
    idpProvider: "logto",
    idpGroups: ["alp-admins", "study-42"],
  });
});

Deno.test("a native session's app_metadata yields no idp fields at all", () => {
  const native = { provider: "email", providers: ["email"], trex_role: "user" };
  assertEquals(federationFromAppMetadata(native), {});
});

// app_metadata is a free-form JSONB column that long predates federation.
Deno.test("a malformed federation block degrades to a native session", () => {
  assertEquals(federationFromAppMetadata(null), {});
  assertEquals(federationFromAppMetadata(undefined), {});
  assertEquals(federationFromAppMetadata("nonsense"), {});
  assertEquals(federationFromAppMetadata({ [IDP_METADATA_KEY]: "logto" }), {});
  assertEquals(federationFromAppMetadata({ [IDP_METADATA_KEY]: { groups: ["a"] } }), {});
  assertEquals(federationFromAppMetadata({ [IDP_METADATA_KEY]: { provider: "" } }), {});
  // A provider with an unusable group list is still a federated session; it
  // simply asserts no groups, rather than being demoted to a native one.
  assertEquals(
    federationFromAppMetadata({ [IDP_METADATA_KEY]: { provider: "logto" } }),
    { idpProvider: "logto", idpGroups: [] },
  );
  assertEquals(
    federationFromAppMetadata({ [IDP_METADATA_KEY]: { provider: "logto", groups: [1, 2] } }),
    { idpProvider: "logto", idpGroups: [] },
  );
});
