// Builds the AI SDK tool set for an agent: authored tools (clientOnly /
// needsApproval / plain) plus the built-in `skill` and `agent` tools.
// Shared by runner.ts (session API) and handler.ts (/chat) so the two
// endpoints cannot drift. Spec §3 (skills/subagents) + §4 (extensions).
// deno-lint-ignore-file no-explicit-any
import { streamText, tool, jsonSchema, stepCountIs } from "ai";
import { resolveModel } from "./model.ts";
import { isZodSchema } from "../eve-shim/types.ts";
import type { HookCtx, ToolDef } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import type { AgentEvent } from "./events.ts";

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
  // H3: wired per-endpoint (session runner: publish `tool.event` + persist a
  // `custom` step, see runner.ts's toolEmit; /chat: write an interleaved
  // `data-${name}` UIMessage part, see handler.ts) and handed to every
  // authored tool's execute() as ToolContext.emit (see authoredTool below).
  // Distinct from `emit` above, which carries the session-lifecycle
  // AgentEvent channel (approvals etc.) — toolEmit is the tool-authored
  // (name, data) channel. Undefined when the caller never wired one;
  // authoredTool passes it through as-is, matching ToolContext.emit's "safe
  // no-op when unwired" contract (eve-shim/types.ts) since an absent field
  // makes `ctx?.emit?.(...)` a no-op at the call site, not a throw here.
  // Inherited by subagent runs (depth 1) via runSubagent's `{ ...ctx }`
  // spread below — a subagent's tool.event lands on the SAME channel
  // (session stream / chat writer) as its parent's, not a distinct one.
  toolEmit?: (name: string, data: unknown) => void;
  approvalPollMs?: number;
  approvalTimeoutMs?: number;
  depth?: number;
  // H4 (sticky tool-consent decisions — task-h4-brief.md): the key
  // authoredTool's needsApproval branch looks up store.getToolConsent
  // under, alongside userId and the tool's own name. Set by handler.ts from
  // its Deps {plugin, agentName} at every buildSdkTools call site (both the
  // session-runner path, via RunTurnOpts's spread into this ctx, and
  // /chat's direct buildSdkTools call). Optional so existing callers that
  // never touch needsApproval tools (or don't care about stickiness) keep
  // working — the sticky lookup is skipped whenever either is missing, same
  // as when userId itself is missing (anonymous session).
  plugin?: string;
  agentName?: string;
  // H2: threaded through so buildSdkTools can call agent.toolProvider and
  // agent.config.filterTools with the same per-request context
  // resolveModel/buildInstructions already get (see handler.ts's
  // buildHookCtx). Reusing HookCtx here — instead of adding a parallel
  // "dynamic tools ctx" shape — keeps one request-context type across every
  // agent.ts/dynamic-tools.ts hook.
  hookCtx?: HookCtx;
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

// Per-request system prompt resolution (H1): buildSystemPrompt's result is
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
        // H4: a sticky decision short-circuits the one-shot flow entirely.
        // Only consulted when there's an identity to key it on — an
        // anonymous session (no userId, e.g. no x-user-id header) has no
        // consent to look up and always goes through the per-call approval
        // flow below, same as before H4.
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
          const deadline = Date.now() + (ctx.approvalTimeoutMs ?? 300_000);
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
      return await def.execute!(input, {
        bearerToken: ctx.bearerToken,
        sessionId: ctx.sessionId,
        metadata: ctx.metadata,
        userId: ctx.userId,
        emit: ctx.toolEmit,
        // H1 follow-up: expose the same sql fn resolveModel/buildInstructions
        // get via HookCtx.sql, so an authored (static, agent.tools) tool can
        // query Postgres without its own ambient pool. hookCtx is optional on
        // ToolBuildCtx (some callers never wire one), so this is undefined
        // rather than a throw when absent — same "safe to omit" posture as
        // emit/userId above. Provider-sourced (dynamic-tools.ts/MCP) tools
        // NEVER get sql — they're less trusted (arbitrary MCP servers), so
        // raw Postgres access is withheld; emit/userId/bearerToken stay
        // available to them since those are lower-privilege by design.
        sql: isAuthored ? ctx.hookCtx?.sql : undefined,
      });
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

// Runs a subagent (or a copy of the current agent) as a nested loop with
// fresh history. Nested activity is not streamed step-by-step in v1 — the
// outer agent tool-call/tool-result events carry prompt and result.
async function runSubagent(target: LoadedAgent, prompt: string, ctx: ToolBuildCtx): Promise<{ text: string }> {
  // A subagent's own declared model wins; otherwise inherit the caller's
  // (already-resolved) model, resolving the parent's string as last resort.
  const model = target.config.model
    ? resolveModel(target.config.model)
    : ctx.model ?? resolveModel(ctx.agent.config.model);
  // H2: depth: 1 suppresses the target's own dynamic-tools.ts provider (a
  // top-level-only concern, same rationale as skill/agent built-ins being
  // top-level-only — see buildSdkTools) but NOT target.config.filterTools,
  // which still runs against depth-1's (smaller) tool set using the same
  // hookCtx carried in via the ...ctx spread.
  const tools = await buildSdkTools({ ...ctx, agent: target, depth: 1 });
  const result = streamText({
    model,
    system: buildSystemPrompt(target, ctx.metadata),
    messages: [{ role: "user" as const, content: prompt }],
    tools,
    stopWhen: stepCountIs(target.config.maxSteps ?? 25),
  });
  return { text: await result.text };
}

function agentTool(ctx: ToolBuildCtx): any {
  const names = Object.keys(ctx.agent.subagents);
  return tool({
    description: `Delegate a focused subtask to a subagent with fresh context. ` +
      (names.length ? `Named subagents: ${names.join(", ")}. ` : "") +
      `Omit "agent" to delegate to a copy of yourself.`,
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        agent: { type: "string", description: "subagent name (optional)" },
        prompt: { type: "string", description: "the subtask" },
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
      const { agent: name, prompt } = input as { agent?: string; prompt: string };
      // Object.hasOwn guards against a model-supplied "__proto__" or
      // "constructor" resolving through the prototype chain instead of a
      // real subagent entry — a plain `ctx.agent.subagents[name]` lookup
      // would return Object.prototype/Function itself for those names and
      // crash the turn (e.g. `.instructions` access downstream) instead of
      // falling into the ordinary "unknown subagent" result.
      const target = name
        ? (Object.hasOwn(ctx.agent.subagents, name) ? ctx.agent.subagents[name] : undefined)
        : ctx.agent;
      if (!target) {
        return Promise.resolve({ error: `unknown subagent "${name}"`, available: names });
      }
      return runSubagent(target, prompt, ctx);
    },
  });
}

// Synthetic ToolDefs for the two built-ins, used ONLY as the `def` argument
// handed to filterTools (H2) — not the real SDK tool (skillTool/agentTool
// build those directly, closing over `ctx`, since their description text is
// agent-specific). A filter deciding solely on `toolName` (the expected
// common case, e.g. devx's plan mode dropping "skill"/"agent" outright)
// never needs more than this; description/inputSchema here are placeholders.
const BUILTIN_SKILL_DEF: ToolDef = { description: "Load an on-demand skill by name (built-in).", inputSchema: { type: "object" } };
const BUILTIN_AGENT_DEF: ToolDef = { description: "Delegate to a subagent (built-in).", inputSchema: { type: "object" } };

// Builds the AI SDK tool set for one buildSdkTools call. Order (H2, spec
// task-h2-brief.md):
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
//     actually decide on. See runSubagent for why step 2 is skipped but
//     step 4 still runs at subagent depth (1).
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

  return out;
}
