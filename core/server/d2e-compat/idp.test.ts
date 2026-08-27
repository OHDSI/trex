import { assertEquals, assertThrows } from "jsr:@std/assert";
import { d2eIdp, isSystemAdminClaims, resolveIdpConfig } from "./idp.ts";

const LOGTO_ENV = {
  LOGTO__ISSUER: "https://logto.example/oidc",
  LOGTO__AUDIENCES: "https://api.example",
  LOGTO__CLIENT_ID: "portal-app",
  LOGTO__CLIENT_SECRET: "shh",
  LOGTO__SCOPE: "openid profile email offline_access",
  LOGTO__TOKEN_URL: "https://logto.example/oidc/token",
  LOGTO__RESOURCE_API: "https://api.example",
};

Deno.test("d2eIdp defaults to logto", () => {
  assertEquals(d2eIdp({}), "logto");
  assertEquals(d2eIdp({ D2E_IDP: "" }), "logto");
  assertEquals(d2eIdp({ D2E_IDP: "  LoGto " }), "logto");
  assertEquals(d2eIdp({ D2E_IDP: "trex" }), "trex");
});

Deno.test("an unrecognised D2E_IDP is refused, not silently treated as logto", () => {
  // A typo must not verify tokens against the wrong issuer.
  assertThrows(() => d2eIdp({ D2E_IDP: "logot" }), Error, "unknown D2E_IDP");
});

// ── The regression that matters: an existing d2e sets no D2E_IDP, and every
// value it gets must be what the pre-switch code read from LOGTO__* directly.
Deno.test("with no D2E_IDP every value matches the pre-switch Logto behaviour", () => {
  const c = resolveIdpConfig(LOGTO_ENV);
  assertEquals(c.idp, "logto");
  assertEquals(c.issuer, LOGTO_ENV.LOGTO__ISSUER);
  assertEquals(c.jwksUri, `${LOGTO_ENV.LOGTO__ISSUER}/jwks`);
  assertEquals(c.audiences, ["https://api.example"]);
  assertEquals(c.clientId, "portal-app");
  assertEquals(c.clientSecret, "shh");
  assertEquals(c.scope, "openid profile email offline_access");
  assertEquals(c.tokenUrl, "https://logto.example/oidc/token");
  assertEquals(c.resource, "https://api.example");
  // The exact paths /portal/env.js appended to the gateway origin before.
  assertEquals(c.authorizePath, "oidc/auth");
  assertEquals(c.endSessionPath, "oidc/session/end");
});

Deno.test("logto: LOGTO__CLIENT_SECRET wins over the WebAPI alias", () => {
  // This precedence used to be the other way round. SECURITY_AUTH_OIDC_APISECRET
  // belongs to WebAPI, and WebAPI can now be pointed at a different issuer than
  // the portal: with WebAPI on trex and d2e-compat still on Logto, that variable
  // holds trex's secret. Preferring it sent trex's secret to Logto, which 401s
  // the code exchange, and the failure only surfaced later as an undefined
  // access_token.
  const c = resolveIdpConfig({ ...LOGTO_ENV, SECURITY_AUTH_OIDC_APISECRET: "trex-secret" });
  assertEquals(c.clientSecret, "shh");
});

Deno.test("logto: the WebAPI alias is still used when no LOGTO__CLIENT_SECRET is set", () => {
  // Kept for deployments that only ever set the alias; dropping it outright
  // would silently unauthenticate them.
  const { LOGTO__CLIENT_SECRET: _drop, ...noSecret } = LOGTO_ENV;
  const c = resolveIdpConfig({ ...noSecret, SECURITY_AUTH_OIDC_APISECRET: "from-webapi" });
  assertEquals(c.clientSecret, "from-webapi");
});

Deno.test("logto: audience falls back to LOGTO__RESOURCE_API, and splits a list", () => {
  const { LOGTO__AUDIENCES: _drop, ...noAud } = LOGTO_ENV;
  assertEquals(resolveIdpConfig(noAud).audiences, ["https://api.example"]);
  assertEquals(
    resolveIdpConfig({ ...LOGTO_ENV, LOGTO__AUDIENCES: "a, b ,c" }).audiences,
    ["a", "b", "c"],
  );
});

Deno.test("logto: an unset issuer yields no jwks uri rather than a bogus one", () => {
  const c = resolveIdpConfig({});
  assertEquals(c.issuer, "");
  assertEquals(c.jwksUri, "");
});

Deno.test("trex: issuer, jwks and token endpoint come from the provider's own config", () => {
  const c = resolveIdpConfig({
    ...LOGTO_ENV,
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://trex.example",
    TREX_OIDC_CLIENT_ID: "d2e-portal",
    TREX_OIDC_CLIENT_SECRET: "t-secret",
  }, "");
  assertEquals(c.idp, "trex");
  assertEquals(c.issuer, "https://trex.example/oidc");
  assertEquals(c.jwksUri, "https://trex.example/oidc/.well-known/jwks.json");
  assertEquals(c.tokenUrl, "https://trex.example/oidc/token");
  assertEquals(c.clientId, "d2e-portal");
  assertEquals(c.clientSecret, "t-secret");
  assertEquals(c.audiences, ["d2e-portal"]);
  assertEquals(c.authorizePath, "oidc/authorize");
  // Selecting trex must not leak Logto's endpoints through.
  assertEquals(c.tokenUrl.includes("logto"), false);
  assertEquals(c.issuer.includes("logto"), false);
});

