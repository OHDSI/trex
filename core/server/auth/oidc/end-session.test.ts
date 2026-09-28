// Where RP-initiated logout may send the browser afterwards.
//
// The deleted router.ts matched `post_logout_redirect_uri` against the client's
// own post-logout list, and oidc.test.ts asserted it; the cutover took the test
// with the module. The rule still holds under the plugin, and it is the second
// open-redirect surface the provider has — an unregistered URI here is worth
// exactly what an unregistered redirect_uri is worth at /authorize.
//
// What is NOT retested here is the cookie clearing: grants.test.ts already pins
// that sb-access-token is cleared on this path, and duplicating it would mean
// two tests failing for one cause.
//
// Gated on DATABASE_URL like the other auth suites, and skipping rather than
// inventing one.
import { assertEquals, assertNotEquals, assertStringIncludes } from "jsr:@std/assert";
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
    };
  } finally {
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    const { _resetRootKeyCache } = await import("../keys.ts");
    _resetRootKeyCache();
  }
}

const mod = DATABASE_URL ? await load() : null;

const REDIRECT_URI = "https://rp.test/end-session/cb";
const POST_LOGOUT_URI = "https://rp.test/end-session/after-logout";
const CLIENT_SECRET = "end-session-suite-secret";
const PASSWORD = "correct horse battery staple";

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

const cookieHeader = (setCookies: string[]) => setCookies.map((c) => c.split(";")[0]).join("; ");

interface Fixture {
  /** The listener's own base URL; the issuer's origin resolves here too. */
  url: string;
  issuer: string;
  close(): Promise<void>;
  clientId: string;
  email: string;
  userId: string;
}

/**
 * Points the issuer's origin at the listener for the duration.
 *
 * `id_token_hint` verification does not read the key it signed the token with
 * minutes earlier: it fetches the provider's JWKS over HTTP from
 * `${baseURL}${jwksPath}` (verifyLogoutHint -> getJwks,
 * dist/authorize-riRRCSbC.mjs:547 -> @better-auth/core verify.mjs:99), and
 * `baseURL` is the configured issuer. On an ephemeral port that fetch reaches
 * nothing, every hint verifies as invalid, and /oauth2/end-session answers 401
 * — indistinguishable from a genuine refusal, so a suite that did not deal with
 * this would assert the failure path throughout.
 *
 * The issuer itself cannot move: `auth` reads it once at module construction
 * and is a singleton shared with every other suite in the process. Binding the
 * issuer's own port instead was the first fix and was worse — 33001 is trex's
 * own trexas port, so the suite could not run beside a live trex and failed
 * with EADDRINUSE, which reads as a broken test; and a non-loopback
 * TREX_OIDC_ISSUER would have had it try to bind 443 on a public interface.
 *
 * So the origin is resolved rather than bound: `fetch` is resolved from
 * `globalThis` at call time by @better-fetch (dist/index.js:236), which is what
 * makes this possible at all. Only requests to the issuer's exact origin are
 * rewritten, and only while the fixture is up.
 */
function pointIssuerAtListener(issuer: string, listener: string): () => void {
  const real = globalThis.fetch;
  const from = new URL(issuer).origin;
  const to = new URL(listener).origin;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith(`${from}/`)) return real(input, init);
    const rewritten = to + url.slice(from.length);
    return real(input instanceof Request ? new Request(rewritten, input) : rewritten, init);
  };
  return () => {
    globalThis.fetch = real;
  };
}

async function startFixture(m: NonNullable<typeof mod>): Promise<Fixture> {
  const listener = await m.mount.startOidcServer();
  const issuer = listener.issuer;
  const restoreFetch = pointIssuerAtListener(issuer, listener.url);

  const run = crypto.randomUUID().slice(0, 8);
  const clientId = `end-session-${run}`;
  await m.seed.upsertOAuthClient({
    clientId,
    clientSecret: CLIENT_SECRET,
    name: "end-session suite",
    redirectUris: [REDIRECT_URI],
    // The whole point of the suite: this list, and not the redirect list, is
    // what a post-logout redirect is matched against.
    postLogoutRedirectUris: [POST_LOGOUT_URI],
    clientRoles: [],
    allowedScopes: ["openid", "profile", "email"],
    resourceIdentifier: issuer,
  });
  const email = `end-session-${run}@example.test`;
  const signedUp = await m.auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "End Session Suite" },
    returnHeaders: true,
  });
  return {
    url: listener.url,
    issuer,
    close: async () => {
      restoreFetch();
      await listener.close();
    },
    clientId,
    email,
    userId: signedUp.response.user.id,
  };
}

async function endFixture(m: NonNullable<typeof mod>, f: Fixture) {
  await m.db.pool.query(`DELETE FROM trexdb."oauthClient" WHERE "clientId" = $1`, [f.clientId]);
  await m.db.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [f.userId]);
  await f.close();
}

/**
 * A fresh session and the id_token minted on it.
 *
 * One per assertion, because a successful logout deletes the session and the
 * `sid` in an id_token is what ties the hint to the browser: reusing one would
 * make the second assertion pass or fail on the first's side effect rather than
 * on its own subject.
 */
