import { assertEquals, assertRejects } from "jsr:@std/assert";
import { _resetMcpCache, hashResolvedAuth, type McpClient, type McpConnectFn, realizeMcp } from "./mcp.ts";
import type { ConnectionDef } from "./types.ts";

function mcpConn(over: Partial<ConnectionDef> = {}): ConnectionDef {
  return {
    __trexConnection: true,
    type: "mcp",
    name: "echo",
    description: "Echo MCP",
    url: "https://mcp.example/sse",
    ...over,
  };
}

// A fake MCP client factory that records connects/headers/calls.
function fakeConnect(
  tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
  opts: { throwOnConnect?: boolean } = {},
): { fn: McpConnectFn; rec: { connects: number; headers: Record<string, string>[]; calls: unknown[] } } {
  const rec = { connects: 0, headers: [] as Record<string, string>[], calls: [] as unknown[] };
  const fn: McpConnectFn = (_url, headers) => {
    rec.connects++;
    rec.headers.push(headers);
    if (opts.throwOnConnect) return Promise.reject(new Error("connect boom"));
    const client: McpClient = {
      listTools: () => Promise.resolve({ tools }),
      callTool: (a) => {
        rec.calls.push(a);
        return Promise.resolve({ content: [{ type: "text", text: "pong" }] });
      },
    };
    return Promise.resolve(client);
  };
  return { fn, rec };
}

Deno.test("realizeMcp connects + maps listTools to RealizedTool[]", async () => {
  _resetMcpCache();
  const { fn } = fakeConnect([
    { name: "ping", description: "Ping the server", inputSchema: { type: "object", properties: {} } },
    { name: "shout", description: "Shout" },
  ]);
  const { tools } = await realizeMcp(mcpConn(), {}, "/agents/a", "h0", fn);
  assertEquals(tools.map((t) => t.name), ["ping", "shout"]);
  assertEquals(tools[0].description, "Ping the server");
  // Missing inputSchema defaults to an empty object schema.
  assertEquals(tools[1].inputSchema, { type: "object", properties: {} });
});

Deno.test("realizeMcp caches the client per (agentDir, connection)", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect([{ name: "ping" }]);
  await realizeMcp(mcpConn(), {}, "/agents/a", "h0", fn);
  await realizeMcp(mcpConn(), {}, "/agents/a", "h0", fn);
  assertEquals(rec.connects, 1);
  // A different agentDir is a distinct cache entry.
  await realizeMcp(mcpConn(), {}, "/agents/b", "h0", fn);
  assertEquals(rec.connects, 2);
});

Deno.test("realizeMcp does not cache a failed connect", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect([{ name: "ping" }], { throwOnConnect: true });
  await assertRejects(() => realizeMcp(mcpConn(), {}, "/agents/a", "h0", fn));
  await assertRejects(() => realizeMcp(mcpConn(), {}, "/agents/a", "h0", fn));
  assertEquals(rec.connects, 2);
});

Deno.test("distinct authHash → distinct clients (no cross-tenant reuse)", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect([{ name: "ping" }]);
  // User A and user B resolve to different auth → different hashes.
  await realizeMcp(mcpConn(), { Authorization: "Bearer A" }, "/agents/a", "hashA", fn);
  await realizeMcp(mcpConn(), { Authorization: "Bearer B" }, "/agents/a", "hashB", fn);
  assertEquals(rec.connects, 2);
  // The two connects used the two distinct credential sets.
  assertEquals(rec.headers[0]["Authorization"], "Bearer A");
  assertEquals(rec.headers[1]["Authorization"], "Bearer B");
});

Deno.test("same authHash → single shared client", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect([{ name: "ping" }]);
  await realizeMcp(mcpConn(), { Authorization: "Bearer same" }, "/agents/a", "hashSame", fn);
  await realizeMcp(mcpConn(), { Authorization: "Bearer same" }, "/agents/a", "hashSame", fn);
  assertEquals(rec.connects, 1);
});

Deno.test("distinct url under the same (agentDir, name, authHash) → distinct clients (no stale-url reuse)", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect([{ name: "ping" }]);
  // Same connection name + same resolved auth, but the url was edited: this is
  // the devx per-user mcp_servers case (a row's url changed while its name +
  // headers stayed the same). The url is part of the cache key, so the second
  // realize must NOT reuse the first (old-endpoint) client.
  await realizeMcp(mcpConn({ url: "https://old.example/sse" }), {}, "/agents/a", "h0", fn);
  await realizeMcp(mcpConn({ url: "https://new.example/sse" }), {}, "/agents/a", "h0", fn);
  assertEquals(rec.connects, 2);
  // Identical url + name + auth → the shared cached client (unchanged behavior).
  await realizeMcp(mcpConn({ url: "https://new.example/sse" }), {}, "/agents/a", "h0", fn);
  assertEquals(rec.connects, 2);
});

Deno.test("hashResolvedAuth is deterministic + order-independent", async () => {
  const a = await hashResolvedAuth({ "X-A": "1", "X-B": "2" });
  const b = await hashResolvedAuth({ "X-B": "2", "X-A": "1" });
  const c = await hashResolvedAuth({ "X-A": "1", "X-B": "3" });
  assertEquals(a, b); // insertion order does not matter
  assertEquals(a === c, false); // different values → different hash
});
