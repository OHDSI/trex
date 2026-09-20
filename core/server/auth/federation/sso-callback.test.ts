// The whole cutover, driven end to end against a real upstream and a real
// database — because every other test in this task proves the resolver as a
// *function*, and none of them would notice if `resolveUser: resolveSsoUser`
// were deleted from better-auth.ts. That was measured: removing the option
// left all 532 tests green. The policy has to be pinned where it is wired, not
// only where it is written.
//
// What runs here is the engine the process actually exports: `auth.options` is
// spread verbatim, plugin instances included, and only `trustedOrigins` is
// widened to admit the stub upstream's ephemeral origin — which the plugin
// insists on for every discovery, token and JWKS fetch. So the sso() instance
// under test is the one better-auth.ts built, carrying the options
// better-auth.ts passed it.
//
// The upstream binds Deno.serve({ port: 0, hostname: "127.0.0.1" }) and never
// `port: 0` alone: a wildcard bind can take the Postgres port and answer the
// test's own fetch, which was a ~2% random failure in Phase 1, misdiagnosed
// twice.
import { assertEquals, assertNotEquals, assertStringIncludes } from "jsr:@std/assert";
import { exportJWK, generateKeyPair, SignJWT } from "npm:jose";
import { betterAuth } from "better-auth";
import { resolveSsoUser } from "./resolve-user.ts";
import { provisionSsoUser } from "./provision.ts";
import { _resetRootKeyCache } from "../keys.ts";
import { _setDekForTests, decryptWithDek } from "../dek.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

async function loadModules() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return {
      auth: (await import("../better-auth.ts")).auth,
      pool: (await import("../../db.ts")).pool,
      refreshProviderOidcConfig: (await import("./admin-store.ts")).refreshProviderOidcConfig,
    };
  } finally {
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    _resetRootKeyCache();
  }
}

const loaded = DATABASE_URL ? await loadModules() : null;

// Every sign-in below now writes through account-tokens.ts, which encrypts under
// the DEK. initDek() is normally what fills it, at boot, from
// trexdb.kek_wrapped_dek; this suite boots no server, so the cache is primed
// here. Without it the callback fails rather than storing anything — which is
// the intended behaviour and is pinned as a unit test, not here.
_setDekForTests(new Uint8Array(32));

function dbTest(name: string, fn: (l: NonNullable<typeof loaded>) => Promise<void>) {
  Deno.test({
    name: `[e2e] ${name}`,
    ignore: !loaded,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(loaded!),
  });
}

// ── The stub upstream ───────────────────────────────────────────────────────

interface Upstream {
  origin: string;
  close: () => Promise<void>;
}

/**
 * An OIDC provider with exactly the four fields REQUIRED_DISCOVERY_FIELDS names
 * and nothing more — unless `userinfo` is passed.
 *
 * No `userinfo_endpoint` by default, deliberately: with one, the plugin builds
 * its profile from UserInfo, and the branch that carries this whole phase is
 * the id_token one (dist/index.mjs:3926-3937). Leaving it out is what makes the
 * id_token the source, which is also what `verifiedIdTokenClaims` is.
 *
 * Passing `userinfo` advertises the endpoint in discovery, which is what a real
 * upstream does: ensureRuntimeDiscovery hydrates `config.userInfoEndpoint` from
 * the document at sign-in time, and :3909 is checked BEFORE :3926, so the
 * profile then comes from UserInfo. Group resolution must not depend on which
 * of the two the plugin happened to take, and that is measured rather than
 * assumed.
 */
