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
import type { OAuthStore } from "./oauth/store.ts";
import {
  type BrokerCtx,
  type OAuthConnectionAuth,
  resolveOAuthAuth,
  resolvePrincipal,
  type ResolvedPrincipal,
} from "./oauth/broker.ts";

// Broker wiring the OAuth-kind connection path needs, injected by the caller
// (handler.ts builds it from the DEK-backed OAuthStore + the state secret +
// the worker's mount prefix). Absent → oauth connections are skipped with a log
// (a connection can't mint tokens without a broker), never a turn failure.
export interface OAuthProviderDeps {
  store: OAuthStore;
  secret: string;
  // Start-route base, e.g. `${basePath}/eve/v1/oauth` — the broker builds
  // `${startUrlBase}/<connector>/start?state=…` from it.
  startUrlBase: string;
  fetch?: FetchLike;
  now?: () => number;
  refreshWindowMs?: number;
  stateTtlMs?: number;
  // Park loop cadence/ceiling (mirrors the needsApproval poll: 500ms / 5min).
  pollMs?: number;
  timeoutMs?: number;
}

export interface ConnectionProviderOpts {
  // Injectable MCP connect factory (tests pass a fake). Defaults to the real
  // SDK-backed connect inside mcp.ts.
  connect?: McpConnectFn;
  // Injectable fetch for OpenAPI operation calls (tests pass a mock). Defaults
  // to the global fetch inside openapi.ts.
  fetch?: FetchLike;
  // OAuth broker deps for kind:"oauth" connections (Task 7). Injected in
  // production by handler.ts; tests pass an in-memory store + secret.
  oauth?: OAuthProviderDeps;
}

// The resolved end-user principal for this turn (channel principal / x-user-id).
function principalFromCtx(ctx: HookCtx): ResolvedPrincipal | null {
  if (ctx.principal) return ctx.principal;
  if (ctx.userId) return { principalType: "user", principalId: ctx.userId };
  return null;
}

// Block-and-poll for a token the OAuth callback will write, mirroring the
// needsApproval park (toolset.ts): poll store.getToken every `pollMs` up to
// `timeoutMs`, resolving as soon as the callback's putToken makes the token
// appear. Wall-clock based (a real user is off authorizing in a browser).
async function pollForToken(
  store: OAuthStore,
  principal: ResolvedPrincipal,
  connector: string,
  deps: OAuthProviderDeps,
): Promise<string | null> {
  const pollMs = deps.pollMs ?? 500;
  const timeoutMs = deps.timeoutMs ?? 300_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const t = await store.getToken(principal.principalType, principal.principalId, connector);
    if (t) return t.access;
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, pollMs));
  }
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
        // OAuth-kind auth (trexConnect, Task 7) resolves per-tool-call via the
        // broker (park/refresh/error inside execute), not as a static header —
        // handled entirely by realizeOAuthConnection.
        if (conn.auth && conn.auth.kind === "oauth") {
          await realizeOAuthConnection(agent, conn, conn.auth, ctx, opts, out);
          continue;
        }
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

