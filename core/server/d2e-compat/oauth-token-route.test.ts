// Drives the real POST /oauth/token handler against a fake IdP, because the
// request parsing (urlencoded vs raw body, repeated keys) is where a lent
// secret can leak — applyClientAuthentication alone never sees it.
import { assertEquals } from "jsr:@std/assert";
import express from "express";
import { decodeBasicCredentials } from "better-auth/oauth2";
import { mountD2eRoutes } from "./routes.ts";

type Seen = { authorization: string | null; body: string };

async function withRoute(fn: (url: string, seen: Seen[]) => Promise<void>) {
  const seen: Seen[] = [];
  const idp = Deno.serve({ port: 0, hostname: "127.0.0.1", onListen() {} }, async (req) => {
    seen.push({ authorization: req.headers.get("authorization"), body: await req.text() });
    return Response.json({ access_token: "t" });
  });
  const env = {
    D2E_IDP: "trex",
    TREX_OIDC_ISSUER: "https://localhost:8443",
    TREX_OIDC_INTERNAL_BASE: `http://127.0.0.1:${idp.addr.port}`,
    TREX_OIDC_CLIENT_ID: "d2e-webapi",
    TREX_OIDC_CLIENT_SECRET: "S3cr3t",
  };
  const before = Object.fromEntries(Object.keys(env).map((k) => [k, Deno.env.get(k)]));
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
  const app = express();
  mountD2eRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${(server.address() as { port: number }).port}/oauth/token`, seen);
  } finally {
    await new Promise((r) => server.close(r));
    await idp.shutdown();
    for (const [k, v] of Object.entries(before)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
  }
}

for (const contentType of ["text/plain", "application/x-www-form-urlencoded"]) {
  Deno.test(`a repeated grant_type is refused before any secret is lent (${contentType})`, async () => {
    await withRoute(async (url, seen) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: "grant_type=refresh_token&grant_type=client_credentials",
      });
      assertEquals(res.status, 400);
      assertEquals((await res.json()).error, "invalid_request");
      assertEquals(seen.length, 0);
    });
  });
}

Deno.test("a refresh is forwarded with the configured client's Basic credentials", async () => {
  await withRoute(async (url, seen) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=rt",
    });
    assertEquals(res.status, 200);
    await res.body?.cancel();
    assertEquals(seen.length, 1);
    assertEquals(decodeBasicCredentials(seen[0].authorization!).clientId, "d2e-webapi");
  });
});

Deno.test("a repeated resource is forwarded (RFC 8707 allows several)", async () => {
  await withRoute(async (url, seen) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=rt&resource=https%3A%2F%2Fa&resource=https%3A%2F%2Fb",
    });
    assertEquals(res.status, 200);
    await res.body?.cancel();
    assertEquals(new URLSearchParams(seen[0].body).getAll("resource"), ["https://a", "https://b"]);
  });
});
