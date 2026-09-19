// Every path that revokes a trex credential must also revoke the OIDC session
// established with it.
//
// The hand-written provider got this for free: its refresh tokens lived in
// trexdb.refresh_token, and the deleted router.ts:94-102 said so — "a token
// issued here is revoked by the same paths that revoke a password-change or a
// deletion". @better-auth/oauth-provider keeps its own tables, so the cutover
// silently unhooked all of them, and mount.ts's guard cannot substitute: it
// reads the user ROW, and a password change leaves that row saying the account
// is fine.
//
// So this drives real HTTP against both mounts on one origin: the whole OIDC
// flow to get a refresh token, then trex's own endpoint, then the refresh grant
// again. Each case shows the grant working first, so the refusal afterwards is
// attributable to the endpoint under test and not to a flow that never worked.
//
// Gated on DATABASE_URL like the other auth suites.
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import express from "express";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived signing key is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

async function load() {
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  const keys = await import("../keys.ts");
  keys._resetRootKeyCache();
  const jwt = await import("../jwt.ts");
  jwt._resetJwtSecretCache();
  return {
    mount: await import("./mount.ts"),
    seed: await import("./seed-client.ts"),
    jwt,
    router: (await import("../auth-router.ts")).authRouter,
    db: await import("../../db.ts"),
    auth: (await import("../better-auth.ts")).auth,
  };
}

const mod = DATABASE_URL ? await load() : null;

const REDIRECT_URI = "https://rp.test/revocation/cb";
const CLIENT_SECRET = "revocation-suite-secret";
const PASSWORD = "correct horse battery staple";

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

const cookieHeader = (setCookies: string[]) => setCookies.map((c) => c.split(";")[0]).join("; ");

interface Flow {
  close(): Promise<void>;
  /** The OIDC mount's public prefix. */
  oidc: string;
  /** trex's own /auth/v1 prefix, on the SAME origin, so one cookie jar serves both. */
  authV1: string;
  issuer: string;
  clientId: string;
  userId: string;
  email: string;
  cookie: string;
  /** A trex access token for this user, which is what /auth/v1 authenticates on. */
  bearer: string;
  /** trex's own session id, carried in that token. Not the engine session's. */
  trexSessionId: string;
}

/**
 * Both mounts on one listener. The OIDC provider reads Better Auth's session
 * cookie and /auth/v1 reads a Bearer; a single origin is what lets one logout
 * request present both the way a browser would.
 */
async function startFlow(m: NonNullable<typeof mod>, opts: { admin?: boolean } = {}): Promise<Flow> {
  const app = express();
  // Before the client seed: the plugin seeds trexdb."oauthResource" during init.
  await m.mount.mountOidcProvider(app);
  app.use("/trex/auth/v1", m.router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as { port: number };
  const origin = `http://127.0.0.1:${port}`;
  const { oidcIssuer } = await import("./config.ts");
  const issuer = oidcIssuer();

  const suffix = crypto.randomUUID().slice(0, 8);
  const clientId = `revocation-${suffix}`;
  await m.seed.upsertOAuthClient({
    clientId,
    clientSecret: CLIENT_SECRET,
    name: "revocation suite",
    redirectUris: [REDIRECT_URI],
    postLogoutRedirectUris: [],
    clientRoles: [],
    allowedScopes: ["openid", "profile", "email", "offline_access"],
    resourceIdentifier: issuer,
  });

  const email = `revocation-${suffix}@example.test`;
  const signedUp = await m.auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "Revocation Suite" },
    returnHeaders: true,
  });
  const userId = signedUp.response.user.id;

  // The password has to be where trex's own routes look for it as well as where
  // the engine wrote it: /change-password reads storedPasswordHash.
  if (opts.admin) {
    await m.db.pool.query(
      `UPDATE trexdb."user" SET app_metadata = '{"trex_role":"admin"}'::jsonb WHERE id = $1`,
      [userId],
    );
  }

  const trexSessionId = crypto.randomUUID();
  const bearer = await m.jwt.signAccessToken(
    {
      id: userId,
      email,
      role: "authenticated",
      app_metadata: opts.admin ? { trex_role: "admin" } : {},
    },
    trexSessionId,
  );

  return {
    close: () => new Promise<void>((r) => server.close(() => r())),
    oidc: `${origin}/trex/oidc`,
    authV1: `${origin}/trex/auth/v1`,
    issuer,
    clientId,
    userId,
    email,
    cookie: cookieHeader(signedUp.headers.getSetCookie()),
    bearer,
    trexSessionId,
  };
}

