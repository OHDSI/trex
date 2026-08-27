// Minimal structural type surface matching eve's public authoring API,
// plus trex-only extensions (clientOnly, idempotent, JSON Schema inputs).
// Keep this file dependency-free: agent tool files import it transitively
// and must stay portable to real eve.
//
// ONE exception, deliberate: the `import type` of ContextConfig below. A
// type-only import erases entirely at runtime, so it adds no module edge and
// nothing for a port to real eve to carry — the alternative was redeclaring
// an eight-field interface that must then be kept in lockstep with
// budget.ts's, which is the failure mode this file's rule exists to avoid,
// not an instance of it. Every VALUE import stays forbidden; QueryFn below
// is redeclared rather than imported for exactly that reason.

import type { ContextConfig } from "../service/context/budget.ts";

// The worker's pg pool query fn, threaded through to hooks as `HookCtx.sql`
// (matches store.ts's `QueryFn` — redeclared here, not imported, to keep
// this file dependency-free per the header comment).
export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

// Per-request context handed to an agent's `resolveModel`/`buildInstructions`
// hooks. `userId` is sourced ONLY from the x-user-id header the control-server
// proxy injects (see handler.ts) — never from client-supplied `metadata`,
// which is untrusted request payload.
export interface HookCtx {
  sessionId: string;
  bearerToken?: string;
  userId?: string;
  metadata?: unknown;
  // The resolved end-user principal for this turn, used by the OAuth broker
  // (connections/oauth) to key per-principal tokens. Derived from x-user-id
  // for native sessions (handler.ts's buildHookCtx sets {principalType:"user",
  // principalId:userId}); a channel principal would populate this too. Absent
  // when the request carries no principal — a user-scoped oauth connection then
  // fails closed (principal_required). Distinct from userId (which is strictly
  // the trex x-user-id) so a non-trex channel principal can flow here without
  // masquerading as a trex user id elsewhere.
  principal?: { principalType: string; principalId: string };
  env: (k: string) => string | undefined;
  sql: QueryFn;
}

// A resolved model + credentials, returned by `resolveModel` in place of an
// eve/AI-Gateway model string when per-request credentials are needed (e.g.
// a per-tenant API key). `apiKey` for the bedrock provider is used as the
// bearer token (see model.ts's resolveModelSpec).
export interface ModelSpec {
  provider: "anthropic" | "openai" | "google" | "bedrock";
  modelId: string;
  apiKey?: string;
  baseURL?: string;
}

