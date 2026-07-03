// Builds the AI SDK tool set for an agent: authored tools (clientOnly /
// needsApproval / plain) plus the built-in `skill` and `agent` tools.
// Shared by runner.ts (session API) and handler.ts (/chat) so the two
// endpoints cannot drift. Spec §3 (skills/subagents) + §4 (extensions).
// deno-lint-ignore-file no-explicit-any
import { streamText, tool, jsonSchema, stepCountIs } from "ai";
import { resolveModel } from "./model.ts";
import { isZodSchema } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import type { AgentEvent } from "./events.ts";

export interface ToolBuildCtx {
  agent: LoadedAgent;
  sessionId: string;
  metadata?: unknown;
  bearerToken?: string;
  model?: any;
  store?: AgentStore;
  turnId?: string;
  emit?: (e: AgentEvent) => void;
  approvalPollMs?: number;
  approvalTimeoutMs?: number;
  depth?: number;
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

function authoredTool(name: string, def: any, ctx: ToolBuildCtx): any {
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
        const { store, turnId, emit } = ctx;
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
      return await def.execute!(input, { bearerToken: ctx.bearerToken, sessionId: ctx.sessionId, metadata: ctx.metadata });
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
  const result = streamText({
    model,
    system: buildSystemPrompt(target, ctx.metadata),
    messages: [{ role: "user" as const, content: prompt }],
    tools: buildSdkTools({ ...ctx, agent: target, depth: 1 }),
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

export function buildSdkTools(ctx: ToolBuildCtx): Record<string, any> {
  const out: Record<string, any> = {};
  const depth = ctx.depth ?? 0;
  for (const [name, def] of Object.entries(ctx.agent.tools)) {
    out[name] = authoredTool(name, def, ctx);
  }
  // Built-ins at top level only; authored tools of the same name win.
  if (depth === 0) {
    if (ctx.agent.skills.length > 0 && !out.skill) out.skill = skillTool(ctx);
    else if (out.skill) console.log("agents: authored tools/skill.ts overrides the built-in skill tool");
    if (!out.agent) out.agent = agentTool(ctx);
    else console.log("agents: authored tools/agent.ts overrides the built-in agent tool");
  }
  return out;
}
