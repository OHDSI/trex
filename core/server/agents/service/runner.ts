// The shared agent loop (spec §5): one call = one turn. Wraps AI SDK
// streamText with the agent's tool set (see toolset.ts); persists every step
// via the store AND emits live events. Extracted/adapted from
// plugins/devx/functions/agent.ts.
// deno-lint-ignore-file no-explicit-any
import { streamText, stepCountIs } from "ai";
import { resolveModel } from "./model.ts";
import type { ToolDef } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import type { AgentEvent } from "./events.ts";
import { buildSdkTools, buildSystemPrompt } from "./toolset.ts";

interface RunTurnOpts {
  agent: LoadedAgent;
  sessionId: string;
  turnId: string;
  history: any[];
  message: unknown;
  metadata?: unknown;
  store: AgentStore;
  emit: (e: AgentEvent) => void;
  model?: any;
  bearerToken?: string;
  approvalPollMs?: number;
  approvalTimeoutMs?: number;
}

export async function runTurn(opts: RunTurnOpts): Promise<{ text: string; finishReason: string }> {
  const { agent, store, emit, turnId } = opts;
  const model = opts.model ?? resolveModel(agent.config.model);
  const userContent = typeof opts.message === "string" ? opts.message : JSON.stringify(opts.message);
  const messages = [...opts.history, { role: "user" as const, content: userContent }];

  let stepSeq = 0;
  const persist = (kind: string, name: string | null, payload: unknown, usage?: unknown) =>
    store.addStep(turnId, ++stepSeq, kind, name, payload, usage).catch((e) =>
      console.error("agents: step persist failed:", e)
    );

  const clientOnlyNames = new Set(
    Object.entries(agent.tools).filter(([, d]) => (d as ToolDef).clientOnly).map(([n]) => n),
  );

  const result = streamText({
    model,
    system: buildSystemPrompt(agent, opts.metadata),
    messages,
    tools: buildSdkTools({ ...opts, model }),
    stopWhen: stepCountIs(agent.config.maxSteps ?? 25),
  });

  let text = "";
  let finishReason = "unknown";
  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          const delta = (part as any).text ?? (part as any).delta ?? "";
          text += delta;
          emit({ type: "text-delta", delta });
          break;
        }
        case "tool-call": {
          const p = part as any;
          const clientOnly = clientOnlyNames.has(p.toolName) || undefined;
          emit({ type: "tool-call", toolCallId: p.toolCallId, toolName: p.toolName, input: p.input, clientOnly });
          await persist(clientOnly ? "client-tool-call" : "tool-call", p.toolName, { toolCallId: p.toolCallId, input: p.input });
          break;
        }
        case "tool-result": {
          const p = part as any;
          emit({ type: "tool-result", toolCallId: p.toolCallId, toolName: p.toolName, output: p.output });
          await persist("tool-result", p.toolName, { toolCallId: p.toolCallId, output: p.output });
          break;
        }
        case "finish": {
          const p = part as any;
          finishReason = p.finishReason ?? "stop";
          const usage = { inputTokens: p.totalUsage?.inputTokens, outputTokens: p.totalUsage?.outputTokens };
          emit({ type: "turn-finish", usage, finishReason });
          await persist("finish", null, { finishReason }, usage);
          break;
        }
        case "error": {
          const message = String((part as any).error ?? "unknown model error");
          emit({ type: "error", message });
          await persist("error", null, { message });
          throw new Error(message);
        }
      }
    }
  } finally {
    if (text) await persist("text", null, { text });
  }
  return { text, finishReason };
}