export interface AgentConfig {
  model?: string; // eve/AI-Gateway format: "provider/model-id"
  maxSteps?: number;
  context?: Partial<ContextConfig>;
  // Per-subagent role config (task-14, ported from codex's role.rs). Both are
  // REDUCING ONLY: a caller delegating to a subagent can never grant it more
  // than it already has itself. `skills`, when declared on a subagent, is
  // intersected against the delegating session's OWN skill names — never
  // unioned — by loader.ts's resolveChildSkills; wired at delegation time by
  // service/toolset.ts's restrictChildSkills. `reasoningEffort` is applied to
  // the resolved model's providerOptions (model.ts's
  // reasoningEffortProviderOptions) when the child's own turn runs.
  reasoningEffort?: string;
  skills?: string[];
  // Additive hooks (eve ignores unknown defineAgent fields): called on EVERY
  // turn/chat request, never cached at agent-load time. A thrown/rejected
  // hook must fail the request rather than silently falling back to
  // env-configured credentials (wrong-account risk) — see model.ts's
  // resolveModelForTurn and toolset.ts's resolveInstructions.
  resolveModel?: (ctx: HookCtx) => Promise<string | ModelSpec>;
  buildInstructions?: (base: string, ctx: HookCtx) => Promise<string>;
  // Applied to the MERGED tool set (authored + dynamic-tools.ts provider
  // output + built-in `skill`/`agent`) by toolset.ts's buildSdkTools —
  // returning false drops the tool. Synchronous by design (a per-tool
  // yes/no decision, not an I/O call); a thrown filter propagates uncaught,
  // same posture as buildInstructions/resolveModel (fail the turn rather
  // than silently keep a tool that should have been dropped).
  filterTools?: (toolName: string, def: ToolDef, ctx: HookCtx) => boolean;
  // Tool-call interception. Invoked by toolset.ts's authoredTool INSIDE
  // execute, AFTER the approval gate — ordering is load-bearing: a hook that
  // ran first could approve on the user's behalf. Applies to every tool
  // routed through authoredTool (static, dynamic-tools.ts provider output,
  // MCP), unlike ToolContext.sql which is withheld from provider-sourced
  // tools: sql GRANTS power to a less trusted tool, whereas these INTERCEPT
  // it, so withholding them from the least trusted tools would invert the
  // intent. NOT applied to the `skill`/`agent`/`connection_search` built-ins
  // (skillTool/agentTool/connectionSearchTool) — they bypass authoredTool
  // entirely, so a hook cannot police subagent delegation via `agent`, nor
  // which procedure a turn loads via `skill`. Read from ctx.agent.config, so
  // a depth-1 subagent runs the SUBAGENT's hooks: devx's .edn subagents
  // carry no TS config, i.e. a devx subagent turn runs with NO hooks (a
  // legacy PreToolUse matcher of `Agent|Skill` loses enforcement at the eve
  // cutover).
  //
  // CORE fails closed: a throwing/rejecting hook denies THAT CALL (the tool
  // returns an {error} payload) and the turn continues. This deliberately
  // differs from devx's legacy loop, which caught and proceeded — a hook
  // whose job is to stop something must not be defeated by its own bug. A
  // hook configured with no ctx.hookCtx available is a caller wiring bug,
  // not a hook failure, and throws rather than silently skipping — same
  // posture as buildInstructions/filterTools above.
  //
  // That guarantee covers the hook FUNCTION only; it does NOT make the whole
  // chain fail-closed. devx's implementation behind this hook
  // (plugins/devx/functions/skills/hooks.ts) denies only on exit code 2 or
  // an explicit stdout deny — executeHook throwing (:61), a non-allowlisted
  // executable (:166), and an unavailable Trex/DuckDB runtime (:216) all
  // still return "approve". See COMPAT.md divergence 15.
  onToolCall?: (
    call: { name: string; input: unknown },
    ctx: HookCtx,
  ) => Promise<{ allow: boolean; input?: unknown; reason?: string }>;
  onToolResult?: (
    call: { name: string; input: unknown; result: unknown },
    ctx: HookCtx,
  ) => Promise<unknown>;
  // Turn lifecycle. Called once, after the turn's text has been persisted and
  // the stream has closed, immediately before runTurn returns. Errors are
  // logged and swallowed: the turn already succeeded, and a Stop-hook bug must
  // not retro-fail completed work. NOT called for a failed turn — the "error"
  // stream case throws before this point, matching devx legacy, which runs
  // Stop hooks only after a successful turn.
  onTurnEnd?: (
    turn: { text: string; finishReason: string },
    ctx: HookCtx,
  ) => Promise<void>;
  // Per-turn user-message rewrite. Signature deliberately mirrors
  // buildInstructions(base, ctx) — but applies to the USER message, not the
  // system prompt, because the system prompt is cache-pointed
  // (withSystemCachePoint) on the strength of being stable across turns.
  // Per-turn content (e.g. attachment paths) folded into it would invalidate
  // the prompt cache on every request.
  //
  // Fails the turn on throw, same posture as buildInstructions: a turn built
  // on a half-resolved prompt is worse than no turn.
  buildUserMessage?: (base: string, ctx: HookCtx) => Promise<string>;
}

// Resolved agent config: guaranteed to have all fields fully populated.
// The loader always returns this type from loadAgent, never the raw AgentConfig.
// Used internally by the runtime; not exposed to agent authors.
export type ResolvedAgentConfig = AgentConfig & { context: ContextConfig };

