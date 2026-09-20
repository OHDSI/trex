// How long an issued token lives, read off the wire.
//
// The deleted claims.ts computed `exp` itself and oidc.test.ts asserted it
// ("claims expire and are not issued in the past"); the cutover moved the
// arithmetic into the plugin, and what survived of the assertion is
// better-auth.test.ts:124 — `provider.options.idTokenExpiresIn === 3600`.
// That pins the configuration, not the token: it would go on passing if the
// plugin stopped reading the option, changed its unit, or dated the claim from
// something other than issue time. Nothing else decodes an actually-issued
// token and looks at its lifetime, and a token that lives ten times too long is
// not visible at a sign-in — only hours later, to whoever still holds it.
//
// The claim SET is already pinned elsewhere (grants.test.ts and
// authorize.test.ts both decode real tokens), so this file asserts only the
// timing.
//
// Gated on DATABASE_URL like the other auth suites, and skipping rather than
// inventing one.
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { encodeBasicCredentials } from "better-auth/oauth2";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived subkey is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

async function load() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return {
      mount: await import("./mount.ts"),
      seed: await import("./seed-client.ts"),
      db: await import("../../db.ts"),
      auth: (await import("../better-auth.ts")).auth,
      provider: (await import("../better-auth.ts")).auth.options.plugins.find(
        (p: { id: string }) => p.id === "oauth-provider",
      ) as { options: { idTokenExpiresIn: number; accessTokenExpiresIn: number } },
    };
  } finally {
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    const { _resetRootKeyCache } = await import("../keys.ts");
    _resetRootKeyCache();
  }
}

const mod = DATABASE_URL ? await load() : null;

const REDIRECT_URI = "https://rp.test/token/cb";
const CLIENT_SECRET = "token-suite-secret";

/**
 * Spelled out rather than read off provider.ts, so that shortening the token's
 * life is a decision that has to be made here as well — a test that reads its
 * expectation from the code under test cannot notice the code changing. Both
 * are cross-checked against the configuration below, so this file also cannot
 * go on describing a provider that is no longer configured this way.
 *
 * 3600 is what the deleted claims.ts issued; the plugin's own defaults are
 * 36000 for the id_token and 3600 for the access token.
 */
const ID_TOKEN_TTL = 3600;
const ACCESS_TOKEN_TTL = 3600;

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

const cookieHeader = (setCookies: string[]) => setCookies.map((c) => c.split(";")[0]).join("; ");

/** Payload of a signed JWT, without verifying it. */
function jwtPayload(token: string): Record<string, number | string> {
  const parts = token.split(".");
  assertEquals(parts.length, 3, `not a JWT: ${token.slice(0, 24)}…`);
  return JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(parts[1].replaceAll("-", "+").replaceAll("_", "/")), (c) =>
      c.charCodeAt(0)),
  ));
}

interface Flow {
  server: Awaited<ReturnType<NonNullable<typeof mod>["mount"]["startOidcServer"]>>;
  clientId: string;
  userId: string;
  cookie: string;
}

async function startFlow(m: NonNullable<typeof mod>): Promise<Flow> {
  const server = await m.mount.startOidcServer();
  const suffix = crypto.randomUUID().slice(0, 8);
  const clientId = `token-${suffix}`;
  await m.seed.upsertOAuthClient({
    clientId,
    clientSecret: CLIENT_SECRET,
    name: "token suite",
    redirectUris: [REDIRECT_URI],
    postLogoutRedirectUris: [],
    clientRoles: [],
    allowedScopes: ["openid", "profile", "email", "offline_access"],
    resourceIdentifier: server.issuer,
  });
  const signedUp = await m.auth.api.signUpEmail({
    body: {
      email: `token-${suffix}@example.test`,
      password: "correct horse battery staple",
      name: "Token Suite",
    },
    returnHeaders: true,
  });
  return {
    server,
    clientId,
    userId: signedUp.response.user.id,
    cookie: cookieHeader(signedUp.headers.getSetCookie()),
  };
}

async function endFlow(m: NonNullable<typeof mod>, flow: Flow) {
  await m.db.pool.query(`DELETE FROM trexdb."oauthClient" WHERE "clientId" = $1`, [flow.clientId]);
  await m.db.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [flow.userId]);
  await flow.server.close();
}

