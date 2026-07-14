// Unit tests for dynamic-tools.ts (task-v3-brief.md): port of
// functions/agent.ts's Phase 6 MCP tool injection (~350-444).
//
// The sql-shape branches (no userId/sql, no devx.mcp_servers rows) are tested
// against the default export. The HTTP realization is now covered end-to-end
// (Task 8, agents-connections): dynamic-tools.ts routes HTTP MCP servers
// through the shared connection layer (realizeMcp), whose `connect` seam can
// be faked — so `buildDevxMcpTools(ctx, fakeConnect)` exercises tool discovery
// AND execution with no live MCP server. The stdio path stays on mcpManager (a
// bare singleton with no injection seam) and remains untested here, exactly as
// the pre-Task-8 header noted.
import { assert, assertEquals } from "jsr:@std/assert";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import type { McpClient, McpConnectFn } from "../../../../core/server/agents/connections/mcp.ts";
import { _resetMcpCache } from "../../../../core/server/agents/connections/mcp.ts";
import dynamicTools, { buildDevxMcpTools } from "../dynamic-tools.ts";

function fakeHookCtx(overrides: Partial<HookCtx> = {}): HookCtx {
  return {
    sessionId: "s-1",
    env: () => undefined,
    userId: "u-1",
    sql: () => Promise.resolve({ rows: [] }),
    ...overrides,
  };
}

Deno.test("dynamic-tools: __trexToolProvider brand is set (loader.ts checks this on the default export)", () => {
  assertEquals((dynamicTools as unknown as { __trexToolProvider?: boolean }).__trexToolProvider, true);
});

Deno.test("dynamic-tools: no devx.mcp_servers rows returns {}", async () => {
  const tools = await dynamicTools(fakeHookCtx());
  assertEquals(tools, {});
});

Deno.test("dynamic-tools: no ctx.userId returns {} (no query attempted)", async () => {
  const ctx = fakeHookCtx({
    userId: undefined,
    sql: () => Promise.reject(new Error("should not query without a userId")),
  });
  const tools = await dynamicTools(ctx);
  assertEquals(tools, {});
});

Deno.test("dynamic-tools: no ctx.sql returns {}", async () => {
  const ctx = fakeHookCtx({ sql: undefined as unknown as HookCtx["sql"] });
  const tools = await dynamicTools(ctx);
  assertEquals(tools, {});
});

// ===========================================================================
// Task 8 parity: an http devx.mcp_servers row realized through the SHARED
// connection layer (realizeMcp) must produce the SAME tool set (names +
// needsApproval + description + inputSchema) the legacy mcpManager path did.
// The expected values below ARE the legacy contract (functions/agent.ts:
// 367-379): name `mcp_<server>_<tool>`, description `[MCP: <server>] <desc>`,
// inputSchema `{type:"object", ...schema}`, needsApproval always true.
// ===========================================================================

// A fake MCP client + connect seam — no live server, no @modelcontextprotocol
// transport. `realizeMcp(conn, headers, agentDir, authHash, connect)` calls
// this instead of its default HTTP/SSE connect.
function fakeMcpConnect(
  remoteTools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
  call: (name: string, args: unknown) => { content?: Array<{ type: string; text?: string }>; isError?: boolean } = () => ({
    content: [{ type: "text", text: "ok" }],
  }),
): { connect: McpConnectFn; calls: Array<{ name: string; args: unknown }> } {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client: McpClient = {
    listTools: () => Promise.resolve({ tools: remoteTools }),
    callTool: ({ name, arguments: args }) => {
      calls.push({ name, args });
      return Promise.resolve(call(name, args));
    },
  };
  return { connect: () => Promise.resolve(client), calls };
}

function httpServerCtx(rows: unknown[], userId = "u-mcp"): HookCtx {
  return fakeHookCtx({
    userId,
    sql: (query: string) => {
      assert(query.includes("FROM devx.mcp_servers"), `unexpected query: ${query}`);
      return Promise.resolve({ rows });
    },
  });
}

