// Tests for functions/auth/jwt.ts — expectations mirror
// test/spec/Feature/Auth/AuthSpec.hs where messages are asserted.
import { assert, assertEquals } from "std/assert/mod.ts";
import { SignJWT } from "jose";
import { authenticate, decodeBase64Secret, extractBearerAuth, parseSecret, walkJSPath } from "../functions/auth/jwt.ts";
import { type AppConfig, parseRoleClaimKey, readEnvConfig } from "../functions/config.ts";
import { PgrstError } from "../functions/errors.ts";

// Same secret as the PostgREST spec suite.
const SECRET = "reallyreallyreallyreallyverysafe";
const SECRET_BYTES = new TextEncoder().encode(SECRET);

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...readEnvConfig({}), dbAnonRole: "postgrest_test_anonymous", jwtSecret: SECRET, ...overrides };
}

function sign(claims: Record<string, unknown>, opts: { exp?: number; nbf?: number; iat?: number; aud?: string | string[] } = {}): Promise<string> {
  let jwt = new SignJWT({ ...claims, ...(opts.aud !== undefined ? { aud: opts.aud } : {}) }).setProtectedHeader({ alg: "HS256" });
  if (opts.exp !== undefined) jwt = jwt.setExpirationTime(opts.exp);
  if (opts.nbf !== undefined) jwt = jwt.setNotBefore(opts.nbf);
  if (opts.iat !== undefined) jwt = jwt.setIssuedAt(opts.iat);
  return jwt.sign(SECRET_BYTES);
}

async function expectPgrst(p: Promise<unknown>, status: number, code: string, message?: string): Promise<PgrstError> {
  try {
    await p;
  } catch (err) {
    assert(err instanceof PgrstError, `expected PgrstError, got ${err}`);
    assertEquals(err.status, status);
    assertEquals(err.body.code, code);
    if (message !== undefined) assertEquals(err.body.message, message);
    return err;
  }
  throw new Error("expected rejection");
}

const nowSecs = () => Math.floor(Date.now() / 1000);

Deno.test("HS256 happy path resolves role and keeps claims", async () => {
  const token = await sign({ role: "webuser", id: "jdoe" });
  const result = await authenticate(`Bearer ${token}`, config());
  assertEquals(result.role, "webuser");
  assertEquals(result.authed, true);
  assertEquals(result.claims.role, "webuser");
  assertEquals(result.claims.id, "jdoe");
});

Deno.test("bearer scheme is case-insensitive; other schemes fall to anon", async () => {
  const token = await sign({ role: "webuser" });
  assertEquals((await authenticate(`bearer ${token}`, config())).role, "webuser");
  assertEquals((await authenticate(`BEARER ${token}`, config())).role, "webuser");
  // Basic credentials are not a bearer token → anonymous
  assertEquals((await authenticate("Basic dXNlcjpwYXNz", config())).role, "postgrest_test_anonymous");
  assertEquals(extractBearerAuth("Bearer"), "");
  assertEquals(extractBearerAuth(null), "");
});

Deno.test("no token falls back to the anon role with role-only claims", async () => {
  const result = await authenticate(null, config());
  assertEquals(result.role, "postgrest_test_anonymous");
  assertEquals(result.authed, false);
  // Auth.hs parseClaims inserts the role into the claims
  assertEquals(result.claims, { role: "postgrest_test_anonymous" });
});

Deno.test("token without a role claim falls back to the anon role", async () => {
  const token = await sign({ id: "jdoe" });
  const result = await authenticate(`Bearer ${token}`, config());
  assertEquals(result.role, "postgrest_test_anonymous");
  assertEquals(result.authed, false);
});

Deno.test("PGRST302 when no anon role and no role claim", async () => {
  await expectPgrst(authenticate(null, config({ dbAnonRole: null })), 401, "PGRST302", "Anonymous access is disabled");
  const token = await sign({ id: "jdoe" });
  await expectPgrst(authenticate(`Bearer ${token}`, config({ dbAnonRole: null })), 401, "PGRST302");
});

Deno.test("PGRST300 when a token arrives but no secret is configured", async () => {
  const token = await sign({ role: "webuser" });
  await expectPgrst(authenticate(`Bearer ${token}`, config({ jwtSecret: null })), 500, "PGRST300", "Server lacks JWT secret");
});

Deno.test("PGRST301 'JWT expired' for expired tokens (past the 30s skew)", async () => {
  const token = await sign({ role: "webuser" }, { exp: nowSecs() - 120 });
  const err = await expectPgrst(authenticate(`Bearer ${token}`, config()), 401, "PGRST301", "JWT expired");
  assertEquals(err.headers["WWW-Authenticate"], 'Bearer error="invalid_token", error_description="JWT expired"');
});

Deno.test("expired within the 30s allowed skew still verifies", async () => {
  const token = await sign({ role: "webuser" }, { exp: nowSecs() - 10 });
  assertEquals((await authenticate(`Bearer ${token}`, config())).role, "webuser");
});

Deno.test("PGRST301 for nbf/iat in the future", async () => {
  const nbfToken = await sign({ role: "webuser" }, { nbf: nowSecs() + 120 });
  await expectPgrst(authenticate(`Bearer ${nbfToken}`, config()), 401, "PGRST301", "JWTNotYetValid");
  const iatToken = await sign({ role: "webuser" }, { iat: nowSecs() + 120 });
  await expectPgrst(authenticate(`Bearer ${iatToken}`, config()), 401, "PGRST301", "JWTIssuedAtFuture");
});

