import { assertEquals } from "jsr:@std/assert";
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "npm:jose";
import { idpVerifyOptions, verifyIdpToken } from "./auth.ts";
import { resolveIdpConfig } from "./idp.ts";

// A local JWKS server stands in for Logto. Tokens are signed with its private
// key, so the SIGNATURE is always valid — these tests isolate the claim checks
// (issuer / audience / algorithm), which are the security properties under test.
const PORT = 39187;
const ISSUER = `http://localhost:${PORT}/oidc`;
const AUDIENCE = "https://alp-default";

const { publicKey, privateKey } = await generateKeyPair("RS256", {
  extractable: true,
});
const jwk = await exportJWK(publicKey);
jwk.kid = "test-key";
jwk.alg = "RS256";
jwk.use = "sig";

async function sign(
  claims: Record<string, unknown>,
  opts: { iss?: string; aud?: string | string[] } = {},
): Promise<string> {
  const t = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m");
  t.setIssuer(opts.iss ?? ISSUER);
  t.setAudience(opts.aud ?? AUDIENCE);
  return await t.sign(privateKey);
}

Deno.test("verifyIdpToken claim validation", async (t) => {
  Deno.env.set("LOGTO__ISSUER", ISSUER);
  Deno.env.set("LOGTO__AUDIENCES", AUDIENCE);

  const server = Deno.serve(
    { port: PORT, onListen() {} },
    (req) => {
      if (new URL(req.url).pathname === "/oidc/jwks") {
        return Response.json({ keys: [jwk] });
      }
      return new Response("not found", { status: 404 });
    },
  );

  try {
    await t.step("accepts a token with correct issuer and audience", async () => {
      const token = await sign({ roles: ["role.researcher"] });
      const payload = await verifyIdpToken(token);
      assertEquals(payload?.sub, "user-1");
    });

    await t.step("rejects a token minted for a different issuer", async () => {
      // Same signing key, but iss is some other IdP. A correctly-scoped
      // verifier must reject it; the old code ignored iss and accepted it.
      const token = await sign({ roles: ["role.systemadmin"] }, {
        iss: "https://evil.example/oidc",
      });
      const payload = await verifyIdpToken(token);
      assertEquals(payload, null);
    });

    await t.step("rejects a token minted for a different audience/resource", async () => {
      // A valid token for a DIFFERENT API resource on the same Logto must not
      // be replayable against d2e's resource.
      const token = await sign({ roles: ["role.systemadmin"] }, {
        aud: "https://some-other-resource",
      });
      const payload = await verifyIdpToken(token);
      assertEquals(payload, null);
    });

    await t.step("rejects an alg:none unsigned token", async () => {
      const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const body = btoa(JSON.stringify({
        sub: "attacker",
        iss: ISSUER,
        aud: AUDIENCE,
        roles: ["role.systemadmin"],
        exp: Math.floor(Date.now() / 1000) + 300,
      })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      const token = `${header}.${body}.`;
      const payload = await verifyIdpToken(token);
      assertEquals(payload, null);
    });
  } finally {
    await server.shutdown();
  }
});

// ── The trex provider's two token shapes, verified through the options
// d2e-compat actually builds ────────────────────────────────────────────────
//
// @better-auth/oauth-provider puts the RFC 8707 resource identifier in the
// ACCESS token's `aud`, alongside `<issuer>/oauth2/userinfo` whenever `openid`
// was granted (dist/introspect-njKASm3q.mjs:519); the client id rides only as
// `client_id`/`azp`. The ID token's `aud` is still the client id. The portal
// presents the access token, scripts/lib/idp-login.cjs presents the id_token,
// so both have to verify.
//
// Verified against the key directly rather than through verifyIdpToken: that
// function caches its JWKS in a module-level singleton keyed on the first call,
// which would make a second IdP's run pass on the first IdP's key set and tell
// us nothing about the audience at all.
const TREX_ENV = {
  D2E_IDP: "trex",
  TREX_OIDC_ISSUER: "https://d2e.example:41100",
  TREX_OIDC_CLIENT_ID: "d2e-portal",
};
const TREX_ISSUER = resolveIdpConfig(TREX_ENV).issuer;

Deno.test("trex: an access token audienced at the resource and userinfo verifies", async () => {
  const token = await sign({ roles: ["role.researcher"] }, {
    iss: TREX_ISSUER,
    aud: [TREX_ISSUER, `${TREX_ISSUER}/oauth2/userinfo`],
  });
  const { payload } = await jwtVerify(token, publicKey, idpVerifyOptions(TREX_ENV));
  assertEquals(payload.sub, "user-1");
});

Deno.test("trex: an id_token audienced at the client id still verifies", async () => {
  const token = await sign({}, { iss: TREX_ISSUER, aud: "d2e-portal" });
  const { payload } = await jwtVerify(token, publicKey, idpVerifyOptions(TREX_ENV));
  assertEquals(payload.sub, "user-1");
});

Deno.test("trex: a token for another resource on the same issuer is refused", async () => {
  // The step that tells "the audience matched" apart from "the audience was
  // never checked": same signing key, same `iss`, an audience that is neither
  // the resource nor the client id.
  const token = await sign({ roles: ["role.systemadmin"] }, {
    iss: TREX_ISSUER,
    aud: ["https://some-other-resource", `${TREX_ISSUER}/oauth2/userinfo`],
  });
  let rejected = false;
  try {
    await jwtVerify(token, publicKey, idpVerifyOptions(TREX_ENV));
  } catch {
    rejected = true;
  }
  assertEquals(rejected, true);
});