// A dynamic tool source, authored as an agent-dir-root `dynamic-tools.ts`
// default export (via eve-shim/tools.ts's defineToolProvider) and loaded by
// loader.ts into LoadedAgent.toolProvider. Called fresh per top-level
// buildSdkTools invocation (never at subagent depth — see toolset.ts) with
// the same per-request HookCtx as resolveModel/buildInstructions. A
// rejecting provider must NOT fail the turn (unlike resolveModel/
// buildInstructions above) — a flaky MCP server or similar backing source is
// an operational hazard, not a trust-boundary one; toolset.ts logs and
// continues with the static tool set instead.
export type ToolProviderFn = (ctx: HookCtx) => Promise<Record<string, ToolDef>>;

export interface ToolContext {
  bearerToken?: string;
  sessionId: string;
  metadata?: unknown;
  userId?: string;
  // The worker's pg pool query fn, threaded straight from HookCtx.sql (see
  // toolset.ts's authoredTool) so a tool's execute() can run SQL without
  // reaching for a separate ambient pool. Additive/trex-only, like `emit`
  // and `userId` above: real eve's ToolContext has no `sql` field, so
  // `ctx?.sql?.(...)` there is simply unavailable, not a crash, as long as
  // a tool guards the same way it guards `emit`/`userId`.
  sql?: QueryFn;
  // Fire-and-forget custom tool events. A tool's execute() calls this to
  // surface arbitrary progress/telemetry to whichever client is watching —
  // the session API's live stream (as a `tool.event` AgentEvent, also
  // persisted as an `agents.steps` row with `kind: 'custom'`, see
  // runner.ts's toolEmit) or the /chat UIMessage stream (as an interleaved
  // `data-${name}` part, see handler.ts). Optional and safe to call or skip:
  // an endpoint that hasn't wired an emit channel (e.g. toolset.ts's
  // buildSdkTools called with no toolEmit) simply omits this field, so a
  // tool must guard with `ctx?.emit?.(...)` — never assume it's present.
  emit?: (name: string, data: unknown) => void;
  // Task 15: activates one or more of THIS session's deferred tools
  // (agent.config.context.deferredTools — see context/toolsplit.ts's
  // partitionTools) so they're included in the SDK tool set from the next
  // buildSdkTools call onward. Bound to the calling session by
  // toolset.ts's authoredTool (`(names) => ctx.store.activateTools(ctx.
  // sessionId, names)`) — deliberately narrower than handing a tool the
  // whole AgentStore: a tool gets exactly one write capability (its own
  // session's activated-tools list), not arbitrary store access. Optional
  // and safe to skip, same posture as emit/sql: undefined when no store was
  // wired (e.g. /chat's stateless buildSdkTools call, or a test that never
  // sets ToolBuildCtx.store).
  activateTools?: (names: string[]) => Promise<void>;
}

// deno-lint-ignore no-explicit-any
export type JsonSchemaObject = Record<string, any>;

export interface ToolDef {
  description: string;
  inputSchema: unknown; // zod schema or JSON Schema object
  execute?: (input: unknown, ctx?: ToolContext) => Promise<unknown>;
  needsApproval?: boolean;
  clientOnly?: boolean;
  idempotent?: boolean;
  // This tool speaks to the channel directly (its own REST call, outside the
  // emit/message.completed event path) — set on claw's
  // postUpdate/postChoice/postPlan/postQuestion/
  // postScreenshots/postDevSummary. runner.ts's no-silent-turn fallback reads
  // this (agent-agnostic — it does not know any tool by name) to avoid claiming
  // "nothing happened" after a turn that already told the channel something,
  // and to avoid claiming "nothing was changed" when it can't know that.
  postsToChannel?: boolean;
}

// zod v3/v4 schemas expose safeParse; JSON Schema objects don't.
export function isZodSchema(s: unknown): boolean {
  return !!s && typeof (s as { safeParse?: unknown }).safeParse === "function";
}
