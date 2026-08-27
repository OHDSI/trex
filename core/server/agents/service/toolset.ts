// Builds the AI SDK tool set for an agent: authored tools (clientOnly /
// needsApproval / plain) plus the built-in `skill` and `agent` tools.
// Shared by runner.ts (session API) and handler.ts (/chat) so the two
// endpoints cannot drift. Spec §3 (skills/subagents) + §4 (extensions).
// deno-lint-ignore-file no-explicit-any
import { tool, jsonSchema } from "ai";
import { withToolCachePoint } from "./model.ts";
import { isZodSchema } from "../eve-shim/types.ts";
import type { HookCtx, ToolDef } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import { resolveChildSkills } from "../loader.ts";
import { buildConnectionProvider, type ConnectionProviderOpts } from "../connections/provider.ts";
import { type ConnectionToolMeta, searchConnectionTools } from "../connections/search.ts";
import type { AgentStore } from "./store.ts";
import type { AgentEvent } from "./events.ts";
import { subscribe } from "./stream.ts";
import { TRUNCATION_HEADER_OVERHEAD, truncateMiddle } from "./context/truncate.ts";
import type { ContextConfig } from "./context/budget.ts";
import { partitionTools } from "./context/toolsplit.ts";
import { type SpawnCapabilities, WAIT_DEFAULT_MS, WAIT_MAX_MS } from "./spawn.ts";

export interface ToolBuildCtx {
  agent: LoadedAgent;
  sessionId: string;
  metadata?: unknown;
  bearerToken?: string;
  userId?: string;
  model?: any;
  store?: AgentStore;
  turnId?: string;
  emit?: (e: AgentEvent) => void;
  // Wired per-endpoint (session runner: publish `tool.event` + persist a
  // `custom` step, see runner.ts's toolEmit; /chat: write an interleaved
  // `data-${name}` UIMessage part, see handler.ts) and handed to every
  // authored tool's execute() as ToolContext.emit (see authoredTool below).
  // Distinct from `emit` above, which carries the session-lifecycle
  // AgentEvent channel (approvals etc.) — toolEmit is the tool-authored
  // (name, data) channel. Undefined when the caller never wired one;
  // authoredTool passes it through as-is, matching ToolContext.emit's "safe
  // no-op when unwired" contract (eve-shim/types.ts) since an absent field
  // makes `ctx?.emit?.(...)` a no-op at the call site, not a throw here.
  // A depth-1 (child) turn gets its OWN toolEmit, wired the same way as any
  // top-level turn's (session stream / chat writer) — a child's tool calls
  // are not inherently visible on its PARENT's channel. Delegation
  // (toolset.ts's runAsChild) bridges them back explicitly: it subscribes to
  // the child's own event stream and re-emits its tool-call/tool-result
  // pairs onto the parent's toolEmit as subagent.tool, alongside the coarse
  // subagent.start/end it emits directly.
  toolEmit?: (name: string, data: unknown) => void;
  approvalPollMs?: number;
  approvalTimeoutMs?: number;
  depth?: number;
  // Sticky tool-consent decisions: the key authoredTool's needsApproval branch
  // looks up store.getToolConsent under, alongside userId and the tool's own
  // name. Set by handler.ts from its Deps {plugin, agentName} at every
  // buildSdkTools call site (both the session-runner path, via RunTurnOpts's
  // spread into this ctx, and /chat's direct buildSdkTools call). Optional so
  // existing callers that never touch needsApproval tools (or don't care about
  // stickiness) keep working — the sticky lookup is skipped whenever either is
  // missing, same as when userId itself is missing (anonymous session).
  plugin?: string;
  agentName?: string;
  // Threaded through so buildSdkTools can call agent.toolProvider and
  // agent.config.filterTools with the same per-request context
  // resolveModel/buildInstructions already get (see handler.ts's
  // buildHookCtx). Reusing HookCtx here — instead of adding a parallel
  // "dynamic tools ctx" shape — keeps one request-context type across every
  // agent.ts/dynamic-tools.ts hook.
  hookCtx?: HookCtx;
  // Injectable connect/fetch for the connection provider's eager
  // realization (step 2b) — tests pass a fake MCP connect so the realized
  // <conn>__<tool> surface (and thus connection_search's discovery output) is
  // deterministic without a live server. Undefined in production → the
  // provider's real SDK-backed connect / global fetch.
  connectionOpts?: ConnectionProviderOpts;
  // Names of this session's deferred tools (agent.config.context.deferredTools)
  // that have already been activated (e.g. via ToolSearch — wired by a later
  // task alongside store.activateTools). Undefined/omitted is the same as
  // "none activated yet", not an error — callers that never wire session
  // activation state (or an agent with no deferredTools at all) simply never
  // see a deferred tool withheld-then-revealed.
  activatedTools?: string[];
  // Child-spawn capabilities for the `agent`/`agent_spawn`/`agent_wait`/...
  // built-ins — see spawn.ts's createSpawnCapabilities, built once per turn
  // by handler.ts's startTurn (both the session/turn path and /chat wire
  // it — see fix-round-1 in task-6-7-report.md). Optional only because the
  // TypeScript type must accommodate a caller that never sets it (mostly
  // unit tests exercising unrelated tools); the `agent` tool itself treats a
  // missing one as a wiring bug and rejects loudly rather than falling back
  // to anything — see agentTool.
  spawn?: SpawnCapabilities;
}

export function buildSystemPrompt(agent: LoadedAgent, metadata?: unknown): string {
  let prompt = agent.instructions;
  if (agent.skills.length > 0) {
    const list = agent.skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
    prompt += `\n\n## Skills\nOn-demand procedures. When one is relevant, load it with the skill tool before acting:\n${list}`;
  }
  if (metadata) prompt += `\n\n<context>\n${JSON.stringify(metadata)}\n</context>`;
  return prompt;
}

