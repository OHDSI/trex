// Connection tool provider — realizes an agent's connections/*.ts into trex
// ToolDefs and hands them to buildSdkTools via the H2 provider slot (a sibling
// of the dynamic-tools.ts provider; see service/toolset.ts). Handles both MCP
// (`realizeMcp`) and OpenAPI (`realizeOpenApi`) connections with static auth;
// OAuth-kind auth is resolved by the token store (Task 6).
//
// Posture (H2): a broken connection NEVER kills the turn. Each connection is
// realized inside its own try/catch — a connect/list failure logs and yields
// nothing while the other connections still contribute their tools. The whole
// provider returning is itself wrapped in log+continue by buildSdkTools.

import type { ConnectionAuth, ConnectionDef, ConnectionTools } from "./types.ts";
import type { HookCtx, ToolContext, ToolDef } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import { formatMcpResult, hashResolvedAuth, type McpConnectFn, realizeMcp } from "./mcp.ts";
import { type FetchLike, realizeOpenApi } from "./openapi.ts";

export interface ConnectionProviderOpts {
  // Injectable MCP connect factory (tests pass a fake). Defaults to the real
  // SDK-backed connect inside mcp.ts.
  connect?: McpConnectFn;
  // Injectable fetch for OpenAPI operation calls (tests pass a mock). Defaults
  // to the global fetch inside openapi.ts.
  fetch?: FetchLike;
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
      try {
        // Resolve auth per turn (shared by both connection kinds): the outbound
        // header set carries any static Bearer / header credential.
        const headers = await resolveHeaders(conn, ctx);
        const needsApproval = conn.approval === "once" ? true : undefined;

        if (conn.type === "openapi") {
          // One realized tool per operation; the provider applies the same
          // namespacing/filter/approval it applies to MCP tools. Per-operation
          // security relocates the resolved Bearer where the scheme dictates.
          for (const t of realizeOpenApi(conn, headers, { fetch: opts.fetch })) {
            if (!passesToolFilter(t.name, conn.tools)) continue;
            out[`${conn.name}__${t.name}`] = {
              description: t.description,
              inputSchema: t.inputSchema,
              ...(needsApproval ? { needsApproval } : {}),
              execute: (input: unknown, _tctx?: ToolContext) => t.execute(input),
            };
          }
          continue;
        }

        if (conn.type !== "mcp") continue;

        // Key the MCP client cache by a hash of the resolved credentials so a
        // ctx-dependent static getToken/headers never reuses one caller's
        // client (and token) for another's callTool.
        const authHash = await hashResolvedAuth(headers);
        const { client, tools } = await realizeMcp(conn, headers, agent.dir, authHash, opts.connect);
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