async function startUpstream(
  claimsFor: () => Record<string, unknown>,
  userinfo?: () => Record<string, unknown>,
  // Extra members of the *token response*, re-read on every /token call so one
  // upstream can answer four consecutive callbacks differently. The token
  // response is untyped all the way to the column — @better-auth/core's
  // getOAuth2Tokens does `refreshToken: data.refresh_token` with no coercion
  // and no schema — so what an IdP puts in this JSON is what the hook is
  // handed, and `null`, `""` and a number are all ordinary JSON.
  tokenExtra?: () => Record<string, unknown>,
): Promise<Upstream> {
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
          ...(userinfo ? { userinfo_endpoint: `${origin}/userinfo` } : {}),
        });
      }
      if (path === "/jwks") return Response.json({ keys: [jwk] });
      if (path === "/userinfo" && userinfo) return Response.json(userinfo());
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
          ...(tokenExtra ? tokenExtra() : {}),
        });
      }
      return new Response("not found", { status: 404 });
    },
  );
  origin = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}`;
  return { origin, close: () => server.shutdown() };
}

// ── The engine, and the flow ────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
function engineTrusting(auth: any, origin: string) {
  return betterAuth({
    ...auth.options,
    trustedOrigins: [...(auth.options.trustedOrigins ?? []), origin],
    // The only other override, and it is not part of what is under test: the
    // engine enables rate limiting, and a suite that drives several sign-ins
    // from 127.0.0.1 in one second measures the limiter rather than the
    // policy. Everything else — plugins, hooks, user fields, the sso()
    // instance and its option block — is better-auth.ts's own.
    rateLimit: { enabled: false },
  });
}

interface Outcome {
  status: number;
  location: string;
  error: string | null;
}

/**
 * POST /sign-in/sso, then GET the callback with the state cookie the first leg
 * set — the two halves of the flow a browser makes, without a browser.
 */
// deno-lint-ignore no-explicit-any
async function signIn(engine: any, baseURL: string, providerId: string): Promise<Outcome> {
  const origin = new URL(baseURL).origin;
  const started = await engine.handler(
    new Request(`${baseURL}/sign-in/sso`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({
        providerId,
        callbackURL: "/signed-in",
        errorCallbackURL: "/refused",
      }),
    }),
  );
  if (started.status !== 200) {
    return { status: started.status, location: await started.text(), error: null };
  }
  const { url } = await started.json();
  const cookie = started.headers.getSetCookie().map((c: string) => c.split(";")[0]).join("; ");
  const state = new URL(url).searchParams.get("state");

  const done = await engine.handler(
    new Request(
      `${baseURL}/sso/callback/${providerId}?code=stub-code&state=${encodeURIComponent(state!)}`,
      { headers: { cookie } },
    ),
  );
  await done.body?.cancel();
  const location = done.headers.get("location") ?? "";
  return {
    status: done.status,
    location,
    error: location ? new URL(location, origin).searchParams.get("error") : null,
  };
}

// deno-lint-ignore no-explicit-any
type Pg = any;

async function seedProvider(
  // deno-lint-ignore no-explicit-any
  { pool, refreshProviderOidcConfig }: any,
  id: string,
  issuer: string,
  over: Record<string, unknown> = {},
) {
  await pool.query(
    `INSERT INTO trexdb.sso_provider
       (id, "displayName", "clientId", "clientSecret", enabled, issuer, scopes,
        claim_map, auto_provision, email_domain_allowlist, allow_elevated_auto_link,
        groups_source, groups_claim)
     VALUES ($1,$1,'stub-client','stub-secret',$2,$3,'openid profile',
             $4::jsonb,$5,$6,false,$7,$8)`,
    [
      id,
      over.enabled ?? true,
      issuer,
      JSON.stringify(over.claim_map ?? { email: "username" }),
      over.auto_provision ?? false,
      over.email_domain_allowlist ?? null,
      // The column's own default, so a provider that says nothing about groups
      // is seeded as the majority of real rows are.
      over.groups_source ?? "none",
      over.groups_claim ?? null,
    ],
  );
  // The configuration the plugin reads is the one trex's own writer produces —
  // not a literal invented here. That is what makes this a test of the writer
  // as well as of the resolver.
  const written = await refreshProviderOidcConfig(pool, id);
  assertEquals(written, true);
}

async function cleanUp(pool: Pg, id: string) {
  // The owning users are read BEFORE their account rows go, not after: an
  // earlier version deleted the accounts first and then looked the users up
  // through them, which left every provisioned row behind and let one test's
  // leftovers decide the next one's outcome. That is the shape these tests
  // exist to catch, so it must not be the shape of their own fixture.
  const { rows } = await pool.query(
    `SELECT "userId" FROM trexdb.account WHERE "providerId" = $1`,
    [id],
  );
  const userIds = rows.map((r: { userId: string }) => r.userId);
  await pool.query(`DELETE FROM trexdb.account WHERE "providerId" = $1`, [id]);
  if (userIds.length > 0) {
    await pool.query(`DELETE FROM trexdb.session WHERE "userId" = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM trexdb."user" WHERE id = ANY($1)`, [userIds]);
  }
  await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
}

const slug = () => `e2e_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

