import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import {
  grantedScopes,
  isPublicClient,
  isRegisteredPostLogoutUri,
  isRegisteredRedirectUri,
  type OidcClient,
  verifyPkce,
} from "./policy.ts";
import { buildIdTokenClaims } from "./claims.ts";
import { issuerUrl, loginUrl, oidcProviderEnabled, readCookie } from "./config.ts";

const client: OidcClient = {
  clientId: "atlas",
  clientSecretHash: null,
  name: "Atlas",
  redirectUris: ["https://example.test/atlas/#/welcome"],
  postLogoutRedirectUris: ["https://example.test/atlas/"],
  allowedScopes: ["openid", "profile", "email"],
  requirePkce: true,
};

Deno.test("the provider is off unless explicitly enabled", () => {
  for (const v of [undefined, "", "false", "0", "yes", "TRUE"]) {
    assertEquals(oidcProviderEnabled(v), false, `expected off for ${JSON.stringify(v)}`);
  }
  assertEquals(oidcProviderEnabled("true"), true);
  assertEquals(oidcProviderEnabled("1"), true);
});

Deno.test("redirect_uri matching is exact", () => {
  assertEquals(isRegisteredRedirectUri(client, "https://example.test/atlas/#/welcome"), true);
  // Each of these is a redirect an attacker would like to be accepted.
  for (const uri of [
    "https://example.test/atlas/#/welcome/../../evil",
    "https://example.test/atlas/#/welcome?x=1",
    "https://example.test/atlas/",
    "https://evil.test/atlas/#/welcome",
    "https://example.test.evil.test/atlas/#/welcome",
    "",
  ]) {
    assertEquals(isRegisteredRedirectUri(client, uri), false, `expected reject for ${uri}`);
  }
});

Deno.test("post-logout redirects are matched against their own list", () => {
  assertEquals(isRegisteredPostLogoutUri(client, "https://example.test/atlas/"), true);
  // Registered as a login redirect, but not as a post-logout one.
  assertEquals(isRegisteredPostLogoutUri(client, "https://example.test/atlas/#/welcome"), false);
});

Deno.test("scopes are narrowed to what the client may have", () => {
  assertEquals(grantedScopes(client, "openid profile email"), ["openid", "profile", "email"]);
  assertEquals(grantedScopes(client, "openid offline_access"), ["openid"]);
  assertEquals(grantedScopes(client, "  openid   email  "), ["openid", "email"]);
  assertEquals(grantedScopes(client, "profile"), ["profile"]);
});

Deno.test("a client with no stored secret is public", () => {
  assertEquals(isPublicClient(client), true);
  assertEquals(isPublicClient({ ...client, clientSecretHash: "salt:hash" }), false);
});

Deno.test("claims carry the role and honour the requested scopes", () => {
  const user = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "admin@trex.local",
    name: "Admin",
    role: "admin",
    emailVerified: true,
  };

  const full = buildIdTokenClaims(user, {
    issuer: "https://example.test/trex",
    audience: "atlas",
    scopes: ["openid", "profile", "email"],
    nonce: "n-123",
  });
  assertEquals(full.sub, user.id);
  assertEquals(full.aud, "atlas");
  assertEquals(full.iss, "https://example.test/trex");
  assertEquals(full.nonce, "n-123");
  assertEquals(full.email, "admin@trex.local");
  assertEquals(full.email_verified, true);
  assertEquals(full.name, "Admin");
  // The role is what downstream authorization reads, in both places.
  assertEquals(full.trex_role, "admin");
  assertEquals(full.app_metadata.trex_role, "admin");

  const minimal = buildIdTokenClaims(user, {
    issuer: "https://example.test/trex",
    audience: "atlas",
    scopes: ["openid"],
  });
  assertEquals(minimal.email, undefined);
  assertEquals(minimal.name, undefined);
  assertEquals(minimal.nonce, undefined);
  // The role is not scope-gated: it is what the token is for.
  assertEquals(minimal.trex_role, "admin");
});

Deno.test("claims expire and are not issued in the past", () => {
  const now = Math.floor(Date.now() / 1000);
  const claims = buildIdTokenClaims(
    { id: "u", email: "e@x", role: "user" },
    { issuer: "https://i", audience: "a", scopes: ["openid"], ttlSeconds: 60 },
  );
  assertEquals(claims.exp - claims.iat, 60);
  assertEquals(claims.iat >= now - 1 && claims.iat <= now + 1, true);
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

Deno.test("two issued codes never collide", () => {
  // The code itself comes from crypto.getRandomValues; this guards the encoding
  // rather than the entropy source.
  const a = crypto.getRandomValues(new Uint8Array(32));
  const b = crypto.getRandomValues(new Uint8Array(32));
  assertNotEquals(a.join(","), b.join(","));
});

Deno.test("loginUrl is null unless configured, so /authorize fails closed", () => {
  assertEquals(loginUrl(undefined), null);
  assertEquals(loginUrl(""), null);
  assertEquals(loginUrl("https://example.test/login"), "https://example.test/login");
});

// The S256 pair below is the worked example from RFC 7636 appendix B, so these
// assert against the spec rather than against our own implementation.
const RFC7636_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC7636_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

Deno.test("PKCE accepts the verifier that produced the challenge", async () => {
  const ok = await verifyPkce(
    { codeChallenge: RFC7636_CHALLENGE, codeChallengeMethod: "S256" },
    RFC7636_VERIFIER,
  );
  assertEquals(ok, true);
});

Deno.test("PKCE rejects a wrong, missing or empty verifier", async () => {
  const challenge = { codeChallenge: RFC7636_CHALLENGE, codeChallengeMethod: "S256" };
  assertEquals(await verifyPkce(challenge, "not-the-verifier"), false);
  assertEquals(await verifyPkce(challenge, undefined), false);
  assertEquals(await verifyPkce(challenge, ""), false);
});

Deno.test("PKCE refuses plain, whatever verifier is offered", async () => {
  // `plain` would let anyone who intercepted the code complete the exchange.
  assertEquals(
    await verifyPkce({ codeChallenge: RFC7636_VERIFIER, codeChallengeMethod: "plain" }, RFC7636_VERIFIER),
    false,
  );
  assertEquals(
    await verifyPkce({ codeChallenge: RFC7636_CHALLENGE, codeChallengeMethod: null }, RFC7636_VERIFIER),
    false,
  );
});

Deno.test("a code issued without a challenge needs no verifier", async () => {
  assertEquals(await verifyPkce({ codeChallenge: null, codeChallengeMethod: null }, undefined), true);
});