// Per-request system prompt resolution: buildSystemPrompt's result is
// the BASE handed to the buildInstructions hook (instructions + skills
// section + <context> metadata block, per the brief); the hook's return
// value is used verbatim when present. A configured hook with no hookCtx
// available (a caller that never wired one) fails loudly rather than
// silently skipping the hook — same never-fall-back-silently posture as
// resolveModelForTurn.
export async function resolveInstructions(agent: LoadedAgent, metadata: unknown, hookCtx?: HookCtx): Promise<string> {
  const base = buildSystemPrompt(agent, metadata);
  if (!agent.config.buildInstructions) return base;
  if (!hookCtx) {
    throw new Error("agents: buildInstructions hook configured but no request context (hookCtx) available");
  }
  return await agent.config.buildInstructions(base, hookCtx);
}

// Per-request user-message resolution, the buildUserMessage counterpart to
// resolveInstructions above. A configured hook with no hookCtx available
// fails loudly rather than silently skipping the hook — same
// never-fall-back-silently posture as resolveInstructions/resolveModelForTurn.
export async function resolveUserMessage(
  agent: LoadedAgent,
  base: string,
  hookCtx?: HookCtx,
): Promise<string> {
  if (!agent.config.buildUserMessage) return base;
  if (!hookCtx) {
    throw new Error("agents: buildUserMessage hook configured but no request context (hookCtx) available");
  }
  return await agent.config.buildUserMessage(base, hookCtx);
}

function authoredTool(name: string, def: any, ctx: ToolBuildCtx, isAuthored: boolean): any {
  const schema = isZodSchema(def.inputSchema) ? def.inputSchema : jsonSchema(def.inputSchema);
  if (def.clientOnly) {
    // No execute: the AI SDK surfaces the call and the turn ends with
    // finishReason "tool-calls" — the frontend renders it (proposal cards).
    return tool({ description: def.description, inputSchema: schema });
  }
  return tool({
    description: def.description,
    inputSchema: schema,
    execute: async (input: unknown) => {
      if (def.needsApproval) {
        const { store, turnId, emit, userId, plugin, agentName } = ctx;
        // A sticky decision short-circuits the one-shot flow entirely.
        // Only consulted when there's an identity to key it on — an
        // anonymous session (no userId, e.g. no x-user-id header) has no
        // consent to look up and always goes through the per-call approval
        // flow below, same as when there is no sticky consent at all.
        let consent: "always" | "never" | null = null;
        if (store && userId && plugin && agentName) {
          consent = await store.getToolConsent(userId, plugin, agentName, name);
        }
        if (consent === "never") {
          return { error: "denied by user" };
        }
        if (consent !== "always") {
          if (!store || !turnId || !emit) {
            return { error: "approval required — use the session API" };
          }
          const requestId = await store.createApproval(ctx.sessionId, turnId, name, input);
          emit({
            type: "input.requested",
            data: { turnId, requests: [{ requestId, action: { kind: "tool-call", callId: requestId, toolName: name, input } }] },
          });
          // 7 of 43 real gates were clicked after the 5-minute poll window had
          // already given up (median human response was ~15 minutes). Raised to
          // 30 minutes; ctx override (tests, other callers) is unchanged.
          const deadline = Date.now() + (ctx.approvalTimeoutMs ?? 1_800_000);
          let decision: string | null = null;
          while (Date.now() < deadline) {
            decision = await store.getApprovalDecision(requestId);
            if (decision) break;
            await new Promise((r) => setTimeout(r, ctx.approvalPollMs ?? 500));
          }
          if (decision !== "approve") {
            return { error: decision === "deny" ? "denied by user" : "approval timed out" };
          }
        }
      }
      // Hooks come from ctx.agent.config, so a subagent turn runs the
      // SUBAGENT's hooks — same posture as filterTools at depth 1.
      const cfg = ctx.agent?.config;
      let effectiveInput = input;
      if (cfg?.onToolCall) {
        // A configured hook with no hookCtx available is a caller wiring
        // bug, not a hook failure — throw loudly (same posture as
        // resolveInstructions' buildInstructions check) rather than
        // silently skipping a control whose entire purpose is to deny.
        if (!ctx.hookCtx) {
          throw new Error("agents: onToolCall hook configured but no request context (hookCtx) available");
        }
        let decision: { allow: boolean; input?: unknown; reason?: string };
        try {
          decision = await cfg.onToolCall({ name, input: effectiveInput }, ctx.hookCtx);
        } catch (err) {
          return { error: `onToolCall hook failed: ${err instanceof Error ? err.message : String(err)}` };
        }
        if (!decision?.allow) return { error: decision?.reason ?? "blocked by onToolCall hook" };
        if (decision.input !== undefined) effectiveInput = decision.input;
      }

      const result = await def.execute!(effectiveInput, {
        bearerToken: ctx.bearerToken,
        sessionId: ctx.sessionId,
        metadata: ctx.metadata,
        userId: ctx.userId,
        emit: ctx.toolEmit,
        // Expose the same sql fn resolveModel/buildInstructions get via
        // HookCtx.sql, so an authored (static, agent.tools) tool can query
        // Postgres without its own ambient pool. hookCtx is optional on
        // ToolBuildCtx (some callers never wire one), so this is undefined
        // rather than a throw when absent — same "safe to omit" posture as
        // emit/userId above. Provider-sourced (dynamic-tools.ts/MCP) tools
        // NEVER get sql — they're less trusted (arbitrary MCP servers), so raw
        // Postgres access is withheld; emit/userId/bearerToken stay available
        // to them since those are lower-privilege by design.
        sql: isAuthored ? ctx.hookCtx?.sql : undefined,
        // Task 15: the narrow "activate a deferred tool" capability (see
        // ToolContext.activateTools' own comment) -- bound to THIS session
        // only, never the raw store. undefined when no store was wired,
        // same "safe to omit" posture as sql above.
        activateTools: ctx.store
          ? (names: string[]) => ctx.store!.activateTools(ctx.sessionId, names)
          : undefined,
      });

      if (cfg?.onToolResult) {
        // Same wiring-bug-must-throw posture as onToolCall above.
        if (!ctx.hookCtx) {
          throw new Error("agents: onToolResult hook configured but no request context (hookCtx) available");
        }
        try {
          return await cfg.onToolResult({ name, input: effectiveInput, result }, ctx.hookCtx);
        } catch (err) {
          // Fail closed for the same reason as onToolCall: a result rewriter
          // that failed must not pass the raw result through as if it had
          // been inspected.
          return { error: `onToolResult hook failed: ${err instanceof Error ? err.message : String(err)}` };
        }
      }
      return result;
    },
  });
}