async function usersMatching(pool: Pg, like: string) {
  const { rows } = await pool.query(
    `SELECT id, email, is_placeholder_email, "emailVerified"
       FROM trexdb."user" WHERE email LIKE $1 OR id = $2 ORDER BY email`,
    [like, like],
  );
  return rows;
}

// ── The gate, on a real upstream ────────────────────────────────────────────

dbTest("a pre-linked, address-less identity signs in and keeps its address", async (l) => {
  // The measurement the whole phase was gated on, repeated here against the
  // configuration oidcConfigFor actually writes: the upstream asserts no
  // `email` and no `email_verified` at all, and the id_token's `username` is
  // what satisfies dist/index.mjs:3938.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({ sub, username: "alice" }));
  try {
    await seedProvider(l, id, up.origin);
    await l.pool.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, is_placeholder_email)
       VALUES ($1,'Alice',$2,false,'user',true)`,
      [sub, `${sub}@d2e.local`],
    );
    await l.pool.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
       VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), sub, sub, id],
    );

    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals({ status: out.status, error: out.error }, { status: 302, error: null });
    assertStringIncludes(out.location, "/signed-in");

    // And the address column is untouched — the username was never written.
    const { rows } = await l.pool.query(
      `SELECT email, is_placeholder_email FROM trexdb."user" WHERE id = $1`,
      [sub],
    );
    assertEquals(rows, [{ email: `${sub}@d2e.local`, is_placeholder_email: true }]);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("a disabled provider cannot complete a sign-in", async (l) => {
  // This is the one that fails if `resolveUser: resolveSsoUser` is removed from
  // better-auth.ts. Nothing in the plugin consults `enabled` —
  // resolveOIDCProvider filters on providerId alone — so without the resolver
  // wired in, this pre-linked identity signs straight in through a provider an
  // operator has switched off.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({ sub, username: "alice" }));
  try {
    await seedProvider(l, id, up.origin, { enabled: false });
    await l.pool.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role)
       VALUES ($1,'Alice',$2,false,'user')`,
      [sub, `${sub}@d2e.local`],
    );
    await l.pool.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
       VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), sub, sub, id],
    );

    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals(out.status, 302);
    assertEquals(out.error, "provider_disabled");
    assertStringIncludes(out.location, "/refused");

    // No session was created for the account behind that link.
    const { rows } = await l.pool.query(
      `SELECT count(*)::int AS n FROM trexdb.session WHERE "userId" = $1`,
      [sub],
    );
    assertEquals(rows[0].n, 0);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("a banned user cannot sign in through the link they already have", async (l) => {
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({ sub, username: "alice" }));
  try {
    await seedProvider(l, id, up.origin);
    await l.pool.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, banned)
       VALUES ($1,'Alice',$2,false,'user',true)`,
      [sub, `${sub}@d2e.local`],
    );
    await l.pool.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
       VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), sub, sub, id],
    );

    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals(out.error, "account_disabled");
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

// ── The provision guard, measured rather than argued ────────────────────────

dbTest("auto-provision cannot write a mapped username into the address column", async (l) => {
  // Measured before the guard existed: this created a row with
  // email = 'alice', is_placeholder_email = false — a bare username in a
  // UNIQUE NOT NULL address column, flagged as a legitimate link candidate,
  // exactly the shape V17 spent a migration eliminating. The assertion is on
  // the table, not on the redirect, because the row is the damage.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({ sub, username: "alice" }));
  try {
    await seedProvider(l, id, up.origin, { auto_provision: true });
    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals(out.error, "upstream_email_unusable");
    assertEquals(await usersMatching(l.pool, "alice"), []);
    const { rows } = await l.pool.query(
      `SELECT count(*)::int AS n FROM trexdb.account WHERE "providerId" = $1`,
      [id],
    );
    assertEquals(rows[0].n, 0);
  } finally {
    await cleanUp(l.pool, id);
    await up.close();
  }
});

dbTest("a judged address does not license writing a different one", async (l) => {
  // The sharper half, and the reason the guard is an equality rather than an
  // addressability test. Here the id_token carries a real, verified address
  // inside the allowlist — so the allowlist passed, and isEngineAddressable
  // passed, on `real@allowed.test`. Before the guard, 'alice' is what got
  // written. Every address check in the resolver was vacuous.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({
    sub,
    username: "alice",
    email: "real@allowed.test",
    email_verified: true,
  }));
  try {
    await seedProvider(l, id, up.origin, {
      auto_provision: true,
      email_domain_allowlist: ["allowed.test"],
    });
    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals(out.error, "upstream_email_unusable");
    assertEquals(await usersMatching(l.pool, "alice"), []);
    assertEquals(await usersMatching(l.pool, "real@allowed.test"), []);
  } finally {
    await cleanUp(l.pool, id);
    await up.close();
  }
});

dbTest("auto-provision still works where the mapped claim IS the address", async (l) => {
  // Narrowness, without which the two above are satisfied by refusing
  // everything. With claim_map.email naming the upstream's real address claim,
  // the value the engine stores is the value the policy judged, and the
  // account is created.
  const id = slug();
  const sub = `${id}-subject`;
  const address = `${id}@allowed.test`;
  const up = await startUpstream(() => ({ sub, email: address, email_verified: true }));
  try {
    await seedProvider(l, id, up.origin, {
      auto_provision: true,
      claim_map: { email: "email" },
      email_domain_allowlist: ["allowed.test"],
    });
    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals({ error: out.error, status: out.status }, { error: null, status: 302 });
    assertStringIncludes(out.location, "/signed-in");

    const rows = await usersMatching(l.pool, address);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].email, address);
    assertEquals(rows[0].is_placeholder_email, false);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE email = $1`, [address]);
    await up.close();
  }
});

