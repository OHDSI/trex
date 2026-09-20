// Each of these is a plugin default that differs from what trex served. Losing
// any one of them is silent: the sign-in still works and something else breaks
// hours later.
//
// Driven against the real mount on a real listener rather than through
// auth.handler(), because two of them — the resource default on
// client_credentials and the shape of a PKCE rejection — only exist once a
// request has been through Express and better-call's own validation.
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
      config: await import("./config.ts"),
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

const REDIRECT_URI = "https://rp.test/grants/cb";
const CLIENT_SECRET = "grants-suite-secret";
const CLIENT_ROLES = ["ALP_USER_ADMIN", "ALP_SYSTEM_ADMIN"];

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

const cookieHeader = (setCookies: string[]) => setCookies.map((c) => c.split(";")[0]).join("; ");

/** Header and payload of a signed JWT, without verifying it. */
function decodeJwt(token: string): { header: Record<string, unknown>; payload: Record<string, unknown> } {
  const parts = token.split(".");
  assertEquals(parts.length, 3, `not a JWT: ${token.slice(0, 24)}…`);
  const seg = (s: string) =>
    JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)),
    ));
  return { header: seg(parts[0]), payload: seg(parts[1]) };
}

interface Flow {
  server: Awaited<ReturnType<NonNullable<typeof mod>["mount"]["startOidcServer"]>>;
  clientId: string;
  userId: string;
  cookie: string;
}

async function startFlow(m: NonNullable<typeof mod>): Promise<Flow> {
  // Before the client seed: the plugin seeds trexdb."oauthResource" from its
  // `resources` option during init, and the seeder links the client to it.
  const server = await m.mount.startOidcServer();

  const suffix = crypto.randomUUID().slice(0, 8);
  const clientId = `grants-${suffix}`;
  await m.seed.upsertOAuthClient({
    clientId,
    clientSecret: CLIENT_SECRET,
    name: "grants suite",
    redirectUris: [REDIRECT_URI],
    postLogoutRedirectUris: [],
    clientRoles: CLIENT_ROLES,
    allowedScopes: ["openid", "profile", "email", "offline_access"],
    resourceIdentifier: server.issuer,
  });

  const signedUp = await m.auth.api.signUpEmail({
    body: {
      email: `grants-${suffix}@example.test`,
      password: "correct horse battery staple",
      name: "Grants Suite",
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

/** One /oauth2/authorize round trip. `extra` overrides or removes query params. */
async function authorize(
  flow: Flow,
  extra: Record<string, string | null> = {},
  scope = "openid profile email",
) {
  const { verifier, challenge } = await pkce();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: flow.clientId,
    redirect_uri: REDIRECT_URI,
    scope,
    state: "state-value",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: flow.server.issuer,
  });
  for (const [k, v] of Object.entries(extra)) {
    if (v === null) query.delete(k);
    else query.set(k, v);
  }
  const res = await fetch(`${flow.server.url}/oauth2/authorize?${query}`, {
    headers: { cookie: flow.cookie },
    redirect: "manual",
  });
  const text = await res.text();
  const location = res.headers.get("location");
  const params = location?.startsWith(REDIRECT_URI) ? new URL(location).searchParams : null;
  return {
    status: res.status,
    location,
    body: text,
    code: params?.get("code") ?? null,
    error: params?.get("error") ?? null,
    verifier,
  };
}

async function postToken(flow: Flow, body: Record<string, string>) {
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
      client_id: flow.clientId,
      ...body,
    }),
  });
  return { status: res.status, body: await res.json() as Record<string, string> };
}

