// The two routes the d2e sign-in page links to, driven over HTTP.
//
// Their paths, their methods and their refusal shape are what that page and its
// `?error=` handling are written against, so every case below asserts the wire
// — status, Location, Set-Cookie — and, where a wire response could be produced
// by a flow that wrote the wrong thing, the ROW as well. A callback that
// redirected correctly and minted no session, or that left the state
// redeemable, would pass on the wire alone.
//
// Nothing here substitutes an engine. router.ts imports `auth` from
// better-auth.ts at module scope, so the engine under test is the process's own
// and the only lever a test has over it is the environment it is built from —
// which is the point: BETTER_AUTH_TRUSTED_ORIGINS is now load-bearing for
// federation, and a suite that could paper over it would not notice.
//
// Every server binds 127.0.0.1 explicitly. A wildcard bind can take the
// Postgres port and answer the test's own fetch, which was a ~2% random failure
// in Phase 1, misdiagnosed twice.
import { assertEquals, assertNotEquals, assertStringIncludes } from "jsr:@std/assert";
import { exportJWK, generateKeyPair, SignJWT } from "npm:jose";
import { _setDekForTests } from "../dek.ts";
import { _resetRootKeyCache } from "../keys.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

// ── The stub upstream ───────────────────────────────────────────────────────

interface Upstream {
  origin: string;
  close: () => Promise<void>;
}

/** The four endpoints a provider row needs, and nothing more. */
async function startUpstream(claimsFor: () => Record<string, unknown>): Promise<Upstream> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "stub-1";
  jwk.alg = "RS256";
  jwk.use = "sig";

  let origin = "";
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1", onListen: () => {} },
    async (req) => {
      const path = new URL(req.url).pathname;
      if (path === "/.well-known/openid-configuration") {
        return Response.json({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          jwks_uri: `${origin}/jwks`,
        });
      }
      if (path === "/jwks") return Response.json({ keys: [jwk] });
      if (path === "/token") {
        const idToken = await new SignJWT(claimsFor())
          .setProtectedHeader({ alg: "RS256", kid: "stub-1" })
          .setIssuer(origin)
          .setAudience("stub-client")
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(privateKey);
        return Response.json({
          access_token: "stub-access-token",
          token_type: "Bearer",
          expires_in: 300,
          id_token: idToken,
        });
      }
      return new Response("not found", { status: 404 });
    },
  );
  origin = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  return { origin, close: () => server.shutdown() };
}

// ── Boot, in the one order the engine permits ───────────────────────────────
//
// better-auth.ts reads TREX_ROOT_KEY, BETTER_AUTH_TRUSTED_ORIGINS and
// TREX_FEDERATION_REDIRECT_URI while it evaluates, and it evaluates on first
// import. Two of those three name a port nothing has chosen yet, so both
// servers are bound first and only then is the module graph pulled in. This is
// not test scaffolding working around the design — it IS the deployment
// requirement this task introduces, expressed as the only order that works.

interface Loaded {
  // deno-lint-ignore no-explicit-any
  pool: any;
  // deno-lint-ignore no-explicit-any
  auth: any;
  // deno-lint-ignore no-explicit-any
  refreshProviderOidcConfig: any;
  // deno-lint-ignore no-explicit-any
  untrustedIssuerOrigins: any;
  // deno-lint-ignore no-explicit-any
  auditTrustedIssuerOrigins: any;
  base: string;
  trusted: Upstream;
  /** Real, reachable, and deliberately absent from the trusted-origin list. */
  untrusted: Upstream;
  claims: { value: Record<string, unknown> };
  // deno-lint-ignore no-explicit-any
  server: any;
  /** What the environment held before boot(), so the process can be handed back. */
  priorEnv: Record<string, string | undefined>;
}

async function boot(): Promise<Loaded> {
  const claims = { value: {} as Record<string, unknown> };
  const trusted = await startUpstream(() => claims.value);
  const untrusted = await startUpstream(() => claims.value);

  const express = (await import("express")).default;
  const app = express();
  // index.ts:72's default, so req.ip is resolved the way a deployment resolves
  // it: one trusted hop, i.e. the last entry of X-Forwarded-For. Without this
  // every request in the file is 127.0.0.1 and the flood case below could not
  // tell an attacker's address from a victim's.
  app.set("trust proxy", 1);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;

  // Deno loads every file of a directory run into ONE process, and these four
  // have to stay set for as long as this file's tests run: router.ts reads
  // TREX_FEDERATION_REDIRECT_URI per request, not at import. So they are saved
  // here and put back by the teardown at the bottom of the file, before any
  // later file's tests start. Leaving them set is how this suite made
  // sso-config.test.ts's redirect-URI test pass file-by-file and fail on a
  // directory run.
  const priorEnv: Record<string, string | undefined> = {};
  const setEnv = (name: string, value: string) => {
    priorEnv[name] = Deno.env.get(name);
    Deno.env.set(name, value);
  };
  setEnv("TREX_ROOT_KEY", VALID_ROOT);
  setEnv("TREX_FEDERATION_ENABLED", "true");
  setEnv("TREX_FEDERATION_REDIRECT_URI", `${base}/trex/auth/v1/callback`);
  // The requirement, stated. `trusted.origin` is here and `untrusted.origin`
  // is not, and that single difference is what the discovery cases below turn
  // on.
  setEnv("BETTER_AUTH_TRUSTED_ORIGINS", trusted.origin);

  const { pool } = await import("../../db.ts");
  const { auth } = await import("../better-auth.ts");
  const { refreshProviderOidcConfig } = await import("./admin-store.ts");
  const router = await import("./router.ts");
  _resetRootKeyCache();
  // The callback seals the upstream tokens under the DEK, which initDek() fills
  // at boot from trexdb.kek_wrapped_dek; this suite boots no server.
  _setDekForTests(new Uint8Array(32));

  router.registerFederationRoutes(app, "/trex", pool);

  return {
    pool,
    auth,
    refreshProviderOidcConfig,
    untrustedIssuerOrigins: router.untrustedIssuerOrigins,
    auditTrustedIssuerOrigins: router.auditTrustedIssuerOrigins,
    base,
    trusted,
    untrusted,
    claims,
    server,
    priorEnv,
  };
}