// ── The DEK envelope, on the row the callback actually wrote ───────────

/** The three token columns exactly as Postgres holds them. */
async function storedTokens(pool: Pg, providerId: string) {
  const { rows } = await pool.query(
    `SELECT "userId", "accountId", "providerId",
            "accessToken", "refreshToken", "idToken"
       FROM trexdb.account WHERE "providerId" = $1`,
    [providerId],
  );
  return rows;
}

dbTest("a sign-in through an existing link stores the upstream tokens sealed", async (l) => {
  // Measured before the hooks existed: accessToken held 'stub-access-token'
  // verbatim and idToken a raw eyJ... JWT, both in clear text, because
  // account.encryptOAuthTokens is false and nothing else stood in the way. The
  // assertions are on the columns and on the round trip through trex's own
  // decryptWithDek, not on the values the hook returned and not on whether the
  // stored value merely *looks* encrypted — that last would be satisfied by any
  // transformation at all, a wrong one included.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({ sub, username: "alice" }));
  try {
    await seedProvider(l, id, up.origin);
    await l.pool.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, is_placeholder_email)
       VALUES ($1,'Alice',$2,false,'user',true)`,
      [sub, `${sub}@d2e.local`],
    );
    await l.pool.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
       VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), sub, sub, id],
    );

    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals({ status: out.status, error: out.error }, { status: 302, error: null });

    const rows = await storedTokens(l.pool, id);
    assertEquals(rows.length, 1);
    const row = rows[0];
    // The binding is untouched. Had the hook returned any of these three,
    // requireExactAccountBinding would have failed the sign-in above with
    // account_hook_binding_conflict instead.
    assertEquals(
      { userId: row.userId, accountId: row.accountId, providerId: row.providerId },
      { userId: sub, accountId: sub, providerId: id },
    );
    assertNotEquals(row.accessToken, "stub-access-token");
    assertEquals(await decryptWithDek(row.accessToken), "stub-access-token");
    assertNotEquals(row.idToken, null);
    assertEquals((row.idToken as string).startsWith("eyJ"), false);
    const idToken = await decryptWithDek(row.idToken);
    assertEquals(idToken.split(".").length, 3);
    assertEquals(JSON.parse(atob(idToken.split(".")[1])).sub, sub);
    // The upstream issued no refresh token, and a sealed empty string would be
    // a perfectly good ciphertext. NULL is what "there is no token" has to look
    // like, because null-ness is the only thing any reader tests.
    assertEquals(row.refreshToken, null);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("a provisioned account's tokens are sealed on the create path too", async (l) => {
  // The other of the two writes: an existing link goes through
  // updateWithHooks, a first sign-in through createWithHooks, and a hook
  // registered on only one of them would leave half the rows in the clear.
  const id = slug();
  const sub = `${id}-subject`;
  const address = `${id}@allowed.test`;
  const up = await startUpstream(() => ({ sub, email: address, email_verified: true }));
  try {
    await seedProvider(l, id, up.origin, {
      auto_provision: true,
      claim_map: { email: "email" },
      email_domain_allowlist: ["allowed.test"],
    });
    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals({ status: out.status, error: out.error }, { status: 302, error: null });

    const rows = await storedTokens(l.pool, id);
    assertEquals(rows.length, 1);
    assertEquals(rows[0].accountId, sub);
    assertNotEquals(rows[0].accessToken, "stub-access-token");
    assertEquals(await decryptWithDek(rows[0].accessToken), "stub-access-token");
    assertEquals(JSON.parse(atob((await decryptWithDek(rows[0].idToken)).split(".")[1])).sub, sub);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE email = $1`, [address]);
    await up.close();
  }
});