Deno.test("trex: the issuer carries the base path AND the /oidc mount", () => {
  // Must match registerOidcRoutes/buildReturnTo, or token `iss` validation fails.
  // The /oidc segment used to be missing here, which left the issuer naming a
  // path one level above its own discovery document -- see the spec test below.
  const c = resolveIdpConfig({ D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://trex.example" }, "/trex");
  assertEquals(c.issuer, "https://trex.example/trex/oidc");
  assertEquals(c.jwksUri, "https://trex.example/trex/oidc/.well-known/jwks.json");
});

Deno.test("trex: D2E_IDP_AUDIENCES overrides the client-id default", () => {
  const c = resolveIdpConfig({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://trex.example",
    TREX_OIDC_CLIENT_ID: "d2e-portal",
    D2E_IDP_AUDIENCES: "one,two",
  }, "");
  assertEquals(c.audiences, ["one", "two"]);
});

// ── Admin claims ────────────────────────────────────────────────────────────
Deno.test("logto admin claim shapes are unchanged", () => {
  assertEquals(isSystemAdminClaims({ roles: ["role.systemadmin"] }, "logto"), true);
  assertEquals(
    isSystemAdminClaims({ userMgmtGroups: { alp_role_system_admin: true } }, "logto"),
    true,
  );
  assertEquals(isSystemAdminClaims({ roles: ["role.researcher"] }, "logto"), false);
  assertEquals(isSystemAdminClaims({}, "logto"), false);
});

Deno.test("trex's own admin flag counts only under the trex IdP", () => {
  assertEquals(isSystemAdminClaims({ trex_role: "admin" }, "trex"), true);
  assertEquals(isSystemAdminClaims({ app_metadata: { trex_role: "admin" } }, "trex"), true);
  // A Logto-issued token must not gain admin from a claim trex would honour.
  assertEquals(isSystemAdminClaims({ trex_role: "admin" }, "logto"), false);
  assertEquals(isSystemAdminClaims({ trex_role: "user" }, "trex"), false);
});

Deno.test("named app roles authorize under either IdP", () => {
  assertEquals(isSystemAdminClaims({ roles: ["role.systemadmin"] }, "trex"), true);
});

Deno.test("trex: the issuer names the /oidc mount, so discovery sits under it", () => {
  // OIDC Discovery requires the document at <issuer>/.well-known/openid-configuration.
  // The provider mounts at `${BASE_PATH}/oidc`, so an issuer of just `${BASE_PATH}`
  // puts the document one segment below where the issuer says it should be. Spring's
  // fromOidcIssuerLocation compares the two and fails its ClientRegistration bean
  // with "Unable to resolve Configuration with the provided Issuer", taking WebAPI
  // down with it -- the whole cache pipeline then strands on "Cache not ready".
  const c = resolveIdpConfig(
    { D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://d2e.example:41100" },
    "/trex",
  );
  assertEquals(c.issuer, "https://d2e.example:41100/trex/oidc");
  assertEquals(
    c.jwksUri,
    "https://d2e.example:41100/trex/oidc/.well-known/jwks.json",
  );
  assertEquals(c.tokenUrl, "https://d2e.example:41100/trex/oidc/token");
  // The invariant that actually matters, stated directly.
  assertEquals(c.jwksUri.startsWith(c.issuer + "/"), true);
});

Deno.test("trex: browser paths carry the base path the front door proxies", () => {
  // The d2e gateway routes a bare /oidc/* to Logto and proxies /trex/* to this
  // node without stripping. Emitting "oidc/authorize" therefore sent the portal
  // login to Logto, which knows none of trex's clients or sessions -- the user
  // never reaches the provider that is supposed to authenticate them.
  const c = resolveIdpConfig(
    { D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://d2e.example:41100" },
    "/trex",
  );
  assertEquals(c.authorizePath, "trex/oidc/authorize");
  assertEquals(c.endSessionPath, "trex/oidc/session/end");
  // The gateway builds `${origin}/${authorizePath}`, which must land on the
  // endpoint the discovery document advertises.
  assertEquals(
    `https://d2e.example:41100/${c.authorizePath}`,
    `${c.issuer}/authorize`,
  );
});

Deno.test("trex: browser paths follow a deployment mounted at the root", () => {
  const c = resolveIdpConfig(
    { D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://d2e.example" },
    "",
  );
  assertEquals(c.authorizePath, "oidc/authorize");
  assertEquals(`https://d2e.example/${c.authorizePath}`, `${c.issuer}/authorize`);
});
