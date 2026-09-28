import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  d2eIdp,
  isSystemAdminClaims,
  resolveIdpConfig,
  warnOnUnmatchableAudience,
} from "./idp.ts";

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
  // The secret still rides in the body and no Basic header is sent beside it.
  // Logto refuses a request that presents client auth twice, so an existing
  // deployment would stop being able to sign in at all if this moved.
  assertEquals(c.tokenEndpointAuthMethod, "client_secret_post");
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
  assertEquals(c.tokenUrl, "https://trex.example/oidc/oauth2/token");
  assertEquals(c.clientId, "d2e-portal");
  assertEquals(c.clientSecret, "t-secret");
  // Basic, and it is load-bearing. There is exactly one seeded client row and
  // WebAPI shares it; Spring Security authenticates client_secret_basic and
  // cannot be told otherwise, so the row is registered basic
  // (auth/oidc/seed-client.ts) and this proxy is the side that moved. A row and
  // a proxy that disagree produce
  // `client registered for client_secret_basic cannot use client_secret_post`
  // and break every portal call.
  assertEquals(c.tokenEndpointAuthMethod, "client_secret_basic");
  assertEquals(c.audiences, ["https://trex.example/oidc", "d2e-portal"]);
  assertEquals(c.authorizePath, "oidc/oauth2/authorize");
  // Selecting trex must not leak Logto's endpoints through.
  assertEquals(c.tokenUrl.includes("logto"), false);
  assertEquals(c.issuer.includes("logto"), false);
});