dbTest("what the callback stored comes back through the sanctioned reader", async (l) => {
  // readAccountTokens is the only path allowed to touch these columns, and
  // until now it only ever read rows upsertAccount had written. This is the
  // seam the cutover moved: Better Auth writes, providers.ts reads.
  const { readAccountTokens } = await import("./providers.ts");
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({ sub, username: "alice" }));
  try {
    await seedProvider(l, id, up.origin);
    await l.pool.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role)
       VALUES ($1,'Alice',$2,false,'user')`,
      [sub, `${sub}@d2e.local`],
    );
    await l.pool.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
       VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), sub, sub, id],
    );
    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals(out.error, null);

    const tokens = await readAccountTokens(l.pool, id, sub);
    assertNotEquals(tokens, null);
    assertEquals(tokens!.userId, sub);
    assertEquals(tokens!.accessToken, "stub-access-token");
    assertEquals(tokens!.refreshToken, null);
    assertEquals(JSON.parse(atob(tokens!.idToken!.split(".")[1])).sub, sub);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("the four refresh-token shapes an upstream can send, measured on the row", async (l) => {
  // The hook's return value says nothing about what is written: with-hooks.mjs
  // merges it over the pending row (`actualData = {...actualData, ...result.data}`),
  // so a field the hook declines to seal is not omitted — the ORIGINAL value goes
  // to the adapter. Every assertion here is therefore on the column, read back
  // after a real callback, and the four shapes run in order against the SAME row
  // so that "preserved" and "destroyed" are distinguishable.
  const id = slug();
  const sub = `${id}-subject`;
  let tokenExtra: Record<string, unknown> = { refresh_token: "seed-refresh-token" };
  const up = await startUpstream(() => ({ sub, username: "alice" }), undefined, () => tokenExtra);
  const refreshColumn = async () => (await storedTokens(l.pool, id))[0].refreshToken;
  try {
    await seedProvider(l, id, up.origin);
    await l.pool.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role)
       VALUES ($1,'Alice',$2,false,'user')`,
      [sub, `${sub}@d2e.local`],
    );
    await l.pool.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
       VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), sub, sub, id],
    );
    const engine = engineTrusting(l.auth, up.origin);

    // 1. A string: sealed, and readable back through the sanctioned reader.
    assertEquals((await signIn(engine, l.auth.options.baseURL, id)).error, null);
    const seeded = await refreshColumn();
    assertNotEquals(seeded, "seed-refresh-token");
    assertEquals(await decryptWithDek(seeded), "seed-refresh-token");

    // 2. Absent: Better Auth filters undefined out of its update, so the column
    //    is not written at all — the same ciphertext, byte for byte, not a
    //    re-seal of the same value.
    tokenExtra = {};
    assertEquals((await signIn(engine, l.auth.options.baseURL, id)).error, null);
    assertEquals(await refreshColumn(), seeded);

    // 3. null. An ordinary JSON shape, and it reaches the column: null is not
    //    undefined, so Better Auth's filter keeps it.
    tokenExtra = { refresh_token: null };
    assertEquals((await signIn(engine, l.auth.options.baseURL, id)).error, null);
    assertEquals(await refreshColumn(), null);

    // 4. "". The empty string is a string, so only a length test stands between
    //    it and the column. NULL is what it has to become: null-ness is the one
    //    property every reader tests, and "" is not a token.
    tokenExtra = { refresh_token: "" };
    assertEquals((await signIn(engine, l.auth.options.baseURL, id)).error, null);
    assertEquals(await refreshColumn(), null);

    // 5. A number, from a non-conformant IdP. This is the one that mattered:
    //    before the fix the column held the string "12345" in CLEAR TEXT and
    //    readAccountTokens then threw on the row for good. NULL, like every
    //    other unusable value, and the reader still works.
    tokenExtra = { refresh_token: 12345 };
    assertEquals((await signIn(engine, l.auth.options.baseURL, id)).error, null);
    assertEquals(await refreshColumn(), null);
    const tokens = await (await import("./providers.ts")).readAccountTokens(l.pool, id, sub);
    assertEquals(tokens!.refreshToken, null);
    assertEquals(tokens!.accessToken, "stub-access-token");
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("a large id_token and a base64-shaped refresh token are sealed like any other", async (l) => {
  // Narrowness against the two guards that would look reasonable in review and
  // are not: a size cap (`value.length > 4096`), which an IdP that puts groups
  // in the id_token walks straight past, and a "this already looks base64, so
  // it must already be sealed" test. Both change what reaches the column, and
  // nothing else in the suite varies either dimension.
  const id = slug();
  const sub = `${id}-subject`;
  const groups = Array.from({ length: 300 }, (_, i) => `group-with-a-long-name-${i}`);
  const base64Shaped = btoa("a-refresh-token-that-happens-to-be-base64-shaped-aaaa");
  const up = await startUpstream(
    () => ({ sub, username: "alice", groups }),
    undefined,
    () => ({ refresh_token: base64Shaped }),
  );
  try {
    await seedProvider(l, id, up.origin);
    await l.pool.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role)
       VALUES ($1,'Alice',$2,false,'user')`,
      [sub, `${sub}@d2e.local`],
    );
    await l.pool.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
       VALUES ($1,$2,$3,$4)`,
      [crypto.randomUUID(), sub, sub, id],
    );
    assertEquals(
      (await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id)).error,
      null,
    );

    const row = (await storedTokens(l.pool, id))[0];
    const idToken = await decryptWithDek(row.idToken);
    // The id_token really is over the cap a reviewer would reach for.
    assertEquals(idToken.length > 4096, true);
    assertEquals(JSON.parse(atob(idToken.split(".")[1])).groups.length, 300);
    assertEquals((row.idToken as string).startsWith("eyJ"), false);
    assertNotEquals(row.refreshToken, base64Shaped);
    assertEquals(await decryptWithDek(row.refreshToken), base64Shaped);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