Deno.test("dynamic-tools (Task 8 parity): an http mcp_servers row yields mcp_<server>_<tool> ToolDefs via the shared connection layer, matching the legacy shape", async () => {
  _resetMcpCache();
  const ctx = httpServerCtx([
    { name: "github", transport: "http", url: "https://mcp.example/github", headers: {}, args: [], env: {} },
  ]);
  const { connect, calls } = fakeMcpConnect(
    [
      { name: "search_issues", description: "Search issues", inputSchema: { type: "object", properties: { q: { type: "string" } } } },
      { name: "no_schema_tool" }, // remote tool with no inputSchema/description
    ],
    (_name, args) => ({ content: [{ type: "text", text: `ran ${JSON.stringify(args)}` }] }),
  );

  const tools = await buildDevxMcpTools(ctx, connect);

  // Names: mcp_<server>_<tool> (legacy contract).
  assertEquals(Object.keys(tools).sort(), ["mcp_github_no_schema_tool", "mcp_github_search_issues"]);

  const withSchema = tools["mcp_github_search_issues"];
  assertEquals(withSchema.needsApproval, true);
  assertEquals(withSchema.description, "[MCP: github] Search issues");
  assertEquals(withSchema.inputSchema, { type: "object", properties: { q: { type: "string" } } });

  // A remote tool with no schema/description → default empty object schema and
  // an empty description after the [MCP: ...] prefix (legacy `|| ""`).
  const noSchema = tools["mcp_github_no_schema_tool"];
  assertEquals(noSchema.needsApproval, true);
  assertEquals(noSchema.description, "[MCP: github] ");
  assertEquals(noSchema.inputSchema, { type: "object", properties: {} });

  // execute round-trips through the shared client.callTool + formatMcpResult
  // (parity with mcpManager.executeTool's text-join formatting).
  const out = await withSchema.execute!({ q: "bug" });
  assertEquals(out, `ran {"q":"bug"}`);
  assertEquals(calls, [{ name: "search_issues", args: { q: "bug" } }]);
});

Deno.test("dynamic-tools (Task 8): multiple http servers are namespaced per server; a broken one is skipped, the rest survive", async () => {
  _resetMcpCache();
  const ctx = httpServerCtx([
    { name: "good", transport: "http", url: "https://mcp.example/good", headers: {}, args: [], env: {} },
    { name: "broken", transport: "http", url: "https://mcp.example/broken", headers: {}, args: [], env: {} },
  ]);
  // connect throws for the "broken" url, succeeds for "good".
  const goodClient: McpClient = {
    listTools: () => Promise.resolve({ tools: [{ name: "ping", description: "Ping", inputSchema: { type: "object", properties: {} } }] }),
    callTool: () => Promise.resolve({ content: [{ type: "text", text: "pong" }] }),
  };
  const connect: McpConnectFn = (url) => {
    if (url.includes("broken")) return Promise.reject(new Error("connect refused"));
    return Promise.resolve(goodClient);
  };

  const tools = await buildDevxMcpTools(ctx, connect);
  // Only the good server's tool survives; the broken server never fails the turn.
  assertEquals(Object.keys(tools), ["mcp_good_ping"]);
  assertEquals(tools["mcp_good_ping"].needsApproval, true);
});

Deno.test("dynamic-tools (Task 8): distinct users with a same-named server never share a realized client (tenant isolation)", async () => {
  _resetMcpCache();
  // Both users have a server named "github" with NO auth headers but DIFFERENT
  // urls. If the realizeMcp cache key were not user-scoped, (name, authHash)
  // would collide and user B would get user A's client/endpoint.
  const seen: string[] = [];
  const connect: McpConnectFn = (url) => {
    seen.push(url);
    return Promise.resolve({
      listTools: () => Promise.resolve({ tools: [{ name: "t", inputSchema: { type: "object", properties: {} } }] }),
      callTool: () => Promise.resolve({ content: [] }),
    } as McpClient);
  };

  const ctxA = httpServerCtx(
    [{ name: "github", transport: "http", url: "https://a.example/github", headers: {}, args: [], env: {} }],
    "user-A",
  );
  const ctxB = httpServerCtx(
    [{ name: "github", transport: "http", url: "https://b.example/github", headers: {}, args: [], env: {} }],
    "user-B",
  );

  await buildDevxMcpTools(ctxA, connect);
  await buildDevxMcpTools(ctxB, connect);

  // Two DISTINCT connects happened (one per user's url) — no cross-user reuse.
  assertEquals(seen.sort(), ["https://a.example/github", "https://b.example/github"]);
});