async function endFlow(m: NonNullable<typeof mod>, flow: Flow) {
  await m.db.pool.query(`DELETE FROM trexdb."oauthClient" WHERE "clientId" = $1`, [flow.clientId]);
  await m.db.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [flow.userId]);
  await flow.close();
}

/** Runs the whole authorization_code flow and returns the refresh token. */
async function establishOidcSession(flow: Flow): Promise<string> {
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
    resource: flow.issuer,
  });
  const authorized = await fetch(`${flow.oidc}/oauth2/authorize?${query}`, {
    headers: { cookie: flow.cookie },
    redirect: "manual",
  });
  await authorized.body?.cancel();
  const location = authorized.headers.get("location");
  const code = location?.startsWith(REDIRECT_URI)
    ? new URL(location).searchParams.get("code")
    : null;
  assertNotEquals(code, null, "no authorization code");

  const issued = await postToken(flow, {
    grant_type: "authorization_code",
    code: code!,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    resource: flow.issuer,
  });
  assertEquals(issued.status, 200);
  assertNotEquals(issued.body.refresh_token, undefined, "no refresh token");
  return issued.body.refresh_token;
}

async function postToken(flow: Flow, body: Record<string, string>) {
  const res = await fetch(`${flow.oidc}/oauth2/token`, {
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

/**
 * The measurement that matters: does the OIDC session still renew itself?
 *
 * Returns the NEXT refresh token as well as the answer, because the plugin
 * rotates: a successful refresh revokes the token it was given. A second check
 * that reused the first one would read "revoked by rotation" as "revoked by the
 * endpoint under test" and pass whatever the endpoint did — which is how the
 * first draft of this suite fooled itself.
 */
async function refresh(
  flow: Flow,
  refreshToken: string,
): Promise<{ ok: boolean; next: string }> {
  const res = await postToken(flow, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    resource: flow.issuer,
  });
  const ok = res.status === 200 && typeof res.body.access_token === "string";
  return { ok, next: ok ? res.body.refresh_token ?? refreshToken : refreshToken };
}

function test(name: string, fn: (m: NonNullable<typeof mod>) => Promise<void>) {
  Deno.test({ name, ignore: !mod, sanitizeOps: false, sanitizeResources: false, fn: () => fn(mod!) });
}

// ── The four paths that revoke ──────────────────────────────────────────────

test("POST /change-password ends the OIDC session too", async (m) => {
  const flow = await startFlow(m);
  try {
    let token = await establishOidcSession(flow);
    const live = await refresh(flow, token);
    assertEquals(live.ok, true, "the flow never worked");
    token = live.next;

    const res = await fetch(`${flow.authV1}/change-password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${flow.bearer}` },
      body: JSON.stringify({ currentPassword: PASSWORD, newPassword: "a whole new passphrase" }),
    });
    await res.body?.cancel();
    assertEquals(res.status, 200);

    assertEquals(
      (await refresh(flow, token)).ok,
      false,
      "the OIDC session outlived the password it was established with",
    );
  } finally {
    await endFlow(m, flow);
  }
});

test("PUT /user with a new password ends the OIDC session too", async (m) => {
  const flow = await startFlow(m);
  try {
    let token = await establishOidcSession(flow);
    const live = await refresh(flow, token);
    assertEquals(live.ok, true, "the flow never worked");
    token = live.next;

    const res = await fetch(`${flow.authV1}/user`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${flow.bearer}` },
      body: JSON.stringify({ password: "a whole new passphrase" }),
    });
    await res.body?.cancel();
    assertEquals(res.status, 200);

    assertEquals((await refresh(flow, token)).ok, false);
  } finally {
    await endFlow(m, flow);
  }
});

test("PUT /admin/users/:id ends the OIDC session on a reset and on a ban", async (m) => {
  for (const body of [{ password: "an administrator's choice" }, { banned: true }]) {
    const flow = await startFlow(m, { admin: true });
    try {
      let token = await establishOidcSession(flow);
      const live = await refresh(flow, token);
      assertEquals(live.ok, true, "the flow never worked");
      token = live.next;

      const res = await fetch(`${flow.authV1}/admin/users/${flow.userId}`, {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${flow.bearer}` },
        body: JSON.stringify(body),
      });
      await res.body?.cancel();
      assertEquals(res.status, 200, JSON.stringify(body));

      assertEquals((await refresh(flow, token)).ok, false, JSON.stringify(body));
    } finally {
      await endFlow(m, flow);
    }
  }
});

