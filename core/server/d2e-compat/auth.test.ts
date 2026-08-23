import { assertEquals } from "jsr:@std/assert";
import { exportJWK, generateKeyPair, SignJWT } from "npm:jose";
import { verifyIdpToken } from "./auth.ts";

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
  opts: { iss?: string; aud?: string } = {},
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