const loaded = DATABASE_URL ? await boot() : null;

function dbTest(name: string, fn: (l: Loaded) => Promise<void>) {
  Deno.test({
    name,
    ignore: !loaded,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(loaded!),
  });
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const slug = () => `rt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

async function seedProvider(
  l: Loaded,
  id: string,
  issuer: string,
  over: Record<string, unknown> = {},
) {
  await l.pool.query(
    `INSERT INTO trexdb.sso_provider
       (id, "displayName", "clientId", "clientSecret", enabled, issuer, scopes,
        claim_map, auto_provision, groups_source)
     VALUES ($1,$1,'stub-client','stub-secret',$2,$3,'openid profile',
             $4::jsonb,$5,'none')`,
    [id, over.enabled ?? true, issuer, JSON.stringify({ email: "username" }), over.auto_provision ?? false],
  );
  // The configuration the plugin reads is the one trex's own writer produces,
  // not a literal invented here.
  assertEquals(await l.refreshProviderOidcConfig(l.pool, id), true);
}

async function seedLinkedUser(l: Loaded, providerId: string, sub: string) {
  await l.pool.query(
    `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, is_placeholder_email)
     VALUES ($1,'Alice',$2,false,'user',true)`,
    [sub, `${sub}@d2e.local`],
  );
  await l.pool.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
     VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), sub, sub, providerId],
  );
}

async function cleanUp(l: Loaded, providerId: string, userId?: string) {
  const { rows } = await l.pool.query(
    `SELECT "userId" FROM trexdb.account WHERE "providerId" = $1`,
    [providerId],
  );
  const ids = [...new Set([...rows.map((r: { userId: string }) => r.userId), ...(userId ? [userId] : [])])];
  await l.pool.query(`DELETE FROM trexdb.account WHERE "providerId" = $1`, [providerId]);
  if (ids.length) {
    await l.pool.query(`DELETE FROM trexdb.refresh_token WHERE "userId" = ANY($1)`, [ids]);
    await l.pool.query(`DELETE FROM trexdb.session WHERE "userId" = ANY($1)`, [ids]);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = ANY($1)`, [ids]);
  }
  await l.pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [providerId]);
}

const authorize = (l: Loaded, provider: string, redirectTo = "/portal") =>
  fetch(
    `${l.base}/trex/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${
      encodeURIComponent(redirectTo)
    }`,
    { redirect: "manual" },
  );

/** The cookies a response sets, reduced to what a browser would send back. */
const cookieHeader = (res: Response) =>
  res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

/**
 * The whole browser journey: /authorize, then the upstream's redirect back to
 * /callback carrying the state and the cookies /authorize set.
 */
async function signIn(l: Loaded, provider: string, redirectTo = "/portal") {
  const started = await authorize(l, provider, redirectTo);
  await started.body?.cancel();
  if (started.status !== 302) return { started, done: null as Response | null, state: "" };
  const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
  const done = await fetch(
    `${l.base}/trex/auth/v1/callback?code=stub-code&state=${encodeURIComponent(state)}`,
    { headers: { cookie: cookieHeader(started) }, redirect: "manual" },
  );
  return { started, done, state };
}

// ── /authorize ──────────────────────────────────────────────────────────────

dbTest("GET /authorize with an unknown provider is 400 invalid_request", async (l) => {
  // The page distinguishes this from a server error, so it must not become one
  // — and it must not become one for a provider that merely could not be
  // reached either, which is what the untrusted-origin case below pins.
  const res = await authorize(l, "no-such-provider");
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "invalid_request",
    error_description: "Unknown provider",
  });
});