// Realize an oauth-kind connection's tools (Task 7). Each realized tool
// resolves its access token at EXECUTE time (not build time): a valid/refreshed
// token → the call proceeds with a Bearer; no token → emit an
// authorization.required signal carrying the consent URL and PARK, polling the
// token store until the callback writes the token (or a timeout); no principal
// → a terminal error to the model. This mirrors the needsApproval park in
// service/toolset.ts.
//
// OpenAPI enumerates from its static spec, so it parks from cold (no token yet).
// MCP tool discovery requires an authenticated connection, so an MCP oauth
// connection with no token yet cannot enumerate — its tools appear on the turn
// AFTER the principal authorizes. (Documented limitation; noted in the report.)
async function realizeOAuthConnection(
  agent: LoadedAgent,
  conn: ConnectionDef,
  auth: OAuthConnectionAuth,
  ctx: HookCtx,
  opts: ConnectionProviderOpts,
  out: Record<string, ToolDef>,
): Promise<void> {
  const deps = opts.oauth;
  const connName = conn.name ?? "oauth";
  if (!deps) {
    console.error(
      `agents: connection "${connName}" (${agent.dir}) uses oauth but no OAuth broker is configured — skipping its tools`,
    );
    return;
  }
  const principal = principalFromCtx(ctx);
  const brokerCtx: BrokerCtx = {
    sessionId: ctx.sessionId,
    principal,
    secret: deps.secret,
    startUrlBase: deps.startUrlBase,
    fetch: deps.fetch,
    now: deps.now,
    refreshWindowMs: deps.refreshWindowMs,
    stateTtlMs: deps.stateTtlMs,
  };
  const needsApproval = conn.approval === "once" ? true : undefined;
  const connector = auth.connector;

  // Resolve-or-park at execute time. Returns a bearer token to use, or an
  // error string to surface to the model.
  const ensureToken = async (tctx?: ToolContext): Promise<{ token: string } | { error: string }> => {
    const r = await resolveOAuthAuth(deps.store, auth, brokerCtx);
    if ("token" in r) return { token: r.token };
    if ("error" in r) return { error: r.error };
    // authorizationRequired → tell the client where to consent, then park.
    tctx?.emit?.("authorization.required", { connector, url: r.authorizationRequired.url });
    const p = resolvePrincipal(auth, principal);
    if (!p) return { error: "principal_required" }; // unreachable (broker returned url), defensive
    const token = await pollForToken(deps.store, p, connector, deps);
    return token ? { token } : { error: "authorization_timeout" };
  };

  if (conn.type === "openapi") {
    // Enumerate tool names/schemas from the static spec (no token needed).
    let listed;
    try {
      listed = realizeOpenApi(conn, {}, { fetch: deps.fetch });
    } catch (e) {
      console.error(
        `agents: oauth openapi connection "${connName}" (${agent.dir}) failed to parse its spec — skipping: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return;
    }
    for (const t of listed) {
      if (!passesToolFilter(t.name, conn.tools)) continue;
      out[`${connName}__${t.name}`] = {
        description: t.description,
        inputSchema: t.inputSchema,
        ...(needsApproval ? { needsApproval } : {}),
        execute: async (input: unknown, tctx?: ToolContext) => {
          const got = await ensureToken(tctx);
          if ("error" in got) return { error: `oauth authorization ${got.error}` };
          // Re-realize with the resolved bearer so the operation's `security`
          // placement (openapi.ts) puts the token where the scheme dictates.
          const authed = realizeOpenApi(conn, { Authorization: `Bearer ${got.token}` }, { fetch: deps.fetch });
          const rt = authed.find((x) => x.name === t.name);
          if (!rt) return { error: "oauth: operation no longer available" };
          return await rt.execute(input);
        },
      };
    }
    return;
  }

  if (conn.type !== "mcp") return;

  // MCP: discovery needs an authenticated connection. Resolve (getToken +
  // refresh, no park) once at build time; if there's no usable token yet, we
  // cannot list the tools — skip this turn (they appear once authorized).
  const r = await resolveOAuthAuth(deps.store, auth, brokerCtx);
  if (!("token" in r)) {
    if ("error" in r) {
      console.error(`agents: oauth MCP connection "${connName}" (${agent.dir}): no principal — tools unavailable`);
    } else {
      console.error(
        `agents: oauth MCP connection "${connName}" (${agent.dir}): not authorized yet — tools appear after the principal consents`,
      );
    }
    return;
  }
  const headers = { Authorization: `Bearer ${r.token}` };
  const authHash = await hashResolvedAuth(headers);
  const { client, tools } = await realizeMcp(conn, headers, agent.dir, authHash, opts.connect);
  for (const t of tools) {
    if (!passesToolFilter(t.name, conn.tools)) continue;
    const remoteName = t.name;
    out[`${connName}__${remoteName}`] = {
      description: t.description,
      inputSchema: t.inputSchema,
      ...(needsApproval ? { needsApproval } : {}),
      execute: async (input: unknown, _tctx?: ToolContext) => {
        const res = await client.callTool({ name: remoteName, arguments: input });
        return formatMcpResult(res);
      },
    };
  }
}