async function signedInWithIdToken(
  m: NonNullable<typeof mod>,
  f: Fixture,
): Promise<{ cookie: string; idToken: string; sessionId: string }> {
  const signedIn = await m.auth.api.signInEmail({
    body: { email: f.email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = cookieHeader(signedIn.headers.getSetCookie());

  const { verifier, challenge } = await pkce();
  const authorized = await fetch(
    `${f.url}/oauth2/authorize?${
      new URLSearchParams({
        response_type: "code",
        client_id: f.clientId,
        redirect_uri: REDIRECT_URI,
        scope: "openid",
        state: "state-value",
        code_challenge: challenge,
        code_challenge_method: "S256",
        resource: f.issuer,
      })
    }`,
    { headers: { cookie }, redirect: "manual" },
  );
  await authorized.body?.cancel();
  const code = new URL(authorized.headers.get("location")!).searchParams.get("code");
  assertNotEquals(code, null, `no code: ${authorized.headers.get("location")}`);

  const token = await fetch(`${f.url}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      // Basic, not a body secret: upsertOAuthClient registers every
      // confidential client `client_secret_basic` (seed-client.ts), and the
      // provider refuses any other method outright. Encoded with the package's
      // own encoder — the inverse of the decoder the provider runs — so the two
      // cannot disagree about RFC 6749 §2.3.1.
      authorization: encodeBasicCredentials(f.clientId, CLIENT_SECRET),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: f.clientId,
      code: code!,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource: f.issuer,
    }),
  });
  const body = await token.json() as Record<string, string>;
  assertEquals(token.status, 200, JSON.stringify(body));
  // `sid` is what ties the hint to one session; it is also what the assertions
  // below check has been deleted, since the user holds more than one.
  const claims = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(
      atob(body.id_token.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    ),
  )) as { sid: string };
  return { cookie, idToken: body.id_token, sessionId: claims.sid };
}

async function endSession(
  f: Fixture,
  session: { cookie: string; idToken: string },
  params: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  const query = new URLSearchParams({
    id_token_hint: session.idToken,
    client_id: f.clientId,
    ...params,
  });
  const res = await fetch(`${f.url}/oauth2/end-session?${query}`, {
    headers: { cookie: session.cookie, ...headers },
    redirect: "manual",
  });
  const body = await res.text();
  return { status: res.status, location: res.headers.get("location"), body };
}

function test(name: string, fn: (m: NonNullable<typeof mod>, f: Fixture) => Promise<void>) {
  Deno.test({
    name,
    ignore: !mod,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      const f = await startFixture(mod!);
      try {
        await fn(mod!, f);
      } finally {
        await endFixture(mod!, f);
      }
    },
  });
}

test("post-logout redirects are matched against their own list", async (m, f) => {
  // A registered entry is honoured, and `state` rides back on it so the
  // relying party can correlate the logout it started
  // (getRegisteredLogoutRedirect, dist/authorize-riRRCSbC.mjs:558-573).
  const ok = await endSession(f, await signedInWithIdToken(m, f), {
    post_logout_redirect_uri: POST_LOGOUT_URI,
    state: "logout-state",
  });
  assertEquals(ok.status, 302);
  const back = new URL(ok.location!);
  assertEquals(back.origin + back.pathname, POST_LOGOUT_URI);
  assertEquals(back.searchParams.get("state"), "logout-state");

  // Its own list, which is the sharp end: the client's registered
  // redirect_uri is not a post-logout destination, and neither is a sibling
  // path under a registered one. The match is `postLogoutRedirectUris.includes`
  // — plain string equality, with none of the loopback licence /authorize
  // grants (:560).
  for (
    const post_logout_redirect_uri of [
      REDIRECT_URI,
      `${POST_LOGOUT_URI}/deeper`,
      `${POST_LOGOUT_URI}?next=https://evil.test`,
      "https://evil.test/after-logout",
    ]
  ) {
    const refused = await endSession(f, await signedInWithIdToken(m, f), {
      post_logout_redirect_uri,
    });
    // No Location at all rather than an error redirect: the plugin declines to
    // navigate anywhere it was not told to. 200, because the logout itself
    // succeeded — only the destination was refused.
    assertEquals(refused.location, null, post_logout_redirect_uri);
    assertEquals(refused.status, 200, post_logout_redirect_uri);
    assertEquals(refused.body.includes("evil.test"), false, post_logout_redirect_uri);
  }
});

test("a browser is told the destination was refused, rather than sent to it", async (m, f) => {
  // The same refusal as above through a navigation rather than a fetch, which
  // is how a real relying party's logout link arrives. isBrowserNavigation
  // keys off Accept/sec-fetch-mode (:373-378), and on that path the plugin
  // answers an HTML page instead of an empty 200.
  //
  // Recorded here because it is the shape WebAPI's SECURITY_AUTH_OIDC_LOGOUTURL
  // would land on if its post-logout URI were ever unregistered: a page saying
  // the user is logged out, not a redirect back to Atlas.
  const refused = await endSession(
    f,
    await signedInWithIdToken(m, f),
    { post_logout_redirect_uri: "https://evil.test/after-logout" },
    { accept: "text/html" },
  );
  assertEquals(refused.location, null);
  assertEquals(refused.status, 200);
  assertStringIncludes(refused.body, "not registered");
  assertEquals(refused.body.includes("evil.test"), false);
});

test("the session is gone whether or not the destination was registered", async (m, f) => {
  // Without this the test above would pass against a provider that refuses the
  // redirect by refusing the whole request — which would leave the user signed
  // in, and is the failure mode a relying party would never see.
  for (const post_logout_redirect_uri of [POST_LOGOUT_URI, "https://evil.test/after-logout"]) {
    const session = await signedInWithIdToken(m, f);
    await endSession(f, session, { post_logout_redirect_uri });
    // Keyed on the hinted session rather than on the user: the user holds
    // others, and logout ends the one the hint names — the same scoping
    // revocation.test.ts pins for POST /logout.
    const alive = await m.db.pool.query(
      `SELECT 1 FROM trexdb.session WHERE id = $1`,
      [session.sessionId],
    );
    assertEquals(alive.rows.length, 0, post_logout_redirect_uri);
  }
});