test("POST /logout ends the OIDC session issued off the session it ends", async (m) => {
  const flow = await startFlow(m);
  try {
    let token = await establishOidcSession(flow);
    const live = await refresh(flow, token);
    assertEquals(live.ok, true, "the flow never worked");
    token = live.next;

    // Both credentials, the way a browser presents them: the engine cookie
    // names the session to end, the Bearer names trex's own.
    const res = await fetch(`${flow.authV1}/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${flow.bearer}`, cookie: flow.cookie },
    });
    await res.body?.cancel();
    assertEquals(res.status, 204);

    assertEquals(
      (await refresh(flow, token)).ok,
      false,
      "logging out left the OIDC session renewing itself",
    );
  } finally {
    await endFlow(m, flow);
  }
});

test("logout is scoped to the session it was given, not to the account", async (m) => {
  // The narrowness is the point: revoking by user would sign the caller out of
  // every device to honour a request to sign out of one. Two engine sessions,
  // two OIDC sessions, one logout.
  const flow = await startFlow(m);
  try {
    const first = await establishOidcSession(flow);

    const second = await m.auth.api.signInEmail({
      body: { email: flow.email, password: PASSWORD },
      returnHeaders: true,
    });
    const otherFlow = { ...flow, cookie: cookieHeader(second.headers.getSetCookie()) };
    const other = await establishOidcSession(otherFlow);

    const res = await fetch(`${flow.authV1}/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${flow.bearer}`, cookie: flow.cookie },
    });
    await res.body?.cancel();

    assertEquals((await refresh(flow, first)).ok, false, "the named session survived");
    assertEquals((await refresh(flow, other)).ok, true, "the other session was taken too");
  } finally {
    await endFlow(m, flow);
  }
});

// ── The two paths that deliberately do not ──────────────────────────────────

test("rotating a trex refresh token leaves the OIDC session alone", async (m) => {
  // POST /token's rotation revokes the single token it was handed, which is
  // renewal rather than revocation. Reaching into the OIDC tables here would
  // end the SSO session every few minutes, for no security event at all.
  const flow = await startFlow(m);
  try {
    const oidcRefresh = await establishOidcSession(flow);

    const raw = crypto.randomUUID();
    await m.db.pool.query(
      `INSERT INTO trexdb.refresh_token (token_hash, "userId", session_id, revoked)
       VALUES ($1, $2, $3, false)`,
      [await m.jwt.hashRefreshToken(raw), flow.userId, flow.trexSessionId],
    );
    const rotated = await fetch(`${flow.authV1}/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: raw }),
    });
    await rotated.body?.cancel();
    assertEquals(rotated.status, 200);

    assertEquals((await refresh(flow, oidcRefresh)).ok, true);
  } finally {
    await endFlow(m, flow);
  }
});

test("POST /revoke-session cannot reach the OIDC session, and says so", async (m) => {
  // revokeOidcTokensForSession joins on the ENGINE session id.
  // trexdb.refresh_token.session_id is trex's own concept, and no column
  // anywhere ties the two together — so there is nothing to scope a revocation
  // to, and revoking by user would be wholesale. Pinned as a known gap rather
  // than left to be rediscovered: this is the one of the six that is not
  // covered, and a schema change that joined the two concepts should reopen it.
  const flow = await startFlow(m);
  try {
    let token = await establishOidcSession(flow);
    const res = await fetch(`${flow.authV1}/revoke-session`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${flow.bearer}` },
      body: JSON.stringify({ session_id: flow.trexSessionId }),
    });
    await res.body?.cancel();
    assertEquals(res.status, 200);

    assertEquals((await refresh(flow, token)).ok, true);

    // And nothing to build one on: the id trex's own session carries appears
    // nowhere in the provider's tables. If that ever stops holding, this gap
    // can be closed properly.
    const joinable = await m.db.pool.query(
      `SELECT 1 FROM trexdb."oauthRefreshToken"
        WHERE "userId" = $1 AND "sessionId" = $2 LIMIT 1`,
      [flow.userId, flow.trexSessionId],
    );
    assertEquals(joinable.rows.length, 0);
  } finally {
    await endFlow(m, flow);
  }
});
