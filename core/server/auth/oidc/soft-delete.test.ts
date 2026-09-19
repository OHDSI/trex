// A soft-deleted account must not be able to obtain a token. The router this
// task deleted enforced that in one line — `... WHERE id = $1 AND "deletedAt"
// IS NULL`, reached from the code exchange, the refresh grant and /userinfo
// alike — and @better-auth/oauth-provider has no equivalent: its
// `findUserById` carries no predicate, and a custom-claims callback can only
// shape claims, never refuse. Without the guard mount.ts installs, a
// deactivated account keeps minting id_tokens from a live session or from a
// refresh token issued before the deletion.
//
// So this drives a real flow against a real listener: every path is shown
// working for a live user first, so that the refusals afterwards are
// attributable to the soft delete and not to a flow that never worked.
//
// Gated on DATABASE_URL like the other auth suites, and skipping rather than
// inventing one.
import { assertEquals, assertNotEquals } from "jsr:@std/assert";

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

const REDIRECT_URI = "https://rp.test/soft-delete/cb";
const CLIENT_SECRET = "soft-delete-suite-secret";

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** `name=value` pairs only: what a browser would send back. */
const cookieHeader = (setCookies: string[]) =>
  setCookies.map((c) => c.split(";")[0]).join("; ");

interface Flow {
  server: Awaited<ReturnType<NonNullable<typeof mod>["mount"]["startOidcServer"]>>;
  clientId: string;
  userId: string;
  cookie: string;
}

/**
 * A user signed in through the engine, and a confidential client linked to the
 * provider's resource. The sign-in goes through `auth.api.signUpEmail` rather
 * than an INSERT because the session cookie is signed — and because the
 * handoff it exercises (the engine issues the session, the provider reads it)
 * is the one /auth/v1 was rebuilt around in phase 1.
 */