dbTest("a disabled provider is refused at /authorize, before the upstream", async (l) => {
  // The gate this task must not regress. The plugin has no hook on
  // /sign-in/sso, so resolveUser's `enabled` check fires only at the callback,
  // i.e. after the person has authenticated upstream. Asserting the status is
  // not enough to show the flow never started: the evidence is that no
  // verification row was written, because writing one IS starting the flow.
  const id = slug();
  try {
    await seedProvider(l, id, l.trusted.origin, { enabled: false });
    const before = await l.pool.query(`SELECT count(*)::int AS n FROM trexdb.verification`);
    const res = await authorize(l, id);
    assertEquals(res.status, 400);
    assertEquals(await res.json(), {
      error: "invalid_request",
      error_description: "Unknown provider",
    });
    const after = await l.pool.query(`SELECT count(*)::int AS n FROM trexdb.verification`);
    assertEquals(after.rows[0].n, before.rows[0].n, "a disabled provider must start no flow");
  } finally {
    await cleanUp(l, id);
  }
});

dbTest("GET /authorize redirects to the upstream and stores the state", async (l) => {
  const id = slug();
  try {
    await seedProvider(l, id, l.trusted.origin);
    const res = await authorize(l, id);
    await res.body?.cancel();
    assertEquals(res.status, 302);

    const location = new URL(res.headers.get("location")!);
    assertEquals(location.origin + location.pathname, `${l.trusted.origin}/authorize`);
    assertEquals(location.searchParams.get("client_id"), "stub-client");
    assertEquals(location.searchParams.get("response_type"), "code");
    // PKCE is oidcConfig.pkce, per provider, and S256 is the only method the
    // plugin sends.
    assertEquals(location.searchParams.get("code_challenge_method"), "S256");
    assertEquals(
      location.searchParams.get("redirect_uri"),
      `${l.base}/trex/auth/v1/callback`,
      "the upstream must be sent the URI it has registered, not the plugin's own path",
    );

    // The state is in the table, not in the token: that is the whole of the
    // move off the self-contained encrypt-then-MAC state, and it is what makes
    // single use survive a second replica.
    const state = location.searchParams.get("state")!;
    const { rows } = await l.pool.query(
      `SELECT value FROM trexdb.verification WHERE identifier = $1`,
      [state],
    );
    assertEquals(rows.length, 1);
    assertStringIncludes(rows[0].value, "codeVerifier");

    // And the signed cookie that binds the flow to this browser.
    assertNotEquals(
      res.headers.getSetCookie().find((c) => c.includes("state=")),
      undefined,
      "without the state cookie the callback has nothing to compare against",
    );
  } finally {
    await cleanUp(l, id);
  }
});

dbTest("an issuer outside BETTER_AUTH_TRUSTED_ORIGINS is a server error, not an unknown provider", async (l) => {
  // The deployment requirement, from the operator's side. The provider row is
  // perfectly good and the upstream is up and answering — the only thing wrong
  // is the variable — so reporting "Unknown provider" would send whoever is on
  // call to the provider row and never to the setting. fetchOIDCEndpoint
  // refuses the discovery fetch and mapDiscoveryErrorToAPIError renders that as
  // a 400, which is exactly the collapse this branch exists to prevent.
  const id = slug();
  try {
    await seedProvider(l, id, l.untrusted.origin);
    const res = await authorize(l, id);
    assertEquals(res.status, 500);
    assertEquals(await res.json(), {
      error: "server_error",
      error_description: "Federated sign-in could not be started",
    });
  } finally {
    await cleanUp(l, id);
  }
});

// ── /callback ───────────────────────────────────────────────────────────────

dbTest("a successful callback sets sb-access-token and redirects to the return path", async (l) => {
  // The session the native password grant issues, because from the moment
  // /callback finishes the request must be indistinguishable from a native
  // login — neither the OIDC provider nor any relying party knows federation
  // exists. That is two cookies and not one: sb-access-token for the
  // same-origin readers, and the engine's own for /oauth2/authorize, which
  // reads nothing else.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);

    const { done } = await signIn(l, id, "/portal");
    await done!.body?.cancel();
    assertEquals(done!.status, 302);
    assertEquals(new URL(done!.headers.get("location")!).pathname, "/portal");

    const cookies = done!.headers.getSetCookie();
    assertEquals(cookies.some((c) => c.startsWith("sb-access-token=")), true);
    const engine = cookies.find((c) => c.includes("session_token="));
    assertNotEquals(engine, undefined, "the cookie /oauth2/authorize reads must be set too");

    // The rows, because the cookies alone would be satisfied by a flow that
    // minted a session for nobody. A refresh_token row is what createTokenResponse
    // writes and a session row is what the engine's cookie resolves to.
    const refresh = await l.pool.query(
      `SELECT count(*)::int AS n FROM trexdb.refresh_token WHERE "userId" = $1`,
      [sub],
    );
    assertEquals(refresh.rows[0].n, 1);
    const resolved = await l.auth.api.getSession({
      headers: new Headers({ cookie: engine!.split(";")[0] }),
    });
    assertEquals(resolved?.user?.id, sub);

    // The address column is untouched: `username` was the mapped stand-in, not
    // an address, and nothing on this path may write it.
    const { rows } = await l.pool.query(
      `SELECT email, is_placeholder_email FROM trexdb."user" WHERE id = $1`,
      [sub],
    );
    assertEquals(rows, [{ email: `${sub}@d2e.local`, is_placeholder_email: true }]);
  } finally {
    await cleanUp(l, id, sub);
  }
});

