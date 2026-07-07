import { assertEquals, assertRejects } from "jsr:@std/assert";
import { _resetMcpCache, type McpClient, type McpConnectFn, realizeMcp } from "./mcp.ts";
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
  const { tools } = await realizeMcp(mcpConn(), {}, "/agents/a", fn);
  assertEquals(tools.map((t) => t.name), ["ping", "shout"]);
  assertEquals(tools[0].description, "Ping the server");
  // Missing inputSchema defaults to an empty object schema.
  assertEquals(tools[1].inputSchema, { type: "object", properties: {} });
});

Deno.test("realizeMcp caches the client per (agentDir, connection)", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect([{ name: "ping" }]);
  await realizeMcp(mcpConn(), {}, "/agents/a", fn);
  await realizeMcp(mcpConn(), {}, "/agents/a", fn);
  assertEquals(rec.connects, 1);
  // A different agentDir is a distinct cache entry.
  await realizeMcp(mcpConn(), {}, "/agents/b", fn);
  assertEquals(rec.connects, 2);
});

Deno.test("realizeMcp does not cache a failed connect", async () => {
  _resetMcpCache();
  const { fn, rec } = fakeConnect([{ name: "ping" }], { throwOnConnect: true });
  await assertRejects(() => realizeMcp(mcpConn(), {}, "/agents/a", fn));
  await assertRejects(() => realizeMcp(mcpConn(), {}, "/agents/a", fn));
  assertEquals(rec.connects, 2);
});