Deno.test("trex: the issuer carries the base path AND the /oidc mount", () => {
  // Must match the provider's own issuer, or token `iss` validation fails.
  // The /oidc segment used to be missing here, which left the issuer naming a
  // path one level above its own discovery document -- see the spec test below.
  const c = resolveIdpConfig({ D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://trex.example" }, "/trex");
  assertEquals(c.issuer, "https://trex.example/trex/oidc");
  assertEquals(c.jwksUri, "https://trex.example/trex/oidc/.well-known/jwks.json");
});

Deno.test("trex: D2E_IDP_AUDIENCES overrides the default pair", () => {
  const c = resolveIdpConfig({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://trex.example",
    TREX_OIDC_CLIENT_ID: "d2e-portal",
    D2E_IDP_AUDIENCES: "one,two",
  }, "");
  assertEquals(c.audiences, ["one", "two"]);
});

Deno.test("trex: the audience list names the resource the access token carries", () => {
  // Measured against the plugin: the access token's `aud` is
  // ["<resource identifier>", "<issuer>/oauth2/userinfo"] and never the client
  // id, which rides as `client_id`/`azp`. The resource identifier is the issuer
  // (auth/oidc/provider.ts declares `resources: [oidcIssuer()]`). The portal
  // presents that access token to the d2e-compat gate, so a list holding only
  // the client id 401s every portal call.
  const c = resolveIdpConfig({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://d2e.example:41100",
    TREX_OIDC_CLIENT_ID: "d2e-portal",
  }, "/trex");
  assertEquals(c.audiences[0], c.issuer);
});

Deno.test("trex: the client id stays on the list, because the id_token carries it", () => {
  // The id_token's `aud` IS the client id, and it is the token
  // scripts/lib/idp-login.cjs prefers (`body.id_token || body.access_token`).
  // Dropping the client id in favour of the resource would unauthenticate it.
  const c = resolveIdpConfig({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://d2e.example:41100",
    TREX_OIDC_CLIENT_ID: "d2e-portal",
  }, "/trex");
  assertEquals(c.audiences.includes("d2e-portal"), true);
});

Deno.test("trex: no client id yields the resource alone, not a blank audience", () => {
  // A deployment that registers no client still has a resource to check against.
  // The default is built by joining, so an unset client id leaves a trailing
  // separator; splitList is what drops the empty entry. Pinned because an
  // audience list carrying "" is one jose can never match, and the mismatch
  // would read as a signing problem rather than as a missing client id.
  const c = resolveIdpConfig(
    { D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://d2e.example:41100" },
    "/trex",
  );
  assertEquals(c.audiences, ["https://d2e.example:41100/trex/oidc"]);
});

Deno.test("trex: the token request names the issuer as its resource", () => {
  // Without a resource on the exchange the plugin mints an OPAQUE access token
  // (no audience claim -> not a JWT), which the portal cannot decode for `roles`
  // and auth.ts cannot verify. The portal's /authorize leg sends no `resource`,
  // so the /oauth/token proxy is the only leg left to supply one.
  const c = resolveIdpConfig(
    { D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://d2e.example:41100" },
    "/trex",
  );
  assertEquals(c.resource, c.issuer);
  // The resource is what lands in `aud`, so it must be the value the audience
  // list expects -- the two cannot be configured apart by accident.
  assertEquals(c.audiences.includes(c.resource), true);
});

Deno.test("trex: D2E_IDP_RESOURCE still overrides the issuer default", () => {
  const c = resolveIdpConfig({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://d2e.example:41100",
    D2E_IDP_RESOURCE: "https://api.example",
  }, "/trex");
  assertEquals(c.resource, "https://api.example");
  // The same invariant the default case pins, and the case where it can
  // actually break: the resource is what the token request names and therefore
  // what lands in `aud`, so an audience list still derived from the ISSUER
  // would reject every access token the override just configured. The plugin
  // does not prefix-match (dist/introspect-njKASm3q.mjs:519 builds `aud` from
  // the identifiers verbatim), so "close enough" is not a thing here.
  assertEquals(c.audiences.includes(c.resource), true);
  assertEquals(c.audiences.includes(c.issuer), false);
});

Deno.test("trex: the requested scope asks for offline_access", () => {
  // The plugin gates refresh-token issuance on the scope having been granted
  // (trex's own provider issued one unconditionally). Without it the portal's
  // silent renewal has nothing to renew with.
  const c = resolveIdpConfig(
    { D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://d2e.example:41100" },
    "/trex",
  );
  assertEquals(c.scope, "openid profile email offline_access");
  assertEquals(
    resolveIdpConfig({
      D2E_IDP: "trex",
      TREX_OIDC_ISSUER: "https://d2e.example:41100",
      D2E_IDP_SCOPE: "openid",
    }, "/trex").scope,
    "openid",
  );
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
  assertEquals(c.tokenUrl, "https://d2e.example:41100/trex/oidc/oauth2/token");
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
  assertEquals(c.authorizePath, "trex/oidc/oauth2/authorize");
  assertEquals(c.endSessionPath, "trex/oidc/oauth2/end-session");
  // The gateway builds `${origin}/${authorizePath}`, which must land on the
  // endpoint the discovery document advertises.
  assertEquals(
    `https://d2e.example:41100/${c.authorizePath}`,
    `${c.issuer}/oauth2/authorize`,
  );
});

Deno.test("trex: browser paths follow a deployment mounted at the root", () => {
  const c = resolveIdpConfig(
    { D2E_IDP: "trex", TREX_OIDC_ISSUER: "https://d2e.example" },
    "",
  );
  assertEquals(c.authorizePath, "oidc/oauth2/authorize");
  assertEquals(`https://d2e.example/${c.authorizePath}`, `${c.issuer}/oauth2/authorize`);
});

Deno.test("trex: an internal base redirects server-side fetches but not `iss`", () => {
  // Local and CI stacks reach the gateway by container name, not by the public
  // FQDN -- which from inside resolves to this container. Without a separate
  // base the token proxy fetched https://localhost/trex/oidc/token and failed
  // with "error sending request". `iss` must NOT move: it is what every verifier
  // compares against, including WebAPI.
  const c = resolveIdpConfig({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://d2e.example:41100",
    TREX_OIDC_INTERNAL_BASE: "http://d2e-trex:33001",
  }, "/trex");
  assertEquals(c.issuer, "https://d2e.example:41100/trex/oidc");
  assertEquals(c.tokenUrl, "http://d2e-trex:33001/trex/oidc/oauth2/token");
  assertEquals(c.jwksUri, "http://d2e-trex:33001/trex/oidc/.well-known/jwks.json");
});

Deno.test("trex: without an internal base everything stays on the issuer", () => {
  const c = resolveIdpConfig({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://d2e.example:41100",
  }, "/trex");
  assertEquals(c.tokenUrl, `${c.issuer}/oauth2/token`);
  assertEquals(c.jwksUri, `${c.issuer}/.well-known/jwks.json`);
});

// ── The boot-time audit ─────────────────────────────────────────────────────
Deno.test("an audience list that cannot match an access token is warned about", () => {
  // D2E_IDP_AUDIENCES REPLACES the default pair, and the value that was right
  // before the provider moved -- the bare client id -- is now the one that
  // rejects every access token. Nothing else connects that setting to the 401.
  const logged: string[] = [];
  const warned = warnOnUnmatchableAudience({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://d2e.example:41100",
    TREX_OIDC_CLIENT_ID: "d2e-portal",
    D2E_IDP_AUDIENCES: "d2e-portal",
  }, (m) => logged.push(m));
  assertEquals(warned, true);
  assertEquals(logged.length, 1);
  // The symptom, named, so the operator can search for what they are seeing.
  assertEquals(logged[0].includes("401"), true);
  assertEquals(logged[0].includes("https://d2e.example:41100/trex/oidc"), true);
});

Deno.test("the default audience list is not warned about", () => {
  const logged: string[] = [];
  const warned = warnOnUnmatchableAudience({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://d2e.example:41100",
    TREX_OIDC_CLIENT_ID: "d2e-portal",
  }, (m) => logged.push(m));
  assertEquals(warned, false);
  assertEquals(logged, []);
});

Deno.test("a list matching an overridden resource is not warned about", () => {
  // The legitimate configuration in which the ISSUER is absent on purpose: a
  // deployment that registered a resource of its own. Checking the issuer
  // rather than the resource would cry wolf at exactly this deployment, and a
  // warning an operator learns to ignore is worse than none.
  const logged: string[] = [];
  const warned = warnOnUnmatchableAudience({
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://d2e.example:41100",
    TREX_OIDC_CLIENT_ID: "d2e-portal",
    D2E_IDP_RESOURCE: "https://api.example",
    D2E_IDP_AUDIENCES: "https://api.example,d2e-portal",
  }, (m) => logged.push(m));
  assertEquals(warned, false);
  assertEquals(logged, []);
});

Deno.test("an empty audience list is left alone, and logto is not audited", () => {
  // Empty is the documented "do not check the audience at all"; boot is not the
  // place to overrule it. Logto's `aud` is its own resource API and owes this
  // provider nothing.
  const logged: string[] = [];
  assertEquals(
    warnOnUnmatchableAudience({
      D2E_IDP: "trex",
      TREX_OIDC_ISSUER: "https://d2e.example:41100",
      D2E_IDP_AUDIENCES: "",
    }, (m) => logged.push(m)),
    false,
  );
  // Deliberately the shape that WOULD warn under trex: a resource the audience
  // list does not name. Logto's audiences and its resource API are unrelated
  // settings and a mismatch between them is not this provider's business, so
  // the IdP guard has to be what stops it -- not the incidental fact that most
  // Logto deployments leave LOGTO__RESOURCE_API unset.
  assertEquals(
    warnOnUnmatchableAudience({
      LOGTO__ISSUER: "https://logto.example/oidc",
      LOGTO__AUDIENCES: "https://portal.example",
      LOGTO__RESOURCE_API: "https://api.example",
    }, (m) => logged.push(m)),
    false,
  );
  assertEquals(logged, []);
});
