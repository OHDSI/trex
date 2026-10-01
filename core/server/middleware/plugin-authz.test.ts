import { assertEquals } from "jsr:@std/assert";
import { encodeBase64 } from "jsr:@std/encoding/base64";
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

/** A regular (non-service) user token. `userMgmtGroups` is what old main put on
 *  the token so authz could skip the usermgmt round trip. */
function userToken(groups: Record<string, unknown> | undefined): Promise<string> {
  const claims: Record<string, unknown> = { roles: ["role.researcher"] };
  if (groups) claims.userMgmtGroups = groups;
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject("user-1")
    .setIssuedAt()
    .setExpirationTime("5m")
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .sign(privateKey);
}

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

async function run(
  token: string,
  url: string,
  method = "GET",
  extra: { headers?: Record<string, string>; body?: unknown } = {},
) {
  const path = url.split("?")[0];
  const req: any = {
    path,
    originalUrl: url,
    method,
    headers: { authorization: `Bearer ${token}`, ...extra.headers },
  };
  if (extra.body !== undefined) {
    req.body = extra.body;
    req._body = true;
  }
  let status = 0;
  let nexted = false;
  let error: unknown;
  const res: any = {
    status(code: number) {
      status = code;
      return res;
    },
    json(payload: any) {
      error = payload?.error;
    },
    send() {},
  };
  await d2eAuthn(req, res, () => {
    nexted = true;
  });
  return { status, nexted, error };
}

async function mriquery(obj: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(obj)]).stream()
    .pipeThrough(new CompressionStream("deflate"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return encodeURIComponent(encodeBase64(bytes));
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

    // Regression: every step above uses a service token, which returns before
    // the role-resolution block. A user token is the only shape that reaches it,
    // so a variable dropped there went unnoticed until it threw at runtime
    // (ReferenceError: tokenGroups is not defined) and took d2eAuthn down.
    await t.step("resolves a user token's roles from userMgmtGroups on the token", async () => {
      REQUIRED_URL_SCOPES.push({
        path: "^/system-portal/dataset/list",
        scopes: ["portal.dataset.read"],
        httpMethods: ["GET"],
      });
      // Deliberately NOT a system admin: that shape returns on the admin bypass
      // before the role-resolution block this is here to cover.
      registerPluginRoles({ ALP_DASHBOARD_VIEWER: ["portal.dataset.read"] });
      const { status, nexted } = await run(
        await userToken({ alp_role_dashboard_viewer: true }),
        "/system-portal/dataset/list",
      );
      assertEquals(nexted, true);
      assertEquals(status, 0);
    });

    await t.step("denies a user token whose groups carry no matching role", async () => {
      const { status, nexted } = await run(
        await userToken({ alp_role_etl_mapping_contributor: true }),
        "/system-portal/dataset/list",
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

    await t.step("per-dataset researcher access", async (t) => {
      registerPluginRoles({ RESEARCHER: ["PA.svc", "portal.notebook.read"] });
      REQUIRED_URL_SCOPES.push(
        { path: "^/analytics-svc/pa/services", scopes: ["PA.svc"] },
        { path: "^/system-portal/notebook", scopes: ["portal.notebook.read"] },
        { path: "^/jobplugins/test", scopes: ["PA.svc"], datasetId: "dsid" },
      );
      const researcherX = await userToken({ alp_role_study_researcher: ["X"] });
      const denied = (r: { status: number; nexted: boolean; error: unknown }) => {
        assertEquals(r.nexted, false);
        assertEquals(r.status, 403);
        assertEquals(r.error, "Unauthorized access to dataset");
      };

      await t.step("denies another dataset in the query", async () => {
        denied(await run(researcherX, "/analytics-svc/pa/services/x?datasetId=Y"));
      });

      await t.step("denies when any repeated query value is another dataset", async () => {
        denied(await run(researcherX, "/analytics-svc/pa/services/x?datasetId=X&datasetId=Y"));
      });

      await t.step("denies another dataset inside mriquery", async () => {
        const q = await mriquery({ datasetId: "Y" });
        denied(await run(researcherX, `/analytics-svc/pa/services/x?mriquery=${q}`));
      });

      await t.step("denies another dataset in a JSON path segment", async () => {
        denied(await run(
          researcherX,
          "/analytics-svc/pa/services/cohort/SYNTAX/%7B%22datasetId%22%3A%22Y%22%7D",
        ));
      });

      await t.step("denies another dataset in a parsed JSON body", async () => {
        denied(await run(researcherX, "/analytics-svc/pa/services/x", "POST", {
          headers: { "content-type": "application/json" },
          body: { datasetId: "Y" },
        }));
      });

      await t.step("denies another dataset in the header", async () => {
        denied(await run(researcherX, "/analytics-svc/pa/services/x", "GET", {
          headers: { datasetid: "Y" },
        }));
      });

      await t.step("allows the researcher's own dataset", async () => {
        const q = await mriquery({ datasetId: "X" });
        const r = await run(researcherX, `/analytics-svc/pa/services/x?datasetId=X&mriquery=${q}`);
        assertEquals(r.nexted, true);
        assertEquals(r.status, 0);
      });

      await t.step("allows a researcher route that names no dataset", async () => {
        const r = await run(researcherX, "/system-portal/notebook/list");
        assertEquals(r.nexted, true);
        assertEquals(r.status, 0);
      });

      await t.step("requires a dataset id where the policy declares one", async () => {
        const r = await run(researcherX, "/jobplugins/test/run");
        assertEquals(r.nexted, false);
        assertEquals(r.status, 403);
        assertEquals(r.error, "Dataset id is missing in the request");
        const ok = await run(researcherX, "/jobplugins/test/run?dsid=X");
        assertEquals(ok.nexted, true);
      });

      await t.step("lets a system admin reach any dataset", async () => {
        const admin = await userToken({ alp_role_system_admin: true });
        const r = await run(admin, "/analytics-svc/pa/services/x?datasetId=Y");
        assertEquals(r.nexted, true);
        assertEquals(r.status, 0);
      });

      await t.step("skips the check when a non-researcher role grants the scopes", async () => {
        registerPluginRoles({ TENANT_VIEWER: ["PA.svc"] });
        const r = await run(
          await userToken({ alp_role_study_researcher: ["X"], alp_role_tenant_viewer: ["t1"] }),
          "/analytics-svc/pa/services/x?datasetId=Y",
        );
        assertEquals(r.nexted, true);
      });
    });
  } finally {
    await server.shutdown();
  }
});
