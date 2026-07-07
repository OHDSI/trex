// Connection tool provider — realizes an agent's connections/*.ts into trex
// ToolDefs and hands them to buildSdkTools via the H2 provider slot (a sibling
// of the dynamic-tools.ts provider; see service/toolset.ts). Task 3 scope:
// MCP connections + static auth only. OpenAPI connections (type:"openapi") are
// skipped here and land in Task 4.
//
// Posture (H2): a broken connection NEVER kills the turn. Each connection is
// realized inside its own try/catch — a connect/list failure logs and yields
// nothing while the other connections still contribute their tools. The whole
// provider returning is itself wrapped in log+continue by buildSdkTools.

import type { ConnectionAuth, ConnectionDef, ConnectionTools } from "./types.ts";
import type { HookCtx, ToolContext, ToolDef } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import { formatMcpResult, type McpConnectFn, realizeMcp } from "./mcp.ts";

export interface ConnectionProviderOpts {
  // Injectable MCP connect factory (tests pass a fake). Defaults to the real
  // SDK-backed connect inside mcp.ts.
  connect?: McpConnectFn;
}

// allow/block policy over the BARE (un-namespaced) remote tool name. The shim
// guarantees exactly one of allow/block is present when `tools` is set.
function passesToolFilter(name: string, tools?: ConnectionTools): boolean {
  if (!tools) return true;
  if ("allow" in tools && tools.allow) return tools.allow.includes(name);
  if ("block" in tools && tools.block) return !tools.block.includes(name);
  return true;
}

// Resolve the outbound header set for a connection at call time (per turn):
// top-level `headers`, then static `auth.headers`, then static `auth.getToken`
// as a Bearer. OAuth connections (kind:"oauth") are resolved by the token store
// in Task 6 and contribute nothing here.
async function resolveHeaders(conn: ConnectionDef, ctx: HookCtx): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (conn.headers) {
    Object.assign(headers, typeof conn.headers === "function" ? conn.headers(ctx) : conn.headers);
  }
  const auth: ConnectionAuth | undefined = conn.auth;
  if (auth && auth.kind === "static") {
    if (auth.headers) {
      Object.assign(headers, typeof auth.headers === "function" ? auth.headers(ctx) : auth.headers);
    }
    if (auth.getToken) {
      const { token } = await auth.getToken(ctx);
      headers["Authorization"] = `Bearer ${token}`;
    }
  }
  return headers;
}

// Build the H2 ToolProviderFn for an agent's connections. Called per top-level
// turn by buildSdkTools; realizes each connection lazily (the MCP client is
// cached across turns in mcp.ts).
export function buildConnectionProvider(
  agent: LoadedAgent,
  opts: ConnectionProviderOpts = {},
): (ctx: HookCtx) => Promise<Record<string, ToolDef>> {
  return async (ctx: HookCtx): Promise<Record<string, ToolDef>> => {
    const out: Record<string, ToolDef> = {};
    for (const conn of Object.values(agent.connections)) {
      // OpenAPI is Task 4 — leave a clear seam.
      if (conn.type !== "mcp") continue;
      try {
        const headers = await resolveHeaders(conn, ctx);
        const { client, tools } = await realizeMcp(conn, headers, agent.dir, opts.connect);
        const needsApproval = conn.approval === "once" ? true : undefined;
        for (const t of tools) {
          if (!passesToolFilter(t.name, conn.tools)) continue;
          const remoteName = t.name;
          out[`${conn.name}__${remoteName}`] = {
            description: t.description,
            inputSchema: t.inputSchema,
            ...(needsApproval ? { needsApproval } : {}),
            execute: async (input: unknown, _tctx?: ToolContext) => {
              const res = await client.callTool({ name: remoteName, arguments: input });
              return formatMcpResult(res);
            },
          };
        }
      } catch (e) {
        // Broken connection → skip, never fail the turn (H2).
        console.error(
          `agents: connection "${conn.name}" (${agent.dir}) failed to realize — skipping its tools this turn: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
    return out;
  };
}
