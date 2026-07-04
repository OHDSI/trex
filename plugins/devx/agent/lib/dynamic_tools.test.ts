// Unit tests for dynamic-tools.ts (task-v3-brief.md): port of
// functions/agent.ts's Phase 6 MCP tool injection (~350-444). Coverage is
// scoped to the sql-shape branches (no userId/sql, no devx.mcp_servers
// rows) — mcpManager.getTools/executeTool reach into real MCP client
// connections (npm:@modelcontextprotocol/sdk transports spawning child
// processes / opening network sockets), so a "happy path" test that
// actually discovers/executes a tool would need either a live MCP server
// fixture or patching mcpManager's internals, neither of which this file's
// module-boundary (mcpManager is a bare singleton import, no injection
// seam) supports without a fragile mock. See the report's "known
// gaps/limitations" section.
import { assertEquals } from "jsr:@std/assert";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import dynamicTools from "../dynamic-tools.ts";

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