function skillTool(ctx: ToolBuildCtx): any {
  const { skills } = ctx.agent;
  return tool({
    description: `Load a skill (an on-demand procedure) by name and follow it. Available skills:\n` +
      skills.map((s) => `- ${s.name}: ${s.description}`).join("\n"),
    inputSchema: jsonSchema({
      type: "object",
      properties: { name: { type: "string", description: "skill name" } },
      required: ["name"],
    }),
    execute: async (input: unknown) => {
      const name = (input as { name?: string }).name;
      const skill = skills.find((s) => s.name === name);
      if (!skill) return { error: `unknown skill "${name}"`, available: skills.map((s) => s.name) };
      // EDN skills carry pre-extracted content; md skills read from disk.
      return { name: skill.name, content: skill.content ?? await Deno.readTextFile(skill.path) };
    },
  });
}

// Shared JSON Schema for the fork_turns parameter — reused by agent_spawn
// (Task 9) so both spawn paths describe the trade-off identically.
const FORK_TURNS_SCHEMA = {
  type: "string",
  description: 'How much of YOUR history to give the subagent: "none" (default) may leave it ' +
    'without context it needs; "all" gives it everything, at real token cost; or a number for the ' +
    "most recent N turns.",
};

type SubagentResolution =
  | { ok: true; target: LoadedAgent }
  | { ok: false; error: { error: string; available: string[] } };

// Shared by every id-taking spawn path (agentTool here; agent_spawn in Task
// 9) so the guard below cannot drift between them.
function resolveTarget(ctx: ToolBuildCtx, name?: string): SubagentResolution {
  const names = Object.keys(ctx.agent.subagents);
  // Object.hasOwn guards against a model-supplied "__proto__" or
  // "constructor" resolving through the prototype chain instead of a real
  // subagent entry — a plain `ctx.agent.subagents[name]` lookup would return
  // Object.prototype/Function itself for those names and crash the turn
  // (e.g. `.instructions` access downstream) instead of falling into the
  // ordinary "unknown subagent" result.
  const target = name
    ? (Object.hasOwn(ctx.agent.subagents, name) ? ctx.agent.subagents[name] : undefined)
    : ctx.agent;
  if (!target) return { ok: false, error: { error: `unknown subagent "${name}"`, available: names } };
  return { ok: true, target };
}

// Task 14: reducing only (codex role.rs) — a delegating session can never
// advertise a child MORE skills than it itself has. Called by handler.ts's
// buildSpawnCapabilities at the point it resolves which LoadedAgent will
// actually run the child's turn (NOT here in resolveTarget: that function's
// result is only used for validation/description text by agentTool/
// agent_spawn — the child's real turn re-resolves the subagent independently
// in handler.ts, so that is the only place a restriction actually takes
// effect). A self-delegation (`childAgent === parentAgent`, i.e. "delegate to
// a copy of yourself") is returned unchanged: there is nothing to reduce
// against, and re-filtering would be a costly no-op on the common path.
//
// The child's own skills/ directory stays authoritative for CONTENT (a
// child never gains a skill neither side loaded); `childAgent.config.skills`,
// when declared, further narrows which of the PARENT's names the child may
// use; left undeclared, the child inherits every name the parent currently
// has (resolveChildSkills' `undefined` case) — capped, either way, by what
// the child's own directory actually loaded.
//
// What this filters TODAY is the child's advertised skill list — the "##
// Skills" section of its system prompt and the built-in `skill` tool's own
// description (buildSystemPrompt/skillTool) — NOT a live privilege: this
// module's own buildSdkTools gates the `skill` tool behind `depth === 0`,
// and every child runs at depth 1, so a child cannot invoke any skill at
// all today regardless of this field. Kept anyway: if a later change ever
// lets a child invoke skills, THIS is the enforcement point that change
// must route through, not something to assume already covers it.
export function restrictChildSkills(parentAgent: LoadedAgent, childAgent: LoadedAgent): LoadedAgent {
  if (childAgent === parentAgent) return childAgent;
  const parentNames = parentAgent.skills.map((s) => s.name);
  const allowed = new Set(resolveChildSkills(parentNames, childAgent.config.skills));
  return { ...childAgent, skills: childAgent.skills.filter((s) => allowed.has(s.name)) };
}