dbTest("an off-site redirect_to cannot leave the origin, on either path", async (l) => {
  // safeRedirectTo is the open-redirect guard, and the cutover moved both of
  // its consumers: the return path is now baked into callbackURL and into
  // errorCallbackURL at /authorize, and the plugin redirects to whichever of
  // them applies without ever re-checking it. So the check has to hold at the
  // point it is written, for both, and `//host` is absolute despite looking
  // relative.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  const priorLogin = Deno.env.get("TREX_OIDC_LOGIN_URL");
  Deno.env.set("TREX_OIDC_LOGIN_URL", `${l.base}/login?tenant=d2e`);
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);

    // Success: the browser lands back on trex, not on the attacker's host.
    const ok = await signIn(l, id, "//evil.test/steal");
    await ok.done!.body?.cancel();
    assertEquals(ok.done!.status, 302);
    const landed = new URL(ok.done!.headers.get("location")!);
    assertEquals(landed.origin, l.base);
    assertEquals(landed.pathname, "/");

    // Refusal: the login page is handed a return path it can safely use, so
    // the open redirect is not merely moved one hop further on.
    const started = await authorize(l, id, "/\\evil.test");
    await started.body?.cancel();
    await l.pool.query(`UPDATE trexdb.sso_provider SET enabled = false WHERE id = $1`, [id]);
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const done = await fetch(
      `${l.base}/trex/auth/v1/callback?code=stub-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookieHeader(started) }, redirect: "manual" },
    );
    await done.body?.cancel();
    const refused = new URL(done.headers.get("location")!);
    assertEquals(refused.origin, l.base);
    assertEquals(refused.pathname, "/login");
    assertEquals(refused.searchParams.get("return_to"), "/");
  } finally {
    if (priorLogin === undefined) Deno.env.delete("TREX_OIDC_LOGIN_URL");
    else Deno.env.set("TREX_OIDC_LOGIN_URL", priorLogin);
    await cleanUp(l, id, sub);
  }
});

dbTest("a refused sign-in lands on the login page with the code and the return path", async (l) => {
  // refusalRedirect's contract, now produced by the plugin's own errorCallbackURL:
  // ?error=<code>&return_to=<safe path>, with the login URL's own query
  // parameters kept.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  const priorLogin = Deno.env.get("TREX_OIDC_LOGIN_URL");
  Deno.env.set("TREX_OIDC_LOGIN_URL", `${l.base}/login?tenant=d2e`);
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);

    // Started while enabled, disabled before the callback: the provider's own
    // switch has to be honoured by the flow already in the air, which is the
    // case an incident is most likely to be about.
    const started = await authorize(l, id);
    await started.body?.cancel();
    assertEquals(started.status, 302);
    await l.pool.query(`UPDATE trexdb.sso_provider SET enabled = false WHERE id = $1`, [id]);

    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const done = await fetch(
      `${l.base}/trex/auth/v1/callback?code=stub-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookieHeader(started) }, redirect: "manual" },
    );
    await done.body?.cancel();
    assertEquals(done.status, 302);

    const landing = new URL(done.headers.get("location")!);
    assertEquals(landing.pathname, "/login");
    assertEquals(landing.searchParams.get("error"), "provider_disabled");
    assertEquals(landing.searchParams.get("return_to"), "/portal");
    assertEquals(landing.searchParams.get("tenant"), "d2e", "the login URL's own query is kept");

    // A refusal is a refusal all the way down: no session, no trex bearer.
    assertEquals(done.headers.getSetCookie().some((c) => c.startsWith("sb-access-token=")), false);
    const refresh = await l.pool.query(
      `SELECT count(*)::int AS n FROM trexdb.refresh_token WHERE "userId" = $1`,
      [sub],
    );
    assertEquals(refresh.rows[0].n, 0);
  } finally {
    if (priorLogin === undefined) Deno.env.delete("TREX_OIDC_LOGIN_URL");
    else Deno.env.set("TREX_OIDC_LOGIN_URL", priorLogin);
    await cleanUp(l, id, sub);
  }
});

