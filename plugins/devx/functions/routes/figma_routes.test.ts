// deno test --no-check --allow-all plugins/devx/functions/routes/figma_routes.test.ts
//
// Covers the Figma PAT routes. fetch is stubbed (the only outbound call is
// GET /v1/me for validation); sql is a recorder. Asserts: validation gate,
// encrypted upsert (never the raw token), status/logout shapes, and that no
// response ever echoes the token.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { getFigmaToken, handleFigmaRoutes } from "./figma_routes.ts";
import { decryptToken } from "../crypto.ts";

Deno.env.set("DEVX_ENCRYPTION_KEY", "a".repeat(64));
const CORS = { "content-type": "application/json" };
const USER = "00000000-0000-0000-0000-000000000001";

function req(method: string, body?: unknown): Request {
  return new Request("http://x/figma/x", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** sql recorder: returns canned rows per query substring, logs calls */
function makeSql(rowsByMatch: Record<string, unknown[]> = {}) {
  const calls: { query: string; params: unknown[] }[] = [];
  const sql = async (query: string, params: unknown[] = []) => {
    calls.push({ query, params });
    for (const [match, rows] of Object.entries(rowsByMatch)) {
      if (query.includes(match)) return { rows };
    }
    return { rows: [] };
  };
  return { sql, calls };
}

function stubFetch(handler: (url: string) => Response) {
  const orig = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL) =>
    Promise.resolve(handler(String(input instanceof Request ? input.url : input)));
  return () => {
    globalThis.fetch = orig;
  };
}

Deno.test("POST /figma/token validates via /v1/me, stores encrypted, echoes no token", async () => {
  const { sql, calls } = makeSql();
  const restore = stubFetch((url) => {
    assertStringIncludes(url, "https://api.figma.com/v1/me");
    return Response.json({ id: "1", email: "p@x.de", handle: "peter" });
  });
  try {
    const resp = await handleFigmaRoutes("/figma/token", "POST", req("POST", { token: "figd_secret" }), USER, sql, CORS);
    assertEquals(resp!.status, 200);
    const body = await resp!.json();
    assertEquals(body, { connected: true, handle: "peter" });
    const insert = calls.find((c) => c.query.includes("INSERT INTO devx.integrations"));
    assert(insert, "must upsert into devx.integrations");
    // params: [userId, ciphertext, iv, metadata] — raw token must not appear
    assert(!insert!.params.includes("figd_secret"), "raw token must not be stored");
    const roundTrip = await decryptToken(insert!.params[1] as string, insert!.params[2] as string);
    assertEquals(roundTrip, "figd_secret");
    assertStringIncludes(insert!.params[3] as string, "peter");
  } finally {
    restore();
  }
});

Deno.test("POST /figma/token rejects an invalid token without storing", async () => {
  const { sql, calls } = makeSql();
  const restore = stubFetch(() =>
    new Response(JSON.stringify({ status: 403, err: "Invalid token" }), { status: 403 })
  );
  try {
    const resp = await handleFigmaRoutes("/figma/token", "POST", req("POST", { token: "bad" }), USER, sql, CORS);
    assertEquals(resp!.status, 400);
    assertEquals(calls.length, 0, "nothing may be written for a rejected token");
  } finally {
    restore();
  }
});

Deno.test("POST /figma/token requires a token", async () => {
  const { sql } = makeSql();
  const resp = await handleFigmaRoutes("/figma/token", "POST", req("POST", {}), USER, sql, CORS);
  assertEquals(resp!.status, 400);
});

Deno.test("GET /figma/status reports connected + handle from metadata", async () => {
  const { sql } = makeSql({ "SELECT metadata": [{ metadata: { handle: "peter", email: "p@x.de" } }] });
  const resp = await handleFigmaRoutes("/figma/status", "GET", req("GET"), USER, sql, CORS);
  assertEquals(await resp!.json(), { connected: true, handle: "peter" });
});

Deno.test("GET /figma/status when not connected", async () => {
  const { sql } = makeSql();
  const resp = await handleFigmaRoutes("/figma/status", "GET", req("GET"), USER, sql, CORS);
  assertEquals(await resp!.json(), { connected: false, handle: null });
});

Deno.test("POST /figma/logout deletes the row", async () => {
  const { sql, calls } = makeSql();
  const resp = await handleFigmaRoutes("/figma/logout", "POST", req("POST"), USER, sql, CORS);
  assertEquals(await resp!.json(), { connected: false });
  assert(calls.some((c) => c.query.includes("DELETE FROM devx.integrations")));
});

Deno.test("getFigmaToken round-trips through encryption, null when absent", async () => {
  const { encryptToken } = await import("../crypto.ts");
  const { ciphertext, iv } = await encryptToken("figd_abc");
  const { sql } = makeSql({ "SELECT encrypted_token": [{ encrypted_token: ciphertext, token_iv: iv }] });
  assertEquals(await getFigmaToken(USER, sql), "figd_abc");
  const { sql: emptySql } = makeSql();
  assertEquals(await getFigmaToken(USER, emptySql), null);
});

Deno.test("unmatched path returns null", async () => {
  const { sql } = makeSql();
  assertEquals(await handleFigmaRoutes("/other", "GET", req("GET"), USER, sql, CORS), null);
});