// The other half of the spec's "tools and skills intersect the parent's,
// never union". Skills were intersected from the start; TOOLS were not
// intersected at all, so a subagent directory declaring tools/ entries its
// parent does not have handed the child strictly MORE capability than the
// session that delegated to it — the exact direction the reducing-only rule
// exists to forbid.
//
// This is a static intersection over the two LoadedAgents' authored tool
// maps, applied by handler.ts's buildSpawnCapabilities at the one point that
// decides which LoadedAgent runs the child's turn (the same place
// restrictChildSkills is applied, and for the same reason: the child's real
// turn re-resolves the subagent independently, so nothing decided in
// resolveTarget takes effect). It intentionally does NOT try to intersect
// the built-in/dynamic/connection tools buildSdkTools adds later: those are
// all gated on `depth === 0` and a child always runs at depth 1, so a child's
// built map is exactly its (now-intersected) authored tools, filtered by the
// filterTools hook under the PARENT's metadata (threaded in the same commit).
//
// Self-delegation (`childAgent === parentAgent`, "delegate to a copy of
// yourself") is returned unchanged — there is nothing to reduce against, and
// re-filtering would be a costly no-op on the common path.
export function restrictChildTools(parentAgent: LoadedAgent, childAgent: LoadedAgent): LoadedAgent {
  if (childAgent === parentAgent) return childAgent;
  const tools: Record<string, ToolDef> = {};
  for (const [name, def] of Object.entries(childAgent.tools)) {
    // The PARENT's definition never replaces the child's: a subagent is
    // allowed to narrow a tool it shares (its own needsApproval/description),
    // just never to introduce one the parent lacks.
    if (Object.hasOwn(parentAgent.tools, name)) tools[name] = def;
    else {
      console.log(
        `agents: subagent ${childAgent.dir} declares tool "${name}", which ${parentAgent.dir} does not have — ` +
          "dropped (a child's tools intersect its parent's, never union)",
      );
    }
  }
  return { ...childAgent, tools };
}

// Runs a delegated subtask as a real child session (see spawn.ts) and blocks
// for its result — the `agent` tool's contract (blocking, `{text}`) is
// unchanged; only the mechanism underneath it is now a durable session
// instead of an in-process nested loop. subagent.start/tool/end toolEmit
// events (one runId per invocation, same vocabulary the old in-process loop
// used) still fire: the child publishes actions.requested/action.result on
// its OWN session's live stream (runner.ts, via stream.ts's publish), same
// as any turn does, so this subscribes to that stream for the duration of
// the wait and translates them onto the PARENT's toolEmit channel.
async function runAsChild(
  ctx: ToolBuildCtx,
  name: string | null,
  prompt: string,
  forkTurns: string | undefined,
): Promise<{ text: string } | { error: string }> {
  const { agentId, nickname } = await ctx.spawn!.spawnChild({
    subagent: name,
    prompt,
    forkTurns: forkTurns ?? "none",
    // Blocking delegation must spawn NON-detached: a detached child queues
    // its completion as a followup on the parent and starts a redundant
    // parent turn the moment this (still-running) turn ends.
    detached: false,
  });
  const runId = agentId;
  ctx.toolEmit?.("subagent.start", { runId, agent: name ?? undefined, nickname });
  // No-op (not just unsubscribed) when nobody wired toolEmit — subscribing
  // to a stream nobody will ever read is pure overhead.
  const unsubscribe = ctx.toolEmit ? subscribe(agentId, (e: AgentEvent) => bridgeChildEvent(ctx, runId, e)) : undefined;
  let result: { text: string } | { error: string };
  try {
    result = await ctx.spawn!.awaitChild(agentId);
  } finally {
    unsubscribe?.();
  }
  ctx.toolEmit?.("subagent.end", { runId, nickname, ...result });
  return "error" in result ? { error: result.error } : { text: result.text };
}

// Translates the child's OWN tool-call/tool-result events (runner.ts emits
// these for every turn, parent or child alike) into the parent's
// subagent.tool toolEmit vocabulary. Best-effort: the child's turn also
// publishes turn.started/message.appended/etc, which have no subagent.*
// counterpart and are silently ignored here — this only ever needs the two
// action shapes runSubagent (now removed) used to report.
function bridgeChildEvent(ctx: ToolBuildCtx, runId: string, e: AgentEvent): void {
  if (e.type === "actions.requested") {
    for (const a of e.data.actions) {
      ctx.toolEmit?.("subagent.tool", { runId, callId: a.callId, name: a.toolName, input: a.input });
    }
  } else if (e.type === "action.result") {
    const r = e.data.result;
    ctx.toolEmit?.("subagent.tool", { runId, callId: r.callId, name: r.toolName, result: r.output });
  }
}

function agentTool(ctx: ToolBuildCtx): any {
  const names = Object.keys(ctx.agent.subagents);
  return tool({
    description: `Delegate a focused subtask to a subagent with fresh context and wait for its result. ` +
      (names.length ? `Named subagents: ${names.join(", ")}. ` : "") +
      `Omit "agent" to delegate to a copy of yourself.`,
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        agent: { type: "string", description: "subagent name (optional)" },
        prompt: { type: "string", description: "the subtask" },
        fork_turns: FORK_TURNS_SCHEMA,
      },
      required: ["prompt"],
    }),
    // Explicit Promise<unknown> return annotation: with ai@6's overloaded
    // `tool()` signature, inferring this execute's return type straight from
    // the union of branches (`{text}` vs `{error, available}`) makes
    // overload resolution fall through to the no-generics `Tool<never,never>`
    // arm and reject the JSON Schema inputSchema. Annotating sidesteps that
    // inference without changing runtime behavior.
    execute: (input: unknown): Promise<unknown> => {
      const { agent: name, prompt, fork_turns } = input as { agent?: string; prompt: string; fork_turns?: string };
      const resolved = resolveTarget(ctx, name);
      if (!resolved.ok) return Promise.resolve(resolved.error);
      // Both real routes (the session/turn path and /chat) always wire
      // ctx.spawn — see handler.ts's buildSpawnCapabilities. A caller that
      // doesn't is a wiring bug: fail loudly rather than silently reviving
      // the old in-process nested loop, which would let fork_turns/error
      // shape/progress-event behavior quietly diverge by call site again
      // (see fix-round-1 in task-6-7-report.md for why that was a bug, not
      // a feature).
      if (!ctx.spawn) {
        return Promise.reject(new Error("agents: the agent tool requires ctx.spawn to be wired"));
      }
      return runAsChild(ctx, name ?? null, prompt, fork_turns);
    },
  });
}