// ── The idp block and the sign-in stamp, on the row the callback wrote ──────

/** The two things provisionUser is responsible for, straight out of the table. */
async function signInFacts(pool: Pg, userId: string) {
  const { rows } = await pool.query(
    `SELECT app_metadata, last_sign_in_at, user_metadata
       FROM trexdb."user" WHERE id = $1`,
    [userId],
  );
  return rows[0];
}

/** A pre-linked user whose app_metadata already carries a key that is not ours. */
async function seedLinkedUser(pool: Pg, sub: string, providerId: string) {
  await pool.query(
    `INSERT INTO trexdb."user"
       (id, name, email, "emailVerified", role, is_placeholder_email, app_metadata)
     VALUES ($1,'Alice',$2,false,'user',true,'{"keep":"me"}'::jsonb)`,
    [sub, `${sub}@d2e.local`],
  );
  await pool.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
     VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), sub, sub, providerId],
  );
}

dbTest("the groups an upstream asserted are on the user row after the callback", async (l) => {
  // The measurement this task exists for. Before it, groups_source and
  // groups_claim were columns read by nothing: resolveUser cannot write, and
  // mounting it turns deferNonDatabaseWrites on, so an installation that had
  // configured group mapping got no groups and no error at all. The assertion
  // is on app_metadata, not on a resolver's return value, because the row is
  // what the OIDC provider's fetchUser() will later read.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({
    sub,
    username: "alice",
    roles: ["alp-admins", "study-42"],
  }));
  try {
    await seedProvider(l, id, up.origin, { groups_source: "claim", groups_claim: "roles" });
    await seedLinkedUser(l.pool, sub, id);
    // Nothing has stamped a sign-in yet, so the column below starts NULL.
    assertEquals((await signInFacts(l.pool, sub)).last_sign_in_at, null);

    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals({ status: out.status, error: out.error }, { status: 302, error: null });

    const after = await signInFacts(l.pool, sub);
    assertEquals(after.app_metadata, {
      // The other key survives: the write merges, it does not replace.
      keep: "me",
      idp: { provider: id, groups: ["alp-admins", "study-42"] },
    });
    assertNotEquals(after.last_sign_in_at, null);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("the block is written from the id_token even when UserInfo fed the profile", async (l) => {
  // The branch Task 1's spike never measured. A real upstream advertises a
  // userinfo_endpoint, ensureRuntimeDiscovery hydrates it, and :3909 is
  // checked before :3926 — so the profile comes from UserInfo, and `userInfo`
  // is the MAPPED shape, which has no room for a groups claim. Here UserInfo
  // deliberately omits `roles` and the id_token carries it: the groups still
  // land, because the decode reads the verified id_token rather than the
  // profile the plugin happened to build.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(
    () => ({ sub, username: "alice", roles: ["from-id-token"] }),
    () => ({ sub, username: "alice" }),
  );
  try {
    await seedProvider(l, id, up.origin, { groups_source: "claim", groups_claim: "roles" });
    await seedLinkedUser(l.pool, sub, id);

    const out = await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id);
    assertEquals({ status: out.status, error: out.error }, { status: 302, error: null });
    assertEquals((await signInFacts(l.pool, sub)).app_metadata.idp, {
      provider: id,
      groups: ["from-id-token"],
    });
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("a second sign-in replaces the block rather than keeping the first one", async (l) => {
  // Why provisionUserOnEveryLogin is set. The groups an upstream asserts change
  // between sign-ins — a user removed from a study group is the case that
  // matters — and a block written once at registration would say otherwise
  // forever. It would also never be written at all for the migrated users,
  // every one of whom is already registered.
  const id = slug();
  const sub = `${id}-subject`;
  let roles = ["study-42"];
  const up = await startUpstream(() => ({ sub, username: "alice", roles }));
  try {
    await seedProvider(l, id, up.origin, { groups_source: "claim", groups_claim: "roles" });
    await seedLinkedUser(l.pool, sub, id);
    const engine = engineTrusting(l.auth, up.origin);

    assertEquals((await signIn(engine, l.auth.options.baseURL, id)).error, null);
    assertEquals((await signInFacts(l.pool, sub)).app_metadata.idp.groups, ["study-42"]);

    roles = [];
    assertEquals((await signIn(engine, l.auth.options.baseURL, id)).error, null);
    // Not merged with the first list, and not left behind: the block describes
    // the most recent sign-in.
    assertEquals((await signInFacts(l.pool, sub)).app_metadata.idp.groups, []);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("a provider that maps no groups still stamps the sign-in", async (l) => {
  // groups_source 'none' is the column's default and what most rows carry.
  // last_sign_in_at is parity with the native grants, which stamp it on every
  // successful login; without it a federated user never records a sign-in.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({ sub, username: "alice", roles: ["ignored"] }));
  try {
    await seedProvider(l, id, up.origin);
    await seedLinkedUser(l.pool, sub, id);

    assertEquals((await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id)).error, null);
    const after = await signInFacts(l.pool, sub);
    assertEquals(after.app_metadata.idp, { provider: id, groups: [] });
    assertNotEquals(after.last_sign_in_at, null);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

dbTest("a refused sign-in leaves no idp block behind", async (l) => {
  // provisionUser runs after the commit, so it must not run at all on a path
  // that never committed. A disabled provider that still stamped a sign-in and
  // published its groups would be worse than one that merely failed.
  const id = slug();
  const sub = `${id}-subject`;
  const up = await startUpstream(() => ({ sub, username: "alice", roles: ["alp-admins"] }));
  try {
    await seedProvider(l, id, up.origin, {
      enabled: false,
      groups_source: "claim",
      groups_claim: "roles",
    });
    await seedLinkedUser(l.pool, sub, id);

    assertEquals(
      (await signIn(engineTrusting(l.auth, up.origin), l.auth.options.baseURL, id)).error,
      "provider_disabled",
    );
    const after = await signInFacts(l.pool, sub);
    assertEquals(after.app_metadata, { keep: "me" });
    assertEquals(after.last_sign_in_at, null);
  } finally {
    await cleanUp(l.pool, id);
    await l.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [sub]);
    await up.close();
  }
});

// ── The wiring itself ───────────────────────────────────────────────────────

dbTest("the exported engine carries trex's resolver and both mutation doors", async ({ auth }) => {
  // The structural companion to the behavioural pin above: a plugin instance
  // keeps the option block it was constructed with, so the three options this
  // task added can be read straight off the engine the process exports. The
  // behavioural test catches a resolver that is wired but wrong; this catches
  // one that is written but not wired, and names which option went missing.
  // deno-lint-ignore no-explicit-any
  const plugin = (auth.options.plugins as any[]).find((p) => p.id === "sso");
  assertNotEquals(plugin, undefined);
  assertEquals(plugin.options.resolveUser, resolveSsoUser);
  assertEquals(plugin.options.providersLimit, 0);
  assertEquals(typeof plugin.options.guardProviderMutation, "function");
  assertEquals(plugin.options.schema.ssoProvider.modelName, "sso_provider");
  assertEquals(plugin.options.provisionUser, provisionSsoUser);
  // Not merely truthy: false is the default, and the default is the bug.
  assertEquals(plugin.options.provisionUserOnEveryLogin, true);
});