async function startFlow(m: NonNullable<typeof mod>): Promise<Flow> {
  // Before the client seed: the plugin seeds trexdb."oauthResource" from its
  // `resources` option during init, and the seeder links the client to whatever
  // rows it finds. Seeded first, the client is linked to nothing and
  // /oauth2/authorize answers invalid_target.
  const server = await m.mount.startOidcServer();

  const suffix = crypto.randomUUID().slice(0, 8);
  const clientId = `soft-delete-${suffix}`;
  await m.seed.upsertOAuthClient({
    clientId,
    clientSecret: CLIENT_SECRET,
    name: "soft delete suite",
    redirectUris: [REDIRECT_URI],
    postLogoutRedirectUris: [],
    clientRoles: [],
    allowedScopes: ["openid", "profile", "email", "offline_access"],
    // The seeder links the client to exactly this resource rather than to
    // whatever rows exist, and the mount's issuer is what the plugin seeded.
    resourceIdentifier: server.issuer,
  });

  const signedUp = await m.auth.api.signUpEmail({
    body: {
      email: `soft-delete-${suffix}@example.test`,
      password: "correct horse battery staple",
      name: "Soft Delete Suite",
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

/** Runs /oauth2/authorize and returns the code it redirected with, if any. */
async function authorize(flow: Flow): Promise<{ status: number; code: string | null; verifier: string }> {
  const { verifier, challenge } = await pkce();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: flow.clientId,
    redirect_uri: REDIRECT_URI,
    // offline_access is the plugin's gate on issuing a refresh token at all.
    scope: "openid profile email offline_access",
    state: "state-value",
    code_challenge: challenge,
    code_challenge_method: "S256",
    // The RFC 8707 resource identifier, which is what makes the access token a
    // signed JWT rather than an opaque string.
    resource: flow.server.issuer,
  });
  const res = await fetch(`${flow.server.url}/oauth2/authorize?${query}`, {
    headers: { cookie: flow.cookie },
    redirect: "manual",
  });
  await res.body?.cancel();
  const location = res.headers.get("location");
  const code = location?.startsWith(REDIRECT_URI)
    ? new URL(location).searchParams.get("code")
    : null;
  return { status: res.status, code, verifier };
}

async function postToken(flow: Flow, body: Record<string, string>) {
  const res = await fetch(`${flow.server.url}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: flow.clientId,
      client_secret: CLIENT_SECRET,
      ...body,
    }),
  });
  return { status: res.status, body: await res.json() as Record<string, string> };
}

function test(name: string, fn: (m: NonNullable<typeof mod>) => Promise<void>) {
  Deno.test({
    name,
    ignore: !mod,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(mod!),
  });
}

test("a soft-deleted user gets no token from any of the three paths", async (m) => {
  const flow = await startFlow(m);
  try {
    // ── While the account is live, every path works ────────────────────────
    const first = await authorize(flow);
    assertEquals(first.status, 302);
    assertNotEquals(first.code, null);

    const issued = await postToken(flow, {
      grant_type: "authorization_code",
      code: first.code!,
      redirect_uri: REDIRECT_URI,
      code_verifier: first.verifier,
      resource: flow.server.issuer,
    });
    assertEquals(issued.status, 200);
    assertNotEquals(issued.body.id_token, undefined);
    const accessToken = issued.body.access_token;
    const refreshToken = issued.body.refresh_token;
    assertNotEquals(refreshToken, undefined);

    const liveUserInfo = await fetch(`${flow.server.url}/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assertEquals(liveUserInfo.status, 200);
    assertEquals((await liveUserInfo.json()).sub, flow.userId);

    // A code held back, so the exchange can be attempted AFTER the deletion.
    // This is the path the plugin reaches at introspect-njKASm3q.mjs:2017 and
    // the one a browser mid-flow would take.
    const held = await authorize(flow);
    assertNotEquals(held.code, null);

    // ── The account is retired ─────────────────────────────────────────────
    // V1's own function, because that is what actually retires an account here:
    // nothing in this codebase calls it, d2e does, so trex cannot hang the
    // revocation off a call site it owns.
    await m.db.pool.query(`SELECT trexdb.soft_delete_user($1)`, [flow.userId]);

    // 1. The code exchange.
    const afterCode = await postToken(flow, {
      grant_type: "authorization_code",
      code: held.code!,
      redirect_uri: REDIRECT_URI,
      code_verifier: held.verifier,
      resource: flow.server.issuer,
    });
    assertNotEquals(afterCode.status, 200, "the code exchange still issued a token");
    assertEquals(afterCode.body.access_token, undefined);
    assertEquals(afterCode.body.id_token, undefined);

    // 2. The refresh grant, on a token issued before the deletion — the case
    //    ending the engine's sessions cannot reach.
    const afterRefresh = await postToken(flow, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      resource: flow.server.issuer,
    });
    assertNotEquals(afterRefresh.status, 200, "the refresh grant still issued a token");
    assertEquals(afterRefresh.body.access_token, undefined);
    assertEquals(afterRefresh.body.id_token, undefined);

    // 3. /userinfo, on an access token that has not expired.
    const afterUserInfo = await fetch(`${flow.server.url}/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    assertNotEquals(afterUserInfo.status, 200, "/userinfo still described the user");
    await afterUserInfo.body?.cancel();
  } finally {
    await endFlow(m, flow);
  }
});

test("a soft-deleted user's session no longer authorizes at all", async (m) => {
  // The fourth door, and the reason the guard covers findSession as well:
  // /oauth2/authorize authenticates on the engine session and never reads the
  // user by id, so without it a retired account still walks away with an
  // authorization code — one that would only fail later, at the exchange.
  const flow = await startFlow(m);
  try {
    assertNotEquals((await authorize(flow)).code, null);
    await m.db.pool.query(`SELECT trexdb.soft_delete_user($1)`, [flow.userId]);
    const after = await authorize(flow);
    assertEquals(after.code, null, "/oauth2/authorize still issued a code");
  } finally {
    await endFlow(m, flow);
  }
});

test("the guard is what refuses, and it refuses at the engine's own lookup", async (m) => {
  // The three refusals above are behavioural; this pins where they come from,
  // so a future change that moves the predicate somewhere else has to say so.
  const flow = await startFlow(m);
  try {
    const ctx = await m.auth.$context;
    assertNotEquals(await ctx.internalAdapter.findUserById(flow.userId), null);
    await m.db.pool.query(`SELECT trexdb.soft_delete_user($1)`, [flow.userId]);
    assertEquals(await ctx.internalAdapter.findUserById(flow.userId), null);
  } finally {
    await endFlow(m, flow);
  }
});