// The connection_search built-in: discovery over an agent's
// connection-backed tools. Closes over `toolMeta` — the <conn>__<tool> names +
// descriptions collected from the eager connection-provider merge (step 2b) —
// plus each connection's own description, and ranks them against the query.
// Discovery only: the matched tools are already realized and directly
// callable; this just helps the model NAME them (see connections/search.ts).
function connectionSearchTool(ctx: ToolBuildCtx, toolMeta: ConnectionToolMeta[]): any {
  const connectionDescriptions: Record<string, string> = {};
  for (const [name, conn] of Object.entries(ctx.agent.connections)) {
    connectionDescriptions[name] = conn.description;
  }
  return tool({
    description:
      "Search this agent's connection-backed tools by keyword to discover which ones to use. " +
      "Returns matching { name, description } entries; a returned name is \"<connection>__<tool>\" and is directly callable.",
    inputSchema: jsonSchema({
      type: "object",
      properties: { query: { type: "string", description: "keywords describing the capability you need" } },
      required: ["query"],
    }),
    execute: (input: unknown): Promise<unknown> => {
      const query = (input as { query?: string }).query ?? "";
      return Promise.resolve({ matches: searchConnectionTools(query, toolMeta, connectionDescriptions) });
    },
  });
}

// Synthetic ToolDefs for the two built-ins, used ONLY as the `def` argument
// handed to filterTools — not the real SDK tool (skillTool/agentTool
// build those directly, closing over `ctx`, since their description text is
// agent-specific). A filter deciding solely on `toolName` (the expected
// common case, e.g. devx's plan mode dropping "skill"/"agent" outright)
// never needs more than this; description/inputSchema here are placeholders.
const BUILTIN_SKILL_DEF: ToolDef = { description: "Load an on-demand skill by name (built-in).", inputSchema: { type: "object" } };
const BUILTIN_AGENT_DEF: ToolDef = { description: "Delegate to a subagent (built-in).", inputSchema: { type: "object" } };
const BUILTIN_CONNECTION_SEARCH_DEF: ToolDef = { description: "Search connection-backed tools by keyword (built-in).", inputSchema: { type: "object" } };
const BUILTIN_AGENT_SPAWN_DEF: ToolDef = { description: "Start a subagent and return immediately (built-in).", inputSchema: { type: "object" } };
const BUILTIN_AGENT_LIST_DEF: ToolDef = { description: "List the subagents you have started that are still running (built-in).", inputSchema: { type: "object" } };
const BUILTIN_AGENT_WAIT_DEF: ToolDef = { description: "Wait for a subagent to finish (built-in).", inputSchema: { type: "object" } };
const BUILTIN_AGENT_RESULT_DEF: ToolDef = { description: "Read a finished subagent's output (built-in).", inputSchema: { type: "object" } };
const BUILTIN_AGENT_STOP_DEF: ToolDef = { description: "Stop a subagent you started (built-in).", inputSchema: { type: "object" } };
const BUILTIN_AGENT_SEND_DEF: ToolDef = { description: "Send a message to a running subagent (built-in).", inputSchema: { type: "object" } };

// Caps a tool's output so no single call can push an unbounded blob into
// agents.steps or the model's context. Applied in buildSdkTools (core
// boundary), covering every agent — a plugin's own tool can no longer opt
// out. Result is left untouched (original shape) when it already fits;
// only an oversized result is stringified once and truncated, so a small
// object result never gets coerced to a string.
export function wrapToolWithCap<T extends { execute?: (...args: any[]) => Promise<unknown> }>(
  toolDef: T,
  config: ContextConfig,
): T {
  const inner = toolDef.execute;
  if (!inner) return toolDef; // clientOnly tools have no execute to wrap
  // truncateMiddle's maxChars bounds RETAINED CONTENT — its warning header
  // and omission marker are additional (truncate.ts). Passing the raw cap
  // therefore returns a string ~100 chars OVER it, which history.ts's fresh
  // tier (capped at the same number) then truncates a SECOND time: stacked
  // headers whose inner one reports the length of the already-truncated
  // text rather than the true original. That number is the header's whole
  // purpose — it is how the model decides to re-run with `| tail -50` — so a
  // wrong one defeats it. Subtract the overhead, as compact.ts already does.
  const cap = Math.max(0, config.freshToolOutputChars - TRUNCATION_HEADER_OVERHEAD);
  return {
    ...toolDef,
    execute: async (...args: any[]) => {
      const raw = await inner(...args);
      // JSON.stringify throws on a circular structure or a BigInt-bearing
      // result. Such a tool succeeded before this wrapper existed and must
      // keep succeeding: failing to MEASURE a result is not the tool
      // failing. Pass it through uncapped rather than turning a working tool
      // into a turn-killing throw over a size check.
      let text: string | undefined;
      try {
        text = typeof raw === "string" ? raw : JSON.stringify(raw);
      } catch (e) {
        console.warn("agents: tool result could not be serialized for capping, passing it through uncapped:", e);
        return raw;
      }
      if (text === undefined || text.length <= config.freshToolOutputChars) return raw;
      return truncateMiddle(text, cap);
    },
  };
}