dbTest("with no login page configured a refusal is still the JSON 403", async (l) => {
  // refusalRedirect answers null without a login URL and the pre-cutover
  // callback then replied with a body rather than redirecting. The plugin
  // cannot do that, so /authorize hands it a sentinel URL and /callback turns
  // it back into the body. A deployment that never set TREX_OIDC_LOGIN_URL
  // must not silently start 302ing browsers at a path nothing serves.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  const priorLogin = Deno.env.get("TREX_OIDC_LOGIN_URL");
  Deno.env.delete("TREX_OIDC_LOGIN_URL");
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);
    const started = await authorize(l, id);
    await started.body?.cancel();
    await l.pool.query(`UPDATE trexdb.sso_provider SET enabled = false WHERE id = $1`, [id]);
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;

    const done = await fetch(
      `${l.base}/trex/auth/v1/callback?code=stub-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookieHeader(started) }, redirect: "manual" },
    );
    assertEquals(done.status, 403);
    assertEquals(await done.json(), {
      error: "access_denied",
      error_description: "provider_disabled",
    });
  } finally {
    if (priorLogin !== undefined) Deno.env.set("TREX_OIDC_LOGIN_URL", priorLogin);
    await cleanUp(l, id, sub);
  }
});

dbTest("an upstream's own error text never reaches the browser", async (l) => {
  // The upstream picks `error` and `error_description` when it is the one
  // declining, and the plugin appends both verbatim to whatever URL /authorize
  // handed it. The pre-cutover route ran safeErrorCode over the code and never
  // forwarded a description; this asserts both halves, on the redirect path and
  // on the body path, because a provider's text landing in a page trex renders
  // is the reason that function exists.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  const hostile = "<img src=x onerror=alert(1)>";
  const priorLogin = Deno.env.get("TREX_OIDC_LOGIN_URL");
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);

    Deno.env.set("TREX_OIDC_LOGIN_URL", `${l.base}/login?tenant=d2e`);
    const started = await authorize(l, id);
    await started.body?.cancel();
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
    const declined = await fetch(
      `${l.base}/trex/auth/v1/callback?state=${encodeURIComponent(state)}&error=${
        encodeURIComponent(hostile)
      }&error_description=${encodeURIComponent(hostile)}`,
      { headers: { cookie: cookieHeader(started) }, redirect: "manual" },
    );
    await declined.body?.cancel();
    assertEquals(declined.status, 302);
    const landing = new URL(declined.headers.get("location")!);
    assertEquals(landing.searchParams.get("error"), "upstream_error");
    assertEquals(landing.searchParams.get("error_description"), null);
    assertEquals(declined.headers.get("location")!.includes("onerror"), false);

    // And the same through the body path, where there is no login page.
    Deno.env.delete("TREX_OIDC_LOGIN_URL");
    const started2 = await authorize(l, id);
    await started2.body?.cancel();
    const state2 = new URL(started2.headers.get("location")!).searchParams.get("state")!;
    const body = await fetch(
      `${l.base}/trex/auth/v1/callback?state=${encodeURIComponent(state2)}&error=${
        encodeURIComponent(hostile)
      }`,
      { headers: { cookie: cookieHeader(started2) }, redirect: "manual" },
    );
    assertEquals(body.status, 403);
    assertEquals(await body.json(), {
      error: "access_denied",
      error_description: "upstream_error",
    });
  } finally {
    if (priorLogin === undefined) Deno.env.delete("TREX_OIDC_LOGIN_URL");
    else Deno.env.set("TREX_OIDC_LOGIN_URL", priorLogin);
    await cleanUp(l, id, sub);
  }
});

dbTest("a replayed callback is refused, and the state is gone from the table", async (l) => {
  // What replaces the per-process replay map. The verification row is deleted
  // on use (better-auth dist/state.mjs:139), so the second attempt finds
  // nothing — and, unlike the map, neither would a second replica.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);
    const { started, done, state } = await signIn(l, id);
    await done!.body?.cancel();
    assertEquals(done!.status, 302);

    const { rows } = await l.pool.query(
      `SELECT count(*)::int AS n FROM trexdb.verification WHERE identifier = $1`,
      [state],
    );
    assertEquals(rows[0].n, 0, "a redeemed state must not be redeemable again");

    const replay = await fetch(
      `${l.base}/trex/auth/v1/callback?code=stub-code&state=${encodeURIComponent(state)}`,
      { headers: { cookie: cookieHeader(started) }, redirect: "manual" },
    );
    assertEquals(replay.status, 401);
    assertEquals(await replay.json(), {
      error: "invalid_request",
      error_description: "This sign-in did not start in this browser",
    });
  } finally {
    await cleanUp(l, id, sub);
  }
});

dbTest("a callback presenting no state cookie is refused", async (l) => {
  // Login CSRF, the attack the browser binding existed for: an attacker starts
  // a flow, authenticates as themselves, keeps the callback URL and gets a
  // victim to open it. The victim's browser holds no state cookie, and that is
  // what refuses — the state itself is perfectly valid.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  // A login page IS configured, so the refusal has somewhere it could be sent
  // — and must not be. The plugin recovers the per-flow errorURL from the state
  // it did parse and would 302 the victim's browser onto the login form with
  // ?error=state_mismatch; the pre-cutover route answered a body, and a page
  // that invites a victim to re-enter credentials is the wrong end of a
  // login-CSRF attempt.
  const priorLogin = Deno.env.get("TREX_OIDC_LOGIN_URL");
  Deno.env.set("TREX_OIDC_LOGIN_URL", `${l.base}/login?tenant=d2e`);
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);
    const started = await authorize(l, id);
    await started.body?.cancel();
    const state = new URL(started.headers.get("location")!).searchParams.get("state")!;

    const victim = await fetch(
      `${l.base}/trex/auth/v1/callback?code=stub-code&state=${encodeURIComponent(state)}`,
      { redirect: "manual" },
    );
    assertEquals(victim.status, 401);
    assertEquals(await victim.json(), {
      error: "invalid_request",
      error_description: "This sign-in did not start in this browser",
    });
    const refresh = await l.pool.query(
      `SELECT count(*)::int AS n FROM trexdb.refresh_token WHERE "userId" = $1`,
      [sub],
    );
    assertEquals(refresh.rows[0].n, 0, "no session may be minted for a browser that did not start the flow");
  } finally {
    if (priorLogin === undefined) Deno.env.delete("TREX_OIDC_LOGIN_URL");
    else Deno.env.set("TREX_OIDC_LOGIN_URL", priorLogin);
    await cleanUp(l, id, sub);
  }
});

dbTest("the authorization URL carries no nonce, which is a known accepted loss", async (l) => {
  // NOT an assertion that this is good. federation/verify.ts:54-59 required the
  // id_token's `nonce` to be present, non-empty and equal to the one the
  // authorization request sent; @better-auth/sso 1.7.5 has no concept of it
  // (`grep -c nonce dist/index.mjs` is 0) and validateOIDCIdToken checks
  // signature, issuer, audience and azp only. PHASE3-SPIKE-FINDINGS.md §10.1
  // carries the argument for accepting that — PKCE plus a single-use,
  // cookie-bound state covers what nonce defends in the code flow, and OIDC
  // Core makes it OPTIONAL here.
  //
  // This test exists so the decision is revisited rather than inherited. If a
  // later @better-auth/sso sends a nonce, this fails, and whoever sees it
  // should delete §10.1 and this case instead of adjusting the assertion.
  const id = slug();
  try {
    await seedProvider(l, id, l.trusted.origin);
    const res = await authorize(l, id);
    await res.body?.cancel();
    const url = new URL(res.headers.get("location")!);
    assertEquals(url.searchParams.get("nonce"), null);
    // The two that do the work in its place, so this case cannot pass by the
    // authorization URL being empty.
    assertEquals(url.searchParams.get("code_challenge_method"), "S256");
    assertNotEquals(url.searchParams.get("state"), null);
  } finally {
    await cleanUp(l, id);
  }
});

dbTest("skipStateCookieCheck is not set anywhere", async (l) => {
  // It would switch off the comparison at better-auth dist/state.mjs:132-136,
  // which is the whole of what replaces __Host-trex_federation. A default that
  // flipped, or an option added for a local convenience, would leave every case
  // above passing and the binding gone.
  assertEquals(l.auth.options.account?.skipStateCookieCheck, undefined);
  const ctx = await l.auth.$context;
  assertEquals(ctx.oauthConfig.skipStateCookieCheck, false);
  // And the strategy the whole cutover assumes, rather than the cookie one:
  // only "database" gives single use across replicas.
  assertEquals(ctx.oauthConfig.storeStateStrategy, "database");
});

// ── The boot-time audit ─────────────────────────────────────────────────────

Deno.test("the audit names every enabled provider whose issuer origin is untrusted", async () => {
  const pool = {
    query: () =>
      Promise.resolve({
        rows: [
          { id: "logto", issuer: "https://logto.example.test/oidc", discovery_url: null, oidcConfig: null },
          { id: "entra", issuer: "https://login.entra.test", discovery_url: null, oidcConfig: null },
          { id: "odd", issuer: "https://a.test", discovery_url: "https://disc.test/c", oidcConfig: null },
        ],
      }),
  };
  const trusted = (url: string) => new URL(url).origin === "https://logto.example.test";
  const { untrustedIssuerOrigins, auditTrustedIssuerOrigins } = await import("./router.ts");

  assertEquals(await untrustedIssuerOrigins(pool, trusted), [
    {
      id: "entra",
      url: "https://login.entra.test/.well-known/openid-configuration",
      origin: "https://login.entra.test",
    },
    // discovery_url wins where a row has one, because that is the URL
    // oidcConfigFor serialises and the one the plugin fetches first.
    { id: "odd", url: "https://disc.test/c", origin: "https://disc.test" },
  ]);

  const said: string[] = [];
  await auditTrustedIssuerOrigins(pool, (m: string) => said.push(m), trusted);
  assertEquals(said.length, 1);
  assertStringIncludes(said[0], "BETTER_AUTH_TRUSTED_ORIGINS");
  assertStringIncludes(said[0], "entra (https://login.entra.test)");
  assertStringIncludes(said[0], "https://login.entra.test,https://disc.test");
  // The one provider that IS configured correctly must not be named, or the
  // line stops being readable on a deployment with a dozen upstreams.
  assertEquals(said[0].includes("logto"), false);
});

Deno.test("the audit reaches the endpoints discovery does not serve", async () => {
  // An internal IdP may publish its token and JWKS endpoints on a different
  // host from the one serving its discovery document, and
  // assertServerFetchedOIDCEndpointsAllowed applies the same trusted-origin
  // test to every one of them (dist/index.mjs:513-521). Auditing the discovery
  // origin alone passed such a deployment at boot and let it fail at sign-in.
  const pool = {
    query: () =>
      Promise.resolve({
        rows: [{
          id: "internal",
          issuer: "https://idp.corp.test",
          discovery_url: null,
          // The shape oidcConfigFor writes: a string of JSON, not an object.
          oidcConfig: JSON.stringify({
            authorizationEndpoint: "https://login.corp.test/authorize",
            jwksEndpoint: "https://keys.corp.test/jwks",
            tokenEndpoint: "https://idp.corp.test/token",
          }),
        }],
      }),
  };
  const { untrustedIssuerOrigins } = await import("./router.ts");
  const trusted = (url: string) => new URL(url).origin === "https://idp.corp.test";
  assertEquals(
    (await untrustedIssuerOrigins(pool, trusted)).map((m: { origin: string }) => m.origin),
    ["https://login.corp.test", "https://keys.corp.test"],
    "discovery and the token endpoint are trusted; the other two are not and must be named",
  );
});

Deno.test("an unwritten or unparseable oidcConfig contributes nothing rather than throwing", async () => {
  // A provider created but not yet configured has oidcConfig NULL, and the
  // audit is a warning rather than a gate — it must not be the reason a node
  // fails to boot.
  const { untrustedIssuerOrigins } = await import("./router.ts");
  for (const oidcConfig of [null, undefined, "not json", "[]", '"a string"']) {
    const pool = {
      query: () =>
        Promise.resolve({
          rows: [{ id: "x", issuer: "https://bad.test", discovery_url: null, oidcConfig }],
        }),
    };
    assertEquals(
      (await untrustedIssuerOrigins(pool, () => false)).map((m: { url: string }) => m.url),
      ["https://bad.test/.well-known/openid-configuration"],
      `oidcConfig=${JSON.stringify(oidcConfig)} must leave the discovery check standing`,
    );
  }
});

Deno.test("a non-https base URL is announced, and a loopback one is not", async () => {
  // warnIfInsecureBinding's successor. The binding cookie is the plugin's now
  // and its Secure flag is decided once, from baseURL, so the warning moved
  // from the first weak request to boot. The exempt cases matter as much as the
  // warned one: a line that fires on every developer's machine is a line
  // nobody reads on the deployment that needs it.
  const { warnIfStateCookieInsecure } = await import("./router.ts");
  const said: string[] = [];
  const log = (m: string) => said.push(m);

  for (const quiet of [
    "https://trex.example.test/trex/oidc",
    "http://localhost:33001/trex/oidc",
    "http://127.0.0.1:33001/trex/oidc",
    "http://trex.localhost/trex/oidc",
    "not a url",
  ]) {
    warnIfStateCookieInsecure(quiet, log);
    assertEquals(said, [], `${quiet} must not warn`);
  }

  warnIfStateCookieInsecure("http://trex.example.test/trex/oidc", log);
  assertEquals(said.length, 1);
  assertStringIncludes(said[0], "__Secure-");
  assertStringIncludes(said[0], "TREX_OIDC_ISSUER");
});

Deno.test("the audit says nothing when every issuer origin is trusted", async () => {
  // A boot line that appeared for a correct deployment would be filtered out
  // within a week, and then the misconfigured one would be too.
  const pool = {
    query: () =>
      Promise.resolve({
        rows: [{ id: "logto", issuer: "https://ok.test", discovery_url: null, oidcConfig: null }],
      }),
  };
  const said: string[] = [];
  const { auditTrustedIssuerOrigins } = await import("./router.ts");
  await auditTrustedIssuerOrigins(pool, (m: string) => said.push(m), () => true);
  assertEquals(said, []);
});

// ── Rate limiting ───────────────────────────────────────────────────────────
//
// Two measurements, because the repair has two halves and either one alone
// leaves a hole the other covers. `engineHeaders` gives the engine an address
// so the bucket is per caller; the `/sso/callback` custom rule sizes that
// bucket back to what the route allowed before the cutover. The first case
// fails without the address, the second without the rule.

/**
 * The header a caller behind one reverse proxy actually arrives with: whatever
 * it chose to send, then the address the proxy appended. Under `trust proxy: 1`
 * express resolves `req.ip` to the rightmost entry — the only one the caller
 * cannot write — and discards the rest (measured: `9.9.9.9, 203.0.113.9` gives
 * `req.ip === "203.0.113.9"`).
 *
 * Every case below sends a chain rather than a bare address, because that is
 * the shape a deployment sees and it is the shape that separates forwarding
 * `req.ip` from forwarding the raw header. Better Auth refuses a chain it
 * cannot attribute — `forwardedIps.length !== 1` (@better-auth/core
 * utils/ip.mjs:190) — and falls straight back to the one shared bucket, so a
 * route that passed the caller's own header through would look correct here and
 * hand the denial of service back to every proxied installation. The leftmost
 * value varies per request for the same reason: it must not be able to buy
 * anything.
 */
const chain = (edge: string, spoof: string) => `${spoof}, ${edge}`;

/** `n` junk callbacks from `edge` — no cookie, no usable state, any source. */
async function flood(l: Loaded, edge: string, n: number) {
  for (let i = 0; i < n; i++) {
    const junk = await fetch(
      `${l.base}/trex/auth/v1/callback?code=x&state=junk-${edge}-${i}`,
      { headers: { "x-forwarded-for": chain(edge, `9.9.9.${i % 256}`) }, redirect: "manual" },
    );
    await junk.body?.cancel();
  }
}

/** One whole browser journey, attributed to `edge`. */
async function signInFrom(l: Loaded, id: string, edge: string) {
  const forwarded = chain(edge, "10.0.0.1");
  const started = await fetch(
    `${l.base}/trex/auth/v1/authorize?provider=${id}&redirect_to=%2Fportal`,
    { headers: { "x-forwarded-for": forwarded }, redirect: "manual" },
  );
  await started.body?.cancel();
  assertEquals(started.status, 302);
  const state = new URL(started.headers.get("location")!).searchParams.get("state")!;
  const done = await fetch(
    `${l.base}/trex/auth/v1/callback?code=stub-code&state=${encodeURIComponent(state)}`,
    { headers: { cookie: cookieHeader(started), "x-forwarded-for": forwarded }, redirect: "manual" },
  );
  await done.body?.cancel();
  return done;
}

dbTest("a flood at /callback cannot lock out a sign-in from another address", async (l) => {
  // Unauthenticated denial of service, and the reason /callback forwards an
  // address at all. The inner Request this route builds used to carry the
  // cookie header and nothing else, so Better Auth could resolve no client IP
  // and bucketed the whole process into ONE key, "no-trusted-ip|/sso/callback"
  // (api/rate-limiter/index.mjs:232-245). Nothing in the response said so
  // either: a 429 from the engine reaches the browser as this route's generic
  // 401, which names nothing an operator could act on.
  //
  // 700 requests over seven addresses, so trex's own authLimiter (600 per IP
  // per 15 minutes) never fires and every one of them reaches the engine. That
  // is past any shared bucket this route could be given — including the 600 the
  // custom rule sets — so only per-caller bucketing can save the victim, and
  // only the forwarded address produces that.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  const victim = "198.51.100.7";
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);
    for (let host = 1; host <= 7; host++) await flood(l, `203.0.113.${host}`, 100);

    const done = await signInFrom(l, id, victim);
    assertEquals(done.status, 302, "the victim's sign-in must survive the flood");
    assertEquals(new URL(done.headers.get("location")!).pathname, "/portal");
    // The wire alone would be satisfied by a redirect carrying no session, so
    // the row is what says the exchange actually completed.
    const refresh = await l.pool.query(
      `SELECT count(*)::int AS n FROM trexdb.refresh_token WHERE "userId" = $1`,
      [sub],
    );
    assertEquals(refresh.rows[0].n, 1);
  } finally {
    await cleanUp(l, id, sub);
  }
});

dbTest("a busy shared address does not lock itself out of /callback", async (l) => {
  // The other half, and the case an address alone does not fix. An IP is not a
  // user — middleware/rate-limit.ts says so at length — so a site behind one
  // NAT gateway is one bucket, and the engine's default for this path is 100
  // requests per 10 seconds. That is far below the 600 per 15 minutes the
  // pre-cutover route allowed, and a site that crossed it would lock ITSELF
  // out of federated sign-in with no attacker involved.
  //
  // 150 from one address: past the engine default, inside the restored budget.
  const id = slug();
  const sub = `${id}-subject`;
  l.claims.value = { sub, username: "alice" };
  const nat = "192.0.2.44";
  try {
    await seedProvider(l, id, l.trusted.origin);
    await seedLinkedUser(l, id, sub);
    await flood(l, nat, 150);

    const done = await signInFrom(l, id, nat);
    assertEquals(done.status, 302, "150 callbacks in a window must not exhaust one site's budget");
    assertEquals(new URL(done.headers.get("location")!).pathname, "/portal");
    const refresh = await l.pool.query(
      `SELECT count(*)::int AS n FROM trexdb.refresh_token WHERE "userId" = $1`,
      [sub],
    );
    assertEquals(refresh.rows[0].n, 1);
  } finally {
    await cleanUp(l, id, sub);
  }
});

// ── Teardown ────────────────────────────────────────────────────────────────

dbTest("the process is handed back as it was found", async (l) => {
  // Last in the file, because Deno runs a file's tests in declaration order and
  // every case above needs the environment boot() set. Two things are given
  // back: the four variables, which otherwise decide a later file's test, and
  // the three listening sockets, which otherwise outlive the run.
  for (const [name, value] of Object.entries(l.priorEnv)) {
    if (value === undefined) Deno.env.delete(name);
    else Deno.env.set(name, value);
  }
  for (const [name, value] of Object.entries(l.priorEnv)) {
    assertEquals(Deno.env.get(name), value, `${name} must be back to what it was`);
  }
  await new Promise<void>((r) => l.server.close(() => r()));
  await l.trusted.close();
  await l.untrusted.close();
});