/** Authorize and exchange in one step, for the cases that are about the token. */
async function exchange(flow: Flow, scope: string) {
  const authorized = await authorize(flow, {}, scope);
  assertNotEquals(authorized.code, null, `no code for scope "${scope}"`);
  return await postToken(flow, {
    grant_type: "authorization_code",
    code: authorized.code!,
    redirect_uri: REDIRECT_URI,
    code_verifier: authorized.verifier,
    resource: flow.server.issuer,
  });
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

// ── authorization_code + PKCE ───────────────────────────────────────────────

test("PKCE refuses plain, whatever verifier is offered", async (_m, flow) => {
  // Only S256 is accepted. The refusal comes from the query schema, which pins
  // code_challenge_method to z.enum(["S256"]) (dist/authorize-riRRCSbC.mjs:1048)
  // rather than from the handler's own check — but the plugin still turns it
  // into an OAuth error redirect, so a relying party sees invalid_request at
  // its callback rather than a bare 400. Measured, not assumed.
  const res = await authorize(flow, { code_challenge_method: "plain" });
  assertEquals(res.status, 302);
  assertEquals(res.error, "invalid_request");
  assertEquals(res.code, null);
  assertStringIncludes(res.location ?? "", "S256");
});

test("a challenge and a method are both required, or neither", async (_m, flow) => {
  const res = await authorize(flow, { code_challenge: null });
  assertEquals(res.code, null);
});

test("a confidential client may complete the flow without PKCE at all", async (_m, flow) => {
  // This is WebAPI's shape, exactly: Spring Security's authorize request is
  // `response_type, client_id, scope, state, redirect_uri, nonce` and carries
  // no code_challenge (CUTOVER-REHEARSAL.md §5a). The plugin's own default —
  // `client.requirePKCE ?? true` — refuses it with `pkce is required for this
  // client`, which made every WebAPI and Atlas sign-in impossible; the seeder
  // now registers a confidential client `requirePKCE: false`, which is the row
  // trex wrote before this phase.
  //
  // Asserted through to a TOKEN, not just to a code: the token endpoint runs
  // isPKCERequired a second time against the granted scopes
  // (dist/introspect-njKASm3q.mjs:1983-1990), so a code issued here could still
  // be unredeemable.
  const res = await authorize(flow, { code_challenge: null, code_challenge_method: null });
  assertEquals(res.error, null, res.location ?? res.body);
  assertNotEquals(res.code, null, res.location ?? res.body);

  const exchanged = await postToken(flow, {
    grant_type: "authorization_code",
    code: res.code!,
    redirect_uri: REDIRECT_URI,
    resource: flow.server.issuer,
  });
  assertEquals(exchanged.status, 200, JSON.stringify(exchanged.body));
});

test("a public client is still held to PKCE, whatever the column says", async (m, flow) => {
  // The half of the old behaviour that must NOT move with it. isPKCERequired
  // refuses a public client before it ever reads requirePKCE
  // (dist/utils-CWjOhEQb.mjs:836), and the seeder registers a client with no
  // secret as `tokenEndpointAuthMethod: "none"` — so relaxing the column for
  // confidential clients cannot relax it for public ones.
  const publicId = `${flow.clientId}-public`;
  await m.seed.upsertOAuthClient({
    clientId: publicId,
    clientSecret: undefined,
    name: "grants suite public",
    redirectUris: [REDIRECT_URI],
    postLogoutRedirectUris: [],
    clientRoles: [],
    allowedScopes: ["openid", "profile", "email", "offline_access"],
    resourceIdentifier: flow.server.issuer,
  });
  try {
    const res = await authorize(
      { ...flow, clientId: publicId },
      { code_challenge: null, code_challenge_method: null },
    );
    assertEquals(res.code, null);
    assertEquals(res.error, "invalid_request");
    assertStringIncludes(res.location ?? "", "pkce");
  } finally {
    await m.db.pool.query(`DELETE FROM trexdb."oauthClient" WHERE "clientId" = $1`, [publicId]);
  }
});

test("a code issued with a challenge needs the verifier that produced it", async (_m, flow) => {
  // Wrong, missing and empty are three ways to fail, and the plugin answers
  // all three with invalid_request rather than invalid_grant: it throws
  // UNAUTHORIZED/invalid_request for the mismatch and for the absence alike
  // (dist/introspect-njKASm3q.mjs:1997-2009). So the description is asserted
  // as well — without it this test would go on passing if a refusal moved to
  // a different branch, and the branch is the only thing that stops a stolen
  // code being redeemed by whoever intercepted it.
  for (
    const [verifier, description] of [
      ["not-the-verifier", "code verification failed"],
      // An empty verifier is not "no PKCE": it is a falsy one, so it lands on
      // the same branch as sending none at all.
      //
      // THIS IS THE TEST THAT CARRIES THE WHOLE ARGUMENT FOR requirePKCE:false.
      // The refusal now comes from the branch keyed on the STORED
      // code_challenge (:1996-2009) rather than from the requirePKCE column
      // (:1983-1990), because the column is false for this confidential client.
      // That is the point: the column decides whether a challenge is DEMANDED,
      // never whether a supplied one is HONOURED. A client that sends PKCE — the
      // d2e portal does — keeps its stolen-code protection in full, and these
      // two rows are what says so. If this message ever reverts to "PKCE is
      // required for this client", the column moved back and WebAPI cannot sign
      // in; if it becomes a 200, the protection is gone.
      ["", "code_verifier required because PKCE was used in authorization"],
      [null, "code_verifier required because PKCE was used in authorization"],
    ] as const
  ) {
    const authorized = await authorize(flow);
    assertNotEquals(authorized.code, null);
    const refused = await postToken(flow, {
      grant_type: "authorization_code",
      code: authorized.code!,
      redirect_uri: REDIRECT_URI,
      ...(verifier === null ? {} : { code_verifier: verifier }),
      resource: flow.server.issuer,
    });
    assertNotEquals(refused.status, 200, String(verifier));
    assertEquals(refused.body.error, "invalid_request", String(verifier));
    assertStringIncludes(refused.body.error_description ?? "", description);
  }
});

// ── refresh_token ───────────────────────────────────────────────────────────

test("a refresh token is issued only under offline_access", async (_m, flow) => {
  // trex issued one unconditionally. The plugin gates it on the granted scopes
  // (dist/introspect-njKASm3q.mjs:1799), and no relying party asks for
  // offline_access today — so without the scope every session would end at the
  // access token's expiry, hours after a sign-in that looked fine.
  const without = await exchange(flow, "openid profile email");
  assertEquals(without.status, 200);
  assertEquals("refresh_token" in without.body, false);

  const with_ = await exchange(flow, "openid profile email offline_access");
  assertEquals(with_.status, 200);
  assertEquals(typeof with_.body.refresh_token, "string");
});

test("refresh cannot widen the granted scopes", async (_m, flow) => {
  // trex re-derived the scopes on every refresh; the plugin refuses to grow
  // them, so the first request has to ask for everything the session will need.
  const first = await exchange(flow, "openid offline_access");
  assertEquals(typeof first.body.refresh_token, "string");
  const widened = await postToken(flow, {
    grant_type: "refresh_token",
    refresh_token: first.body.refresh_token,
    scope: "openid email offline_access",
    resource: flow.server.issuer,
  });
  assertNotEquals(widened.status, 200);
  assertEquals(widened.body.error, "invalid_scope");

  // The same scopes back is fine, which is what a silent renewal sends.
  const renewed = await postToken(flow, {
    grant_type: "refresh_token",
    refresh_token: first.body.refresh_token,
    resource: flow.server.issuer,
  });
  assertEquals(renewed.status, 200);
  assertEquals(typeof renewed.body.access_token, "string");
});

// ── client_credentials ──────────────────────────────────────────────────────

test("a client_credentials token names the client as its own subject", async (_m, flow) => {
  // Deliberately without `resource`: client_credentials has no authorize leg to
  // inherit one from, and without one the access token is opaque and NO custom
  // claim is reached. The before hook in oidc/hooks.ts is what makes this a JWT.
  const token = await postToken(flow, { grant_type: "client_credentials" });
  assertEquals(token.status, 200);

  const { header, payload } = decodeJwt(token.body.access_token);
  assertEquals(header.typ, "at+jwt");
  assertEquals(header.alg, "RS256");
  assertEquals(payload.sub, flow.clientId);
  assertEquals(payload.client_id, flow.clientId);
  assertEquals(payload.trex_role, "service");
  assertEquals(payload.app_metadata, { trex_role: "service" });
  // The regression this task exists to fix: the deleted router.ts emitted
  // `appRoles: client.clientRoles` here, so a service token authorizes as
  // itself.
  assertEquals(payload.roles, CLIENT_ROLES);
  assertEquals(payload.aud, flow.server.issuer);
  // No end user, so no id_token and no refresh token.
  assertEquals(token.body.id_token, undefined);
  assertEquals(token.body.refresh_token, undefined);
});

test("the service scope is the one a caller may name, and openid is not", async (_m, flow) => {
  // openid is on the plugin's USER_DELEGATED_SCOPES set, so it is refused on
  // this grant however it was granted (dist/introspect-njKASm3q.mjs:2077-2084)
  // — which is why the seeder writes trex:service instead. A client whose
  // client_credentials scope were `openid` could therefore be used only by
  // sending no scope at all.
  const named = await postToken(flow, {
    grant_type: "client_credentials",
    scope: mod!.config.SERVICE_SCOPE,
  });
  assertEquals(named.status, 200);
  assertEquals(decodeJwt(named.body.access_token).payload.scope, mod!.config.SERVICE_SCOPE);

  const delegated = await postToken(flow, { grant_type: "client_credentials", scope: "openid" });
  assertNotEquals(delegated.status, 200);
  assertEquals(delegated.body.error, "invalid_scope");
});

test("an explicit resource is honoured rather than overwritten", async (_m, flow) => {
  const token = await postToken(flow, {
    grant_type: "client_credentials",
    resource: flow.server.issuer,
  });
  assertEquals(token.status, 200);
  assertEquals(decodeJwt(token.body.access_token).payload.aud, flow.server.issuer);
});

test("client_credentials is refused when the client has no configured scopes", async (m, flow) => {
  // The plugin's way of spelling "this client may not use this grant". The
  // column is settable only through the admin endpoints, which oidc/mount.ts
  // 404s and provider.ts's clientPrivileges refuses, so the seeder is the only
  // writer — and an empty list is what a public client gets.
  await m.db.pool.query(
    `UPDATE trexdb."oauthClient" SET "clientCredentialsScopes" = '[]'::jsonb WHERE "clientId" = $1`,
    [flow.clientId],
  );
  const refused = await postToken(flow, { grant_type: "client_credentials" });
  assertNotEquals(refused.status, 200);
  assertEquals(refused.body.error, "unauthorized_client");
});

test("the resource default does not reach the other two grants", async (_m, flow) => {
  // The hook is keyed on grant_type, and an authorization_code exchange must
  // keep inheriting the resource the authorize leg bound to the code rather
  // than having one imposed on it.
  const issued = await exchange(flow, "openid profile email offline_access");
  assertEquals(issued.status, 200);
  const payload = decodeJwt(issued.body.access_token).payload;
  assertEquals(payload.sub, flow.userId);
  assertEquals(payload.trex_role, "user");
  // The audience the authorize leg asked for, plus the userinfo endpoint the
  // plugin adds for an openid request.
  assertEquals(payload.aud, [flow.server.issuer, `${flow.server.issuer}/oauth2/userinfo`]);
});

// ── RP-initiated logout ─────────────────────────────────────────────────────
// Not a grant, but it lives here because this is the suite with a live mount, a
// signed-in session and a seeded client, which is what the assertion needs.

test("the mount clears trex's own cookie on end-session, whatever the plugin answers", async (
  _m,
  flow,
) => {
  // The deleted router.ts cleared sb-access-token on its end-session route
  // (router.ts:448-457). The plugin cannot: the cookie is trex's, and
  // /auth/v1/logout — the only other place it is cleared — is not on this path.
  // Without this a browser that logs out through the relying party keeps a
  // bearer that same-origin iframes still read.
  //
  // The name says "whatever the plugin answers" because that is all this
  // asserts, and it is deliberate: mount.ts clears the cookie on the path
  // rather than on a successful logout, so the cookie goes even when the
  // provider refuses. It is also all it CAN assert here — this suite runs on an
  // ephemeral port, where the id_token_hint cannot be verified (its JWKS is
  // fetched from the issuer's origin) and the plugin answers 401. The logout
  // itself is covered by end-session.test.ts, which resolves that origin.
  const issued = await exchange(flow, "openid profile email");
  assertEquals(issued.status, 200);

  const query = new URLSearchParams({
    id_token_hint: issued.body.id_token,
    client_id: flow.clientId,
  });
  const res = await fetch(`${flow.server.url}/oauth2/end-session?${query}`, {
    headers: { cookie: flow.cookie },
    redirect: "manual",
  });
  await res.body?.cancel();
  const cleared = res.headers.getSetCookie().find((c) => c.startsWith("sb-access-token="));
  assertNotEquals(cleared, undefined, "end-session left sb-access-token in place");
  assertStringIncludes(cleared!, "sb-access-token=;");
  assertStringIncludes(cleared!, "Path=/");
});
