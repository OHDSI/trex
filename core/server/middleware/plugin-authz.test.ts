import { assertEquals } from "jsr:@std/assert";
import { exportJWK, generateKeyPair, SignJWT } from "npm:jose";
import { REQUIRED_URL_SCOPES, ROLE_SCOPES, SERVICE_CLIENT_ROLES, registerPluginRoles } from "../plugin/function.ts";
import { d2eAuthn } from "./plugin-authz.ts";

// Same local-JWKS setup as d2e-compat/auth.test.ts: tokens are really signed, so
// these tests isolate the authorization decision, not signature handling.
const PORT = 39188;
const ISSUER = `http://localhost:${PORT}/oidc`;
const AUDIENCE = "https://alp-default";
const DATA_CLIENT_ID = "m2m-data-client-id";

const { publicKey, privateKey } = await generateKeyPair("RS256", {
  extractable: true,
});
const jwk = await exportJWK(publicKey);
jwk.kid = "test-key";
jwk.alg = "RS256";
jwk.use = "sig";

function serviceToken(clientId: string): Promise<string> {
  return new SignJWT({ client_id: clientId })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject(clientId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(privateKey);
}

async function run(token: string, path: string, method = "GET") {
  const req: any = { path, method, headers: { authorization: `Bearer ${token}` } };
  let status = 0;
  let nexted = false;
  const res: any = {
    status(code: number) {
      status = code;
      return res;
    },
    json() {},
    send() {},
  };
  await d2eAuthn(req, res, () => {
    nexted = true;
  });
  return { status, nexted };
}

Deno.test("d2eAuthn client-credentials authorization", async (t) => {
  Deno.env.set("LOGTO__ISSUER", ISSUER);
  Deno.env.set("LOGTO__AUDIENCES", AUDIENCE);
  Deno.env.set("IDP__ALP_DATA_CLIENT_ID", DATA_CLIENT_ID);

  // As d2e's plugins/functions/package.json declares them: the M2M grant is keyed
  // on the env var NAME holding the client id, never the id itself.
  registerPluginRoles({
    IDP_ALP_DATA_CLIENT_ID: ["portal.supabaseStorage.read"],
  });
  REQUIRED_URL_SCOPES.push({
    path: "^/system-portal/supabase-storage/get/file",
    scopes: ["portal.supabaseStorage.read"],
    httpMethods: ["GET"],
  });

  const server = Deno.serve({ port: PORT, onListen() {} }, (req) => {
    if (new URL(req.url).pathname === "/oidc/jwks") {
      return Response.json({ keys: [jwk] });
    }
    return new Response("not found", { status: 404 });
  });

  try {
    await t.step("the declared role name stays the ROLE_SCOPES key", () => {
      assertEquals(ROLE_SCOPES["IDP_ALP_DATA_CLIENT_ID"], [
        "portal.supabaseStorage.read",
      ]);
      assertEquals(SERVICE_CLIENT_ROLES[DATA_CLIENT_ID], "IDP_ALP_DATA_CLIENT_ID");
    });

    await t.step("grants a service token whose sub is the configured client id", async () => {
      const { status, nexted } = await run(
        await serviceToken(DATA_CLIENT_ID),
        "/system-portal/supabase-storage/get/file",
      );
      assertEquals(nexted, true);
      assertEquals(status, 0);
    });

    await t.step("denies a service token from an unrelated client", async () => {
      const { status, nexted } = await run(
        await serviceToken("some-other-client"),
        "/system-portal/supabase-storage/get/file",
      );
      assertEquals(nexted, false);
      assertEquals(status, 403);
    });

    await t.step("denies the granted client on a route it has no scope for", async () => {
      REQUIRED_URL_SCOPES.push({
        path: "^/system-portal/supabase-storage/delete/file",
        scopes: ["portal.supabaseStorage.delete"],
        httpMethods: ["DELETE"],
      });
      const { status, nexted } = await run(
        await serviceToken(DATA_CLIENT_ID),
        "/system-portal/supabase-storage/delete/file",
        "DELETE",
      );
      assertEquals(nexted, false);
      assertEquals(status, 403);
    });
  } finally {
    await server.shutdown();
  }
});
