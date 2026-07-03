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
          // eve's message.appended carries both the incremental delta and the
          // cumulative text so far as `messageSoFar` (see COMPAT.md); the
          // one-shot message.completed (final text, once the turn ends) is
          // emitted separately below in the "finish" case. We still don't
          // emit reasoning.appended/reasoning.completed — no model-reasoning
          // surface wired.
          emit({ type: "message.appended", data: { turnId, messageDelta: delta, messageSoFar: text } });
          break;
        }
        case "tool-call": {
          const p = part as any;
          const clientOnly = clientOnlyNames.has(p.toolName) || undefined;
          emit({
            type: "actions.requested",
            data: { turnId, actions: [{ kind: "tool-call", callId: p.toolCallId, toolName: p.toolName, input: p.input, clientOnly }] },
          });
          await persist(clientOnly ? "client-tool-call" : "tool-call", p.toolName, { toolCallId: p.toolCallId, input: p.input });
          break;
        }
        case "tool-result": {
          const p = part as any;
          emit({
            type: "action.result",
            data: { turnId, result: { kind: "tool-result", callId: p.toolCallId, toolName: p.toolName, output: p.output }, status: "completed" },
          });
          await persist("tool-result", p.toolName, { toolCallId: p.toolCallId, output: p.output });
          break;
        }
        case "finish": {
          const p = part as any;
          finishReason = p.finishReason ?? "stop";
          const usage = { inputTokens: p.totalUsage?.inputTokens, outputTokens: p.totalUsage?.outputTokens };
          // eve's client only reads the final reply off message.completed
          // (see events.ts) — emit it once, right before turn.completed,
          // when this turn actually produced text (a pure tool-call step
          // that stops here with no trailing text has nothing to report).
          if (text) {
            emit({ type: "message.completed", data: { turnId, message: text, finishReason } });
          }
          emit({ type: "turn.completed", data: { turnId, usage, finishReason } });
          await persist("finish", null, { finishReason }, usage);
          break;
        }
        case "error": {
          const message = String((part as any).error ?? "unknown model error");
          emit({ type: "turn.failed", data: { turnId, message } });
          await persist("error", null, { message });
          throw new Error(message);
        }
      }
    }
  } finally {
    // finishReason travels with the persisted text so a replayed session can
    // reconstruct message.completed's finishReason (see handler.ts's
    // stepToEvent) the same way the live tail does above.
    if (text) await persist("text", null, { text, finishReason });
  }
  return { text, finishReason };
}
