// Live-DB integration test for the H2 thin memory fetch handler. Drives
// createMemoryHandler with real Request objects against a real Postgres
// (gbrain_test), exercising: bearer auth, allow-list gating, auto-provision
// on first tools/call, a write-then-read round trip through gbrain's
// keyword search path (no embedding provider configured — v1 keyword-only),
// and the bearer-before-allowlist ordering fix (an unauthenticated request
// gets the same 401 for a declared or undeclared memory name — no
// enumeration oracle via 401-vs-404).
//
// Gated on GBRAIN_TEST_DATABASE_URL (or a hardcoded local default matching
// the rest of the vendored gbrain suite's convention, e.g.
// vendor/gbrain/test/with-schema.test.ts) being reachable. Per the H2 brief
// this test MUST run against a live DB, not skip — so failure to connect is
// a hard test failure, not a silent skip.
import { PostgresEngine } from "gbrain/core/postgres-engine.ts";
import { createMemoryHandler } from "./handler.ts";

// Hand-rolled assertions (no deno.land/jsr std import) so this test's only
// network dependency at module-resolution time is the deno.json import map
// entries already required by gbrain core itself — no extra host to reach.
function assert(cond: unknown, msg?: string): asserts cond {
  if (!cond) throw new Error(msg ?? "assertion failed");
}
function assertEquals<T>(actual: T, expected: T, msg?: string) {
  const same = typeof actual === "object" && typeof expected === "object"
    ? JSON.stringify(actual) === JSON.stringify(expected)
    : actual === expected;
  if (!same) {
    throw new Error(msg ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const DATABASE_URL = Deno.env.get("GBRAIN_TEST_DATABASE_URL") ??
  "postgres://postgres:postgres@127.0.0.1:5433/gbrain_test";
const TOKEN = "h2-test-shared-secret";

async function buildHandler() {
  const engine = new PostgresEngine();
  await engine.connect({ engine: "postgres", database_url: DATABASE_URL } as never);
  const handler = createMemoryHandler({
    engine,
    allowlist: new Set(["h2test"]),
    token: TOKEN,
  });
  return { engine, handler };
}

function rpcRequest(
  path: string,
  body: Record<string, unknown>,
  opts: { token?: string | null } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token !== null) {
    headers["authorization"] = `Bearer ${opts.token ?? TOKEN}`;
  }
  return new Request(`http://worker.local${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

Deno.test({
  name: "handler: full memory MCP flow against a live Postgres DB",
  // gbrain's PostgresEngine runs its own background maintenance timers
  // (query-cache / connection-health intervals under postgres.js) that are
  // part of its normal long-running-process lifecycle and outlive a single
  // `disconnect()` call in a short-lived test process; that's an engine
  // lifecycle detail orthogonal to what this test verifies (the fetch
  // handler's routing/auth/dispatch behavior), so resource sanitation is
  // disabled rather than reaching into gbrain internals to force-clear them.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: async () => {
    const { engine, handler } = await buildHandler();

    try {
      // 1. initialize with correct bearer -> 200.
      const initRes = await handler(
        rpcRequest("/memory/h2test/mcp", { jsonrpc: "2.0", id: 1, method: "initialize" }),
      );
      assertEquals(initRes.status, 200);
      const initBody = await initRes.json();
      assertEquals(initBody.result.serverInfo.name, "gbrain");
      assertEquals(initBody.result.capabilities.tools, {});

      // 2. tools/call put_page -> provisions memory_h2test on first hit, succeeds.
      const putRes = await handler(
        rpcRequest("/memory/h2test/mcp", {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "put_page", arguments: { slug: "docs/hi", content: "# Hi\nyo" } },
        }),
      );
      assertEquals(putRes.status, 200);
      const putBody = await putRes.json();
      assert(!putBody.result.isError, `put_page returned an error: ${JSON.stringify(putBody.result)}`);
      const putText = JSON.parse(putBody.result.content[0].text);
      assert(
        putText.status === "created_or_updated" || putText.status === "skipped",
        `unexpected put_page status: ${JSON.stringify(putText)}`,
      );

      // 3. tools/call query -> proves the withSchema read path returns the page.
      const queryRes = await handler(
        rpcRequest("/memory/h2test/mcp", {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "query", arguments: { query: "hi" } },
        }),
      );
      assertEquals(queryRes.status, 200);
      const queryBody = await queryRes.json();
      assert(!queryBody.result.isError, `query returned an error: ${JSON.stringify(queryBody.result)}`);
      const results = JSON.parse(queryBody.result.content[0].text);
      assert(Array.isArray(results) && results.length > 0, `query returned no results: ${JSON.stringify(results)}`);
      assert(
        results.some((r: { slug?: string }) => r.slug === "docs/hi"),
        `query results did not include docs/hi: ${JSON.stringify(results)}`,
      );

      // 4. POST with wrong bearer -> 401.
      const badAuthRes = await handler(
        rpcRequest(
          "/memory/h2test/mcp",
          { jsonrpc: "2.0", id: 4, method: "initialize" },
          { token: "wrong-token" },
        ),
      );
      assertEquals(badAuthRes.status, 401);

      // ... and with no Authorization header at all -> 401.
      const noAuthRes = await handler(
        rpcRequest(
          "/memory/h2test/mcp",
          { jsonrpc: "2.0", id: 5, method: "initialize" },
          { token: null },
        ),
      );
      assertEquals(noAuthRes.status, 401);

      // ... and an UNSET token fails closed: empty configured secret must
      // reject an empty presented secret (the route is proxy-auth-exempt).
      const emptyTokenHandler = createMemoryHandler({
        engine,
        allowlist: new Set(["h2test"]),
        token: "",
      });
      const emptyRes = await emptyTokenHandler(
        rpcRequest(
          "/memory/h2test/mcp",
          { jsonrpc: "2.0", id: 6, method: "initialize" },
          { token: "" },
        ),
      );
      assertEquals(emptyRes.status, 401);

      // 5. POST to an undeclared memory name -> 404 (allow-list gate), given
      // a valid bearer token.
      const undeclaredRes = await handler(
        rpcRequest("/memory/undeclared/mcp", { jsonrpc: "2.0", id: 6, method: "initialize" }),
      );
      assertEquals(undeclaredRes.status, 404);

      // 6. Enumeration-oracle fix: an UNAUTHENTICATED request (no bearer) to
      // an UNDECLARED memory name must return 401, not 404 — otherwise the
      // 401-vs-404 split lets a caller with no credentials at all enumerate
      // which memory names are declared on this worker. Bearer check now
      // runs before allow-list evaluation, so this is indistinguishable
      // from the "declared name, no auth" case in step 4.
      const undeclaredNoAuthRes = await handler(
        rpcRequest(
          "/memory/undeclared/mcp",
          { jsonrpc: "2.0", id: 7, method: "initialize" },
          { token: null },
        ),
      );
      assertEquals(
        undeclaredNoAuthRes.status,
        401,
        "unauthenticated request to an undeclared name must 401 (same as a declared name), not 404",
      );

      // ... and the same undeclared name WITH a wrong bearer -> also 401,
      // not 404 (covers both "missing" and "wrong" token, mirroring step 4).
      const undeclaredWrongAuthRes = await handler(
        rpcRequest(
          "/memory/undeclared/mcp",
          { jsonrpc: "2.0", id: 8, method: "initialize" },
          { token: "wrong-token" },
        ),
      );
      assertEquals(undeclaredWrongAuthRes.status, 401);

      // 7. Confirm a VALID-bearer request to the same undeclared name still
      // 404s (the allow-list gate still applies once auth passes — this
      // repeats step 5 but sits next to steps 6/7 so the full
      // 401-then-404 ordering is visible in one place).
      const undeclaredValidAuthRes = await handler(
        rpcRequest("/memory/undeclared/mcp", { jsonrpc: "2.0", id: 9, method: "initialize" }),
      );
      assertEquals(undeclaredValidAuthRes.status, 404);
    } finally {
      await engine.disconnect();
    }
  },
});