/** A whole authorization_code exchange, with the wall clock either side of it. */
async function exchange(flow: Flow, scope = "openid profile email") {
  const { verifier, challenge } = await pkce();
  const authorized = await fetch(
    `${flow.server.url}/oauth2/authorize?${
      new URLSearchParams({
        response_type: "code",
        client_id: flow.clientId,
        redirect_uri: REDIRECT_URI,
        scope,
        state: "state-value",
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: flow.server.issuer,
      })
    }`,
    { headers: { cookie: flow.cookie }, redirect: "manual" },
  );
  await authorized.body?.cancel();
  const code = new URL(authorized.headers.get("location")!).searchParams.get("code");
  assertNotEquals(code, null, `no code: ${authorized.headers.get("location")}`);

  // Floored either side of the request, so the window the claim must fall in is
  // the request's own duration rather than a fixed tolerance.
  const before = Math.floor(Date.now() / 1000);
  const res = await fetch(`${flow.server.url}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      // Basic, not a body secret: upsertOAuthClient registers every
      // confidential client `client_secret_basic` (seed-client.ts), and the
      // provider refuses any other method outright. Encoded with the package's
      // own encoder — the inverse of the decoder the provider runs — so the two
      // cannot disagree about RFC 6749 §2.3.1.
      authorization: encodeBasicCredentials(flow.clientId, CLIENT_SECRET),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: flow.clientId,
      code: code!,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource: flow.server.issuer,
    }),
  });
  const body = await res.json() as Record<string, string | number>;
  const after = Math.floor(Date.now() / 1000);
  assertEquals(res.status, 200, JSON.stringify(body));
  return { body, before, after };
}

function test(name: string, fn: (m: NonNullable<typeof mod>, flow: Flow) => Promise<void>) {
  Deno.test({
    name,
    ignore: !mod,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const flow = await startFlow(mod!);
      try {
        await fn(mod!, flow);
      } finally {
        await endFlow(mod!, flow);
      }
    },
  });
}

test("claims expire and are not issued in the past", async (m, flow) => {
  const { body, before, after } = await exchange(flow);

  // The two halves together are what better-auth.test.ts:124 cannot assert on
  // its own: that the provider is configured this way, AND that the plugin
  // honours the configuration rather than falling back to its own default.
  assertEquals(m.provider.options.idTokenExpiresIn, ID_TOKEN_TTL);
  assertEquals(m.provider.options.accessTokenExpiresIn, ACCESS_TOKEN_TTL);

  for (
    const [name, token, ttl] of [
      ["id_token", body.id_token as string, ID_TOKEN_TTL],
      // A JWT only because the exchange named a resource; without one the
      // access token is opaque and there is nothing here to decode
      // (see PHASE2-SPIKE-FINDINGS.md, the grant cutover).
      ["access_token", body.access_token as string, ACCESS_TOKEN_TTL],
    ] as const
  ) {
    const claims = jwtPayload(token);
    const iat = claims.iat as number;
    const exp = claims.exp as number;
    assertEquals(typeof iat, "number", name);
    assertEquals(typeof exp, "number", name);

    // The lifetime itself: exp is iat plus the configured ttl, exactly.
    assertEquals(exp - iat, ttl, `${name} lifetime`);

    // "Not issued in the past", which is the half that a stale or reused iat
    // would break: the claim is dated inside the request that produced it, so
    // it can be neither backdated (which would shorten the token's usable life
    // without saying so) nor postdated (which relying parties reject outright).
    assertEquals(iat >= before, true, `${name} iat ${iat} predates the request (${before})`);
    assertEquals(iat <= after, true, `${name} iat ${iat} is after the request (${after})`);
    // And it is still valid when it arrives, which is the whole point.
    assertEquals(exp > after, true, `${name} expired on issue`);
  }

  // The same number the relying party is told in the response body, in seconds
  // and not in milliseconds: d2e's portal schedules its silent renewal off this
  // value, so a unit change here is a session that renews 1000× too late.
  assertEquals(body.expires_in, ACCESS_TOKEN_TTL);
});

test("a refreshed token is dated from the refresh, not from the first issue", async (_m, flow) => {
  // The plugin recomputes exp as iat + ttl on every rotation rather than
  // carrying an absolute deadline (PHASE2-SPIKE-FINDINGS.md, fix round 1), so
  // the renewed token must be dated from the renewal. Without this the test
  // above would pass against a provider that re-issued the original claims
  // verbatim, and a refresh would hand back a token already half spent.
  const first = await exchange(flow, "openid profile email offline_access");
  const firstIat = jwtPayload(first.body.access_token as string).iat as number;

  const before = Math.floor(Date.now() / 1000);
  const res = await fetch(`${flow.server.url}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      // Basic, not a body secret: upsertOAuthClient registers every
      // confidential client `client_secret_basic` (seed-client.ts), and the
      // provider refuses any other method outright. Encoded with the package's
      // own encoder — the inverse of the decoder the provider runs — so the two
      // cannot disagree about RFC 6749 §2.3.1.
      authorization: encodeBasicCredentials(flow.clientId, CLIENT_SECRET),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: flow.clientId,
      refresh_token: first.body.refresh_token as string,
      resource: flow.server.issuer,
    }),
  });
  const body = await res.json() as Record<string, string | number>;
  assertEquals(res.status, 200, JSON.stringify(body));

  const claims = jwtPayload(body.access_token as string);
  assertEquals(claims.iat as number >= before, true, "the renewed token carries the original iat");
  assertEquals((claims.exp as number) - (claims.iat as number), ACCESS_TOKEN_TTL);
  // The rolling window this produces: the renewed token outlives the first.
  assertEquals((claims.iat as number) >= firstIat, true);
});