Deno.test("PGRST301 with AuthSpec message for malformed compact JWS", async () => {
  await expectPgrst(
    authenticate("Bearer ey9zdGdyZXN0X3Rlc3RfYXV0aG9yIiwiaWQiOiJqZG9lIn0.y4vZuu1dDdwAl0", config()),
    401,
    "PGRST301",
    "JWSError (CompactDecodeError Invalid number of parts: Expected 3 parts; got 2)",
  );
});

Deno.test("PGRST301 for a bad signature", async () => {
  const token = await new SignJWT({ role: "webuser" })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode("wrongwrongwrongwrongwrongwrong!!"));
  await expectPgrst(authenticate(`Bearer ${token}`, config()), 401, "PGRST301", "JWSError JWSInvalidSignature");
});

Deno.test("aud is only validated when jwt-aud is configured", async () => {
  const cfg = config({ jwtAud: "everyone" });
  const good = await sign({ role: "webuser" }, { aud: "everyone" });
  assertEquals((await authenticate(`Bearer ${good}`, cfg)).role, "webuser");
  // string-or-array membership
  const arr = await sign({ role: "webuser" }, { aud: ["nobody", "everyone"] });
  assertEquals((await authenticate(`Bearer ${arr}`, cfg)).role, "webuser");
  const bad = await sign({ role: "webuser" }, { aud: "somebody-else" });
  await expectPgrst(authenticate(`Bearer ${bad}`, cfg), 401, "PGRST301", "JWTNotInAudience");
  // no jwt-aud configured → token aud ignored (Auth.hs: const True)
  assertEquals((await authenticate(`Bearer ${bad}`, config())).role, "webuser");
});

Deno.test("custom jwt-role-claim-key JSPath", async () => {
  const cfg = config({ jwtRoleClaimKey: parseRoleClaimKey(".a.b[1].role") });
  const token = await sign({ a: { b: [{ role: "nope" }, { role: "admin" }] } });
  assertEquals((await authenticate(`Bearer ${token}`, cfg)).role, "admin");
  // missing path → anon
  const other = await sign({ a: { b: [] } });
  assertEquals((await authenticate(`Bearer ${other}`, cfg)).role, "postgrest_test_anonymous");
});

Deno.test("non-string role claims are JSON-encoded (Auth.hs unquoted)", async () => {
  const token = await sign({ role: 123 });
  assertEquals((await authenticate(`Bearer ${token}`, config())).role, "123");
});

Deno.test("base64 secret mode (standard and URL-safe alphabets)", async () => {
  const b64 = btoa(SECRET);
  const cfg = config({ jwtSecret: b64, jwtSecretIsBase64: true });
  const token = await sign({ role: "webuser" });
  assertEquals((await authenticate(`Bearer ${token}`, cfg)).role, "webuser");
  // Config.hs decodeSecret replaces the URL-safe chars before decoding
  const urlSafe = b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ".");
  const cfg2 = config({ jwtSecret: urlSafe, jwtSecretIsBase64: true });
  assertEquals((await authenticate(`Bearer ${token}`, cfg2)).role, "webuser");
  assertEquals(decodeBase64Secret(b64), SECRET_BYTES);
});

Deno.test("JWK and JWKS secrets verify HS256 tokens", async () => {
  const k = btoa(SECRET).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  const jwk = JSON.stringify({ kty: "oct", k });
  const token = await sign({ role: "webuser" });
  assertEquals((await authenticate(`Bearer ${token}`, config({ jwtSecret: jwk }))).role, "webuser");
  assertEquals((parseSecret(config({ jwtSecret: jwk })) as { kind: string }).kind, "jwk");
  const jwks = JSON.stringify({ keys: [{ kty: "oct", k, alg: "HS256" }] });
  assertEquals((await authenticate(`Bearer ${token}`, config({ jwtSecret: jwks }))).role, "webuser");
  assertEquals((parseSecret(config({ jwtSecret: jwks })) as { kind: string }).kind, "jwks");
});

Deno.test("empty bearer token behaves like no token (Auth.hs parseToken \"\")", async () => {
  const result = await authenticate("Bearer ", config({ jwtSecret: null }));
  assertEquals(result.role, "postgrest_test_anonymous");
});

Deno.test("walkJSPath follows keys and indexes like Auth.hs", () => {
  const claims = { a: { b: [10, { c: "x" }] } };
  assertEquals(walkJSPath(claims, parseRoleClaimKey(".a.b[1].c")), "x");
  assertEquals(walkJSPath(claims, parseRoleClaimKey(".a.b[0]")), 10);
  assertEquals(walkJSPath(claims, parseRoleClaimKey(".missing")), undefined);
  assertEquals(walkJSPath(claims, parseRoleClaimKey(".a.b[9]")), undefined);
  // indexing a non-array / keying a non-object → Nothing
  assertEquals(walkJSPath(claims, parseRoleClaimKey(".a[0]")), undefined);
  assertEquals(walkJSPath(claims, parseRoleClaimKey(".a.b[0].c")), undefined);
});
