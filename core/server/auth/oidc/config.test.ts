// The configuration helpers: everything in config.ts is a pure function of its
// input, so these need neither a database nor a listener.
//
// What used to share this file — the hand-written provider's protocol suite —
// went with the eight modules the cutover deleted, and the rules it asserted
// are now the plugin's. They are pinned against the mounted provider instead:
// authorize.test.ts for redirect_uri and scope, grants.test.ts for PKCE and the
// three grants, end-session.test.ts for the post-logout list, and
// custom-claims.test.ts for the claim set.
import { assertEquals } from "jsr:@std/assert";
import {
  issuerUrl,
  loginUrl,
  oidcProviderEnabled,
  parseSeedClient,
  readCookie,
} from "./config.ts";
// The one cross-module invariant this file pins: the scope list the seeder
// writes must cover the scope d2e-compat asks for, and neither side reads the
// other.
import { resolveIdpConfig } from "../../d2e-compat/idp.ts";

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

// A default port makes `iss` differ from the provider's own discovery document,
// which publishes the normalised origin. Spring rejects the id_token and the
// end-session handler rejects every hint, both before any key set is consulted.
Deno.test("a default port is dropped so `iss` matches the discovery document", () => {
  assertEquals(
    issuerUrl("https://example.test:443", "/trex/oidc"),
    "https://example.test/trex/oidc",
  );
  // The shape an interpolated `https://${FQDN}:${PORT:-443}` actually produces.
  assertEquals(issuerUrl("https://localhost:443", "/trex/oidc"), "https://localhost/trex/oidc");
  assertEquals(issuerUrl("http://example.test:80", "/trex/oidc"), "http://example.test/trex/oidc");
});

// TREX_OIDC_INTERNAL_BASE names http://<host>:33001, and that port is the only
// reason the value exists.
Deno.test("a non-default port is preserved", () => {
  assertEquals(
    issuerUrl("http://alp-trex:33001", "/trex/oidc"),
    "http://alp-trex:33001/trex/oidc",
  );
  assertEquals(issuerUrl("https://example.test:8443", ""), "https://example.test:8443");
  // The default port of the OTHER scheme is not this scheme's default.
  assertEquals(issuerUrl("https://example.test:80", ""), "https://example.test:80");
  assertEquals(issuerUrl("http://example.test:443", ""), "http://example.test:443");
});

// Reported by assertIssuerScheme, which says what is wrong; throwing from the
// normaliser would replace that with a TypeError.
Deno.test("a value that is not a URL is passed through untouched", () => {
  assertEquals(issuerUrl("not a url", "/trex/oidc"), "not a url/trex/oidc");
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
    parseSeedClient({
      ...base,
      TREX_OIDC_CLIENT_SCOPES: "openid profile email offline_access idp_groups",
    })?.allowedScopes,
    ["openid", "profile", "email", "offline_access", "idp_groups"],
  );
  // openid is what makes the request an OIDC one; /authorize refuses without
  // it, so a list that omits it gets it.
  assertEquals(
    parseSeedClient({
      ...base,
      TREX_OIDC_CLIENT_SCOPES: "email, idp_groups, offline_access",
    })?.allowedScopes,
    ["openid", "email", "idp_groups", "offline_access"],
  );
  // Unset means "leave the row's scopes alone", not "reset them".
  assertEquals(parseSeedClient(base)?.allowedScopes, undefined);
  assertEquals(
    parseSeedClient({ ...base, TREX_OIDC_CLIENT_SCOPES: "  " })?.allowedScopes,
    undefined,
  );
});

Deno.test("a configured scope list gets offline_access whether or not it asked", () => {
  // d2e-compat requests `openid profile email offline_access` on EVERY sign-in,
  // and /authorize refuses any scope outside `client.scopes`
  // (dist/authorize-riRRCSbC.mjs:5558-5562). So a scope list written the way it
  // would have been before the provider moved -- "openid,profile,email" -- does
  // not merely lose silent renewal, it fails every login, naming a scope the
  // operator never typed. The column's own first-insert default in
  // seed-client.ts already carries offline_access; this stops an explicit list
  // from disagreeing with it.
  const base = {
    TREX_OIDC_CLIENT_ID: "d2e-portal",
    TREX_OIDC_CLIENT_REDIRECT_URIS: "https://a.test/cb",
  };
  const scopes = parseSeedClient({
    ...base,
    TREX_OIDC_CLIENT_SCOPES: "openid,profile,email",
  })?.allowedScopes;
  assertEquals(scopes?.includes("offline_access"), true);
  // Still exactly one entry: forcing it must not duplicate a list that has it.
  const already = parseSeedClient({
    ...base,
    TREX_OIDC_CLIENT_SCOPES: "openid,profile,email,offline_access",
  })?.allowedScopes ?? [];
  assertEquals(already.filter((s) => s === "offline_access").length, 1);
});

Deno.test("the seeded scope list is a superset of what d2e-compat requests", () => {
  // The two defaults live in different modules and neither reads the other, so
  // this is the only thing stopping them drifting: every scope the portal asks
  // for on the authorize leg must be one the client row allows, or the sign-in
  // is refused before a code is ever issued.
  const requested = resolveIdpConfig(
    { D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://d2e.example" },
    "/trex",
  ).scope.split(" ");
  const allowed = parseSeedClient({
    TREX_OIDC_CLIENT_ID: "d2e-portal",
    TREX_OIDC_CLIENT_REDIRECT_URIS: "https://a.test/cb",
    TREX_OIDC_CLIENT_SCOPES: "openid,profile,email",
  })?.allowedScopes ?? [];
  assertEquals(requested.filter((s) => !allowed.includes(s)), []);
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
