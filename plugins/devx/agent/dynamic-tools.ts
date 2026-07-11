// V3 (task-v3-brief.md): port of functions/agent.ts's Phase 6 MCP tool
// injection (~350-444) as eve's dynamic-tools.ts contract (H2). Called by
// core's buildSdkTools() fresh on every top-level turn (never cached, never
// at subagent depth) with the same per-request HookCtx resolveModel/
// filterTools/buildInstructions get — see core/server/agents/loader.ts and
// service/toolset.ts.
//
// Placement note: this file lives at the agent-dir ROOT (plugins/devx/agent/
// dynamic-tools.ts), NOT inside tools/ — loader.ts scans those as two
// separate, non-overlapping steps (a dynamic-tools.ts placed inside tools/
// would just hit the tools/ loop's __trexTool brand-mismatch error like any
// other stray file there).
import { defineToolProvider } from "eve/tools";
// Type-only: see agent.ts's header comment for why ToolDef/HookCtx come from
// core's eve-shim here rather than "eve"'s public surface / "eve" directly
// for the type (HookCtx IS re-exported by "eve", used here as a type only).
import type { HookCtx, ToolDef } from "../../../core/server/agents/eve-shim/types.ts";
import { mcpManager } from "../functions/mcp_manager.ts";

interface McpServerRow {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

// Logged at most once per process — this is an operational/config note
// ("no request identity, MCP tools unavailable this turn"), not a per-call
// error worth spamming every turn.
let warnedNoIdentity = false;

export default defineToolProvider(async (ctx: HookCtx): Promise<Record<string, ToolDef>> => {
  if (!ctx.userId || !ctx.sql) {
    if (!warnedNoIdentity) {
      console.warn("devx dynamic-tools: no userId/sql on this request — skipping MCP tools");
      warnedNoIdentity = true;
    }
    return {};
  }
  const userId = ctx.userId;

  const mcpServersResult = await ctx.sql(
    `SELECT name, transport, command, args, env, url, headers
     FROM devx.mcp_servers WHERE user_id = $1 AND enabled = true`,
    [userId],
  );
  const servers = mcpServersResult.rows as McpServerRow[];
  if (servers.length === 0) return {};

  // Not wrapped in try/catch: a throwing/rejecting mcpManager call propagates
  // to core's buildSdkTools, which logs it and continues with the static
  // tool set for this turn — see toolset.ts's toolProvider call site.
  const mcpTools = await mcpManager.getTools(userId, servers);

  const tools: Record<string, ToolDef> = {};
  for (const mcpTool of mcpTools) {
    const toolName = `mcp_${mcpTool.serverName}_${mcpTool.name}`;
    tools[toolName] = {
      description: `[MCP: ${mcpTool.serverName}] ${mcpTool.description}`,
      inputSchema: { type: "object", ...mcpTool.inputSchema },
      // Port of the legacy DEFAULT only (functions/agent.ts:371-379): an MCP
      // tool with no explicit devx.mcp_tool_consents row is never
      // auto-approved — the caller must approve the call (or grant a sticky
      // "always"). We do NOT port the legacy per-call devx.mcp_tool_consents
      // read, its "never" pre-filter (which fully hid the tool), or the
      // bespoke devx.pending_consents DB poll — core's sticky always/never
      // consent store (toolset.ts's authoredTool, keyed on userId/plugin/
      // agentName/toolName) now owns that decision end-to-end.
      needsApproval: true,
      execute: (input: unknown) => mcpManager.executeTool(userId, mcpTool.serverName, mcpTool.name, input),
    };
  }
  return tools;
});