// Approximate wire size of a built tool map, for the deferral before/after
// log (spec success criterion 4). Measures only what a provider actually
// serializes into the request — name, description, input schema — since the
// SDK tool object also carries an `execute` closure and provider-option
// markers that never reach the wire. A schema that cannot be stringified
// (a zod object with internal cycles) contributes its name+description only
// rather than throwing: this is a diagnostic, and must never be able to fail
// a turn.
function serializedToolBytes(tools: Record<string, any>): number {
  let bytes = 0;
  for (const [name, def] of Object.entries(tools)) {
    bytes += name.length + String(def?.description ?? "").length;
    const schema = def?.inputSchema?.jsonSchema ?? def?.inputSchema;
    try {
      bytes += JSON.stringify(schema)?.length ?? 0;
    } catch { /* unserializable schema — name+description only */ }
  }
  return bytes;
}

// Builds the AI SDK tool set for one buildSdkTools call. Order:
//  1. authored tools/*.ts (static, from the loader)
//  2. merge in agent.toolProvider's (dynamic-tools.ts) output — TOP LEVEL
//     (depth 0) ONLY; a provider error (thrown/rejected) or a missing
//     hookCtx is logged and the static set is used as-is, never failing the
//     turn (a broken MCP-backed provider must not be able to take down every
//     turn). Authored tools/*.ts win on a name collision — logged, not
//     silently dropped.
//  3. add the built-in `skill`/`agent` tools — also top-level only — unless
//     an authored or dynamic tool already claims that name.
//  4. apply agent.config.filterTools, if configured, to the FULL merged set
//     from steps 1-3 (built-ins included, per the brief — e.g. devx's plan
//     mode needs to be able to drop `agent`/`skill` themselves). Unlike step
//     2, a missing hookCtx here is a hard failure (thrown, not logged) and a
//     throwing filter propagates uncaught: filterTools is an authored
//     AgentConfig hook like resolveModel/buildInstructions, and shares their
//     posture of never silently keeping/dropping a tool the author didn't
//     actually decide on. Step 2 (dynamic-tools.ts provider) is depth-0
//     only by design (see below); step 4 (filterTools) still runs at depth
//     1 too, on a child session's own turn.
export async function buildSdkTools(ctx: ToolBuildCtx): Promise<Record<string, any>> {
  const { agent } = ctx;
  const depth = ctx.depth ?? 0;

  // Step 1+2: merge static + dynamic ToolDefs before building any SDK tool
  // objects, so a dynamic tool goes through the same authoredTool() path
  // (needsApproval/clientOnly honored) as a static one.
  const defs: Record<string, ToolDef> = { ...agent.tools };
  // Tracks which merged `defs` entries came from the dynamic provider (vs.
  // static agent.tools) so authoredTool can withhold ToolContext.sql from
  // provider-sourced tools — see authoredTool's `isAuthored` parameter.
  const dynamicNames = new Set<string>();
  // Names + descriptions of the realized connection tools, collected
  // from the eager provider merge below, handed to the connection_search
  // built-in for discovery ranking.
  const connToolMeta: ConnectionToolMeta[] = [];
  if (depth === 0 && agent.toolProvider) {
    if (!ctx.hookCtx) {
      console.log(`agents: ${agent.dir}/dynamic-tools.ts is configured but no request hookCtx was available — skipping dynamic tools for this turn`);
    } else {
      try {
        const dynamic = await agent.toolProvider(ctx.hookCtx);
        for (const [name, def] of Object.entries(dynamic)) {
          if (Object.hasOwn(defs, name)) {
            console.log(`agents: dynamic tool "${name}" from ${agent.dir}/dynamic-tools.ts shadowed by the authored tools/${name} file`);
            continue;
          }
          defs[name] = def;
          dynamicNames.add(name);
        }
      } catch (e) {
        console.error(`agents: ${agent.dir}/dynamic-tools.ts threw — continuing with static tools only: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Step 2b: connection-backed tools (connections/*.ts → MCP + static auth).
  // Same depth-0-only, log+continue posture as the dynamic provider
  // above — a broken connection never fails the turn (the provider also
  // catches per connection). Authored/static and dynamic tools win on a name
  // collision (`<conn>__<tool>` is namespaced, so collisions are unlikely).
  // Tracked in dynamicNames so authoredTool withholds ToolContext.sql from
  // these provider-sourced tools, exactly like the dynamic-tools path.
  if (depth === 0 && Object.keys(agent.connections).length > 0) {
    if (!ctx.hookCtx) {
      console.log(`agents: ${agent.dir} has connections but no request hookCtx was available — skipping connection tools for this turn`);
    } else {
      try {
        const connNames = Object.keys(agent.connections);
        const connProvider = buildConnectionProvider(agent, ctx.connectionOpts);
        const connTools = await connProvider(ctx.hookCtx);
        for (const [name, def] of Object.entries(connTools)) {
          if (Object.hasOwn(defs, name)) {
            console.log(`agents: connection tool "${name}" from ${agent.dir}/connections shadowed by an existing tool`);
            continue;
          }
          defs[name] = def;
          dynamicNames.add(name);
          // Prefix-match the owning connection (names are "<conn>__<tool>") so
          // connection_search can weight the connection's own description.
          const connection = connNames.find((c) => name.startsWith(`${c}__`)) ?? "";
          connToolMeta.push({ name, connection, description: def.description ?? "" });
        }
      } catch (e) {
        console.error(`agents: connection provider for ${agent.dir} threw — continuing without connection tools: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const out: Record<string, any> = {};
  const filterDefs: Record<string, ToolDef> = { ...defs };
  for (const [name, def] of Object.entries(defs)) {
    out[name] = authoredTool(name, def, ctx, !dynamicNames.has(name));
  }

  // Step 3: built-ins at top level only; authored/dynamic tools of the same
  // name win (already merged into `out`/`defs` above).
  if (depth === 0) {
    if (agent.skills.length > 0 && !out.skill) {
      out.skill = skillTool(ctx);
      filterDefs.skill = BUILTIN_SKILL_DEF;
    } else if (out.skill) {
      console.log("agents: a tool named \"skill\" overrides the built-in skill tool");
    }
    if (!out.agent) {
      out.agent = agentTool(ctx);
      filterDefs.agent = BUILTIN_AGENT_DEF;
    } else {
      console.log("agents: a tool named \"agent\" overrides the built-in agent tool");
    }
    // connection_search: only when the agent actually has connections;
    // an authored/dynamic tool of the same name (already in `out`) wins.
    if (Object.keys(agent.connections).length > 0 && !out.connection_search) {
      out.connection_search = connectionSearchTool(ctx, connToolMeta);
      filterDefs.connection_search = BUILTIN_CONNECTION_SEARCH_DEF;
    } else if (out.connection_search) {
      console.log("agents: a tool named \"connection_search\" overrides the built-in connection_search tool");
    }
    // agent_spawn/agent_list (and agent_wait/agent_stop/agent_send, Tasks
    // 10-12) are gated on ctx.spawn.allowDetached, NOT merely ctx.spawn being
    // truthy: /chat wires ctx.spawn too (for the BLOCKING `agent` tool above)
    // but its session is ephemeral — nothing will ever revisit it to observe
    // a detached child's result, so these tools must not even be offered
    // there. See spawn.ts's SpawnCapabilities.allowDetached.
    if (ctx.spawn?.allowDetached) {
      if (!out.agent_spawn) {
        out.agent_spawn = tool({
          description: "Start a subagent on a subtask and return immediately. Use agent_wait to " +
            "learn when it finishes, or agent (blocking) when you have nothing else to do meanwhile.",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              agent: { type: "string", description: "subagent name (optional)" },
              prompt: { type: "string", description: "the subtask" },
              fork_turns: FORK_TURNS_SCHEMA,
            },
            required: ["prompt"],
          }),
          execute: async (input: unknown): Promise<unknown> => {
            const { agent: name, prompt, fork_turns } = input as
              { agent?: string; prompt: string; fork_turns?: string };
            const resolved = resolveTarget(ctx, name);
            if (!resolved.ok) return resolved.error;
            const { agentId, nickname } = await ctx.spawn!.spawnChild({
              subagent: name ?? null,
              prompt,
              forkTurns: fork_turns ?? "none",
              detached: true,
            });
            return { agentId, nickname, subagent: name ?? null };
          },
        });
        filterDefs.agent_spawn = BUILTIN_AGENT_SPAWN_DEF;
      } else {
        console.log("agents: a tool named \"agent_spawn\" overrides the built-in agent_spawn tool");
      }

      if (!out.agent_list) {
        out.agent_list = tool({
          description: "List the subagents you have started that are still RUNNING, with their " +
            "nicknames and status. Finished ones are left out unless you pass " +
            "include_finished: true — use agent_result to read what a finished subagent produced.",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              include_finished: {
                type: "boolean",
                description: "also list subagents that have already finished, failed or been stopped " +
                  "(default false)",
              },
            },
          }),
          // Live-only by DEFAULT (the spec's tool table says "live children").
          // A session may spawn up to MAX_CHILDREN_PER_SESSION children over
          // its life, and an unfiltered listing puts every one of them —
          // overwhelmingly finished ones — into the model's context every
          // time it asks what is still running. The filter is applied in SQL
          // (store.listChildren's liveOnly), not by discarding rows here.
          execute: async (input: unknown): Promise<unknown> => {
            const { include_finished } = (input ?? {}) as { include_finished?: boolean };
            return { agents: await ctx.spawn!.listChildren({ liveOnly: include_finished !== true }) };
          },
        });
        filterDefs.agent_list = BUILTIN_AGENT_LIST_DEF;
      } else {
        console.log("agents: a tool named \"agent_list\" overrides the built-in agent_list tool");
      }

      if (!out.agent_wait) {
        out.agent_wait = tool({
          description: "Wait until one of your subagents finishes. Returns each finished agent " +
            "together with its OUTPUT (`result`, or `error` if it failed or was stopped). " +
            "Returns an empty list on timeout; that is not an error.",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              agent_ids: { type: "array", items: { type: "string" }, description: "omit to wait on all" },
              timeout_ms: { type: "number", description: `default ${WAIT_DEFAULT_MS}, max ${WAIT_MAX_MS}` },
            },
          }),
          execute: async (input: unknown): Promise<unknown> => {
            const { agent_ids, timeout_ms } = input as { agent_ids?: string[]; timeout_ms?: number };
            const updated = await ctx.spawn!.waitForChildren(agent_ids ?? null, timeout_ms ?? WAIT_DEFAULT_MS);
            // The output, not just the notification. deliverChildResult's
            // queued followup only ever lands on a LATER parent turn, and a
            // parent sitting inside agent_wait always has a running turn —
            // so without reading the result here a parent could learn WHICH
            // child finished but never WHAT it produced within its own turn.
            return {
              updated: await Promise.all(updated.map(async (c) => {
                const outcome = await ctx.spawn!.readChildResult(c.agentId);
                return {
                  agentId: c.agentId,
                  nickname: c.nickname,
                  status: c.status,
                  ...(outcome && "text" in outcome ? { result: outcome.text } : {}),
                  ...(outcome && "error" in outcome ? { error: outcome.error } : {}),
                };
              })),
              timedOut: updated.length === 0,
            };
          },
        });
        filterDefs.agent_wait = BUILTIN_AGENT_WAIT_DEF;
      } else {
        console.log("agents: a tool named \"agent_wait\" overrides the built-in agent_wait tool");
      }

      if (!out.agent_result) {
        out.agent_result = tool({
          description: "Read what one of your subagents produced. Only a FINISHED subagent has a " +
            "result; one that is still running returns { running: true }. Use agent_list to see " +
            "which of your subagents have finished.",
          inputSchema: jsonSchema({
            type: "object",
            properties: { agent_id: { type: "string" } },
            required: ["agent_id"],
          }),
          execute: async (input: unknown): Promise<unknown> => {
            const { agent_id } = input as { agent_id: string };
            const outcome = await ctx.spawn!.readChildResult(agent_id);
            // null covers both "still running" and "not yours / unknown" —
            // the same deliberate indistinguishability every other id-taking
            // spawn path has (see spawn.ts's ownership comments).
            if (!outcome) return { running: true };
            return outcome;
          },
        });
        filterDefs.agent_result = BUILTIN_AGENT_RESULT_DEF;
      } else {
        console.log("agents: a tool named \"agent_result\" overrides the built-in agent_result tool");
      }

      if (!out.agent_stop) {
        out.agent_stop = tool({
          description: "Abandon a subagent you started: its turn is marked failed and you will " +
            "never receive its result. This does NOT interrupt the subagent's worker — it keeps " +
            "running (and billing) until it finishes on its own, and whatever it produces is then " +
            "discarded. Returns the status it had when stopped.",
          inputSchema: jsonSchema({
            type: "object",
            properties: { agent_id: { type: "string" } },
            required: ["agent_id"],
          }),
          execute: async (input: unknown): Promise<unknown> => {
            const { agent_id } = input as { agent_id: string };
            try {
              return { previousStatus: await ctx.spawn!.stopChild(agent_id) };
            } catch (e) {
              return { error: e instanceof Error ? e.message : String(e) };
            }
          },
        });
        filterDefs.agent_stop = BUILTIN_AGENT_STOP_DEF;
      } else {
        console.log("agents: a tool named \"agent_stop\" overrides the built-in agent_stop tool");
      }

      if (!out.agent_send) {
        out.agent_send = tool({
          description: "Send a message to a subagent you started, while it is still running. There is no " +
            "\"next turn\" to queue it for — a message sent after the subagent finishes is never read.",
          inputSchema: jsonSchema({
            type: "object",
            properties: {
              agent_id: { type: "string" },
              message: { type: "string" },
            },
            required: ["agent_id", "message"],
          }),
          execute: async (input: unknown): Promise<unknown> => {
            const { agent_id, message } = input as { agent_id: string; message: string };
            return await ctx.spawn!.sendToChild(agent_id, message);
          },
        });
        filterDefs.agent_send = BUILTIN_AGENT_SEND_DEF;
      } else {
        console.log("agents: a tool named \"agent_send\" overrides the built-in agent_send tool");
      }
    }
  }

  // Step 4: filterTools sees the complete merged set, built-ins included.
  if (agent.config.filterTools) {
    if (!ctx.hookCtx) {
      throw new Error("agents: filterTools hook configured but no request context (hookCtx) available");
    }
    const hookCtx = ctx.hookCtx;
    for (const name of Object.keys(out)) {
      if (!agent.config.filterTools(name, filterDefs[name], hookCtx)) delete out[name];
    }
  }

  // Step 5: cap every surviving tool's output (authored, dynamic, built-in
  // alike). A child session's own turn goes through this too, via its own
  // top-level runTurn -> buildSdkTools call (depth 1, derived from
  // parent_session_id — see handler.ts's startTurn) — no extra plumbing
  // needed.
  for (const name of Object.keys(out)) {
    out[name] = wrapToolWithCap(out[name], agent.config.context);
  }

  // Step 6: deferred-tool withholding + cache breakpoint (Tasks 13/14).
  // Gated on deferredTools actually being non-empty: every existing agent
  // defaults to deferredTools: [] (DEFAULT_CONTEXT_CONFIG), and for that
  // case this step must be a no-op producing the EXACT SAME `out` as before
  // — partitionTools/withToolCachePoint are new mechanism, and unconditionally
  // running them would put a fresh providerOptions.cacheControl/cachePoint
  // marker on the last tool of every anthropic/bedrock-backed agent, a
  // behaviour change never requested for agents that defer nothing.
  const { deferredTools } = agent.config.context;
  if (deferredTools.length > 0) {
    // Spec success criterion 4: the payload reduction must be "logged as a
    // byte count before and after". Measured on the serialized tool map,
    // which is what actually goes on the wire. console.log to match the
    // rest of this file's logging convention, and only inside this branch —
    // an agent that defers nothing (every agent but devx) never reaches it,
    // so this adds no per-request noise to the default configuration.
    const bytesBefore = serializedToolBytes(out);
    const countBefore = Object.keys(out).length;
    const { core, activated } = partitionTools(out, ctx.activatedTools ?? [], deferredTools);
    const withBreakpoint = withToolCachePoint(ctx.model, core, activated);
    for (const name of Object.keys(out)) delete out[name];
    Object.assign(out, withBreakpoint);
    const bytesAfter = serializedToolBytes(out);
    console.log(
      `agents: ${agent.dir} tool payload ${bytesBefore} -> ${bytesAfter} bytes, ` +
        `${countBefore} -> ${Object.keys(out).length} tools (${activated.length} activated)`,
    );
  }

  return out;
}
