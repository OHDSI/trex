// The availability fix, end to end, against the real mount on a real listener.
//
// §7 of CUTOVER-REHEARSAL.md: 594 requests with an invalid bearer closed
// /oauth2/userinfo in 2.4 seconds, and a real WebAPI sign-in then failed with
// `[invalid_user_info_response] … 429` — because one WebAPI sign-in makes an
// authenticated /oauth2/userinfo call (§6) and both landed in the same bucket.
// What must be true now is that a flood of REFUSALS from one caller leaves the
// endpoint answering a caller with a real token.
//
// Driven through Express with a real access token, because neither half is
// observable otherwise: the budget lives in the mount, and "a real sign-in is
// unaffected" cannot be asserted without a real sign-in.
import { assertEquals, assertNotEquals, assertStringIncludes } from "jsr:@std/assert";
import { encodeBasicCredentials } from "better-auth/oauth2";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

async function load() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  // Small enough to exhaust in a test without 600 round trips, and read by the
  // mount lazily so setting it here is enough.
  Deno.env.set("TREX_OIDC_USERINFO_FAILURE_MAX", "5");
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

const REDIRECT_URI = "https://rp.test/userinfo-limit/cb";
const CLIENT_SECRET = "userinfo-limit-secret";
const base64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");

async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** A whole sign-in, so the 200 below is a real one and not a fixture. */
async function accessToken(m: NonNullable<typeof mod>, server: { url: string; issuer: string }, clientId: string, cookie: string) {
  const { verifier, challenge } = await pkce();
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email",
    state: "s",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: server.issuer,
  });
  const authorized = await fetch(`${server.url}/oauth2/authorize?${query}`, {
    headers: { cookie },
    redirect: "manual",
  });
  await authorized.body?.cancel();
  const code = new URL(authorized.headers.get("location")!).searchParams.get("code");
  assertNotEquals(code, null, `no code: ${authorized.headers.get("location")}`);
  const token = await fetch(`${server.url}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: encodeBasicCredentials(clientId, CLIENT_SECRET),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code: code!,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
      resource: server.issuer,
    }),
  });
  const body = await token.json() as Record<string, string>;
  assertEquals(token.status, 200, JSON.stringify(body));
  return body.access_token;
}

Deno.test({
  name: "a flood of failed userinfo calls cannot deny the endpoint to a real sign-in",
  ignore: !mod,
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const m = mod!;
    m.mount._resetUserInfoBudget();
    const server = await m.mount.startOidcServer();
    const suffix = crypto.randomUUID().slice(0, 8);
    const clientId = `userinfo-limit-${suffix}`;
    await m.seed.upsertOAuthClient({
      clientId,
      clientSecret: CLIENT_SECRET,
      name: "userinfo limit suite",
      redirectUris: [REDIRECT_URI],
      postLogoutRedirectUris: [],
      clientRoles: [],
      allowedScopes: ["openid", "profile", "email", "offline_access"],
      resourceIdentifier: server.issuer,
    });
    const signedUp = await m.auth.api.signUpEmail({
      body: {
        email: `userinfo-limit-${suffix}@example.test`,
        password: "correct horse battery staple",
        name: "UserInfo Limit",
      },
      returnHeaders: true,
    });
    const cookie = signedUp.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");

    try {
      // The real sign-in's token, taken BEFORE the flood so the flood cannot be
      // said to have prevented it.
      const good = await accessToken(m, server, clientId, cookie);

      // The attack, as measured: an invalid bearer, from one caller. The budget
      // is 5, so the 6th must be refused — and refused by trex, ahead of Better
      // Auth, which is what keeps Better Auth's own counter free.
      const attack = () =>
        fetch(`${server.url}/oauth2/userinfo`, {
          headers: { authorization: "Bearer not-a-real-token", "x-forwarded-for": "203.0.113.7:51000" },
        });
      for (let i = 1; i <= 5; i++) {
        const r = await attack();
        await r.body?.cancel();
        assertEquals(r.status, 401, `refusal ${i} should come from the provider, not the budget`);
      }
      const throttled = await attack();
      const throttledBody = await throttled.json() as Record<string, string>;
      assertEquals(throttled.status, 429, JSON.stringify(throttledBody));
      assertEquals(throttledBody.error, "invalid_request");
      assertStringIncludes(throttledBody.error_description ?? "", "failed userinfo requests");
      assertNotEquals(throttled.headers.get("retry-after"), null, "no Retry-After");

      // More of the same stays refused — the attacker is not forgiven by being
      // refused.
      for (let i = 0; i < 20; i++) {
        const r = await attack();
        await r.body?.cancel();
        assertEquals(r.status, 429);
      }

      // THE POINT. A different caller, with a real token, is answered — where
      // before this fix the whole installation was locked out for 15 minutes.
      const real = await fetch(`${server.url}/oauth2/userinfo`, {
        headers: { authorization: `Bearer ${good}`, "x-forwarded-for": "198.51.100.4:44000" },
      });
      const claims = await real.json() as Record<string, unknown>;
      assertEquals(real.status, 200, JSON.stringify(claims));
      assertEquals(typeof claims.sub, "string");

      // And the attacker's OWN valid traffic is refused too, because the budget
      // is per caller: this is a per-client throttle, not a per-token one.
      const sameIp = await fetch(`${server.url}/oauth2/userinfo`, {
        headers: { authorization: `Bearer ${good}`, "x-forwarded-for": "203.0.113.7:51000" },
      });
      await sameIp.body?.cancel();
      assertEquals(sameIp.status, 429);
    } finally {
      await m.db.pool.query(`DELETE FROM trexdb."oauthClient" WHERE "clientId" = $1`, [clientId]);
      await m.db.pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [signedUp.response.user.id]);
      await server.close();
      m.mount._resetUserInfoBudget();
    }
  },
});
