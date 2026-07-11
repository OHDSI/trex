// The shared agent loop (spec §5): one call = one turn. Wraps AI SDK
// streamText with the agent's tool set (see toolset.ts); persists every step
// via the store AND emits live events. Extracted/adapted from
// plugins/devx/functions/agent.ts.
// deno-lint-ignore-file no-explicit-any
import { streamText, stepCountIs } from "ai";
import { resolveModelForTurn } from "./model.ts";
import type { HookCtx, ToolDef } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import type { AgentEvent } from "./events.ts";
import { buildSdkTools, resolveInstructions } from "./toolset.ts";

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
  userId?: string;
  // H4: threaded through to ToolBuildCtx via this function's `{ ...opts,
  // model, toolEmit }` spread into buildSdkTools below — see toolset.ts's
  // ToolBuildCtx.plugin/agentName. Set by handler.ts's startTurn from its
  // Deps {plugin, agentName}.
  plugin?: string;
  agentName?: string;
  // Per-request context for the agent's resolveModel/buildInstructions
  // hooks (H1). Optional so existing callers/tests that never touch hooks
  // (no agent.config.resolveModel/buildInstructions) keep working unchanged
  // — resolveModelForTurn/resolveInstructions only require it when a hook
  // is actually configured.
  hookCtx?: HookCtx;
  approvalPollMs?: number;
  approvalTimeoutMs?: number;
}

export async function runTurn(opts: RunTurnOpts): Promise<{ text: string; finishReason: string }> {
  const { agent, store, emit, turnId } = opts;
  // opts.model is a test/deps override and always wins; otherwise resolution
  // order is config.resolveModel(hookCtx) → config.model → env (see
  // model.ts's resolveModelForTurn). A rejecting hook propagates here,
  // uncaught — the caller (handler.ts's startTurn) turns that into a
  // turn.failed/session.failed pair, same as any other pre-stream failure.
  const model = opts.model ?? await resolveModelForTurn(agent.config, opts.hookCtx);
  const system = await resolveInstructions(agent, opts.metadata, opts.hookCtx);
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

  // H3: ToolContext.emit's session-path channel. A tool's execute() calls
  // this synchronously (fire-and-forget — see eve-shim/types.ts's
  // ToolContext.emit); it publishes the same live `tool.event` a subscriber
  // to the session stream gets, and persists a `custom` step through the
  // SAME stepSeq counter `persist` (above) closes over — the `++stepSeq`
  // assignment happens synchronously at call time, so seq numbers stay
  // unique/monotonic regardless of exactly when this fires
  // (V2__custom_steps.sql widens agents.steps.kind's CHECK to allow
  // 'custom'). NOT guaranteed to land seq-between the tool-call and
  // tool-result step of the SAME tool invocation: the AI SDK invokes
  // tool.execute() as part of its own internal step processing, which can
  // run concurrently with — and finish ahead of — this loop's `await
  // persist("tool-call", ...)` for the very call that triggered it (verified
  // empirically: a synchronous mock tool's emit can land at a lower seq than
  // its own tool-call step). Replay is still correct either way (seq order
  // IS call order, whatever that turns out to be) — just not intuitively
  // "nested inside" the tool-call/tool-result pair. Not awaited by design —
  // persist() already swallows/logs its own failures, so a slow or failing
  // write here never blocks the tool or leaks an unhandled rejection into
  // the turn.
  const toolEmit = (name: string, data: unknown) => {
    emit({ type: "tool.event", data: { name, payload: data } });
    persist("custom", name, data);
  };

  // H2: async now that a top-level dynamic-tools.ts provider may need to run
  // (opts already carries hookCtx — see RunTurnOpts — so ToolBuildCtx picks
  // it up via the spread).
  const tools = await buildSdkTools({ ...opts, model, toolEmit });
  const result = streamText({
    model,
    system,
    messages,
    tools,
    stopWhen: stepCountIs(agent.config.maxSteps ?? 25),
  });

  let text = "";
  let finishReason = "unknown";
  let textPersisted = false;
  // Persist the final assistant text exactly once. Called from the "finish"
  // case BEFORE the "finish" step so the stored seq order (text → finish)
  // matches the live emit order (message.completed → turn.completed) —
  // stepToEvent replays steps in seq order, and eve clients depend on
  // message.completed arriving before the turn boundary (see events.ts).
  // The finally-block call is the error/early-exit fallback for turns that
  // streamed text but never reached a "finish" part.
  const persistText = async () => {
    if (textPersisted || !text) return;
    textPersisted = true;
    // finishReason travels with the persisted text so a replayed session can
    // reconstruct message.completed's finishReason (see handler.ts's
    // stepToEvent) the same way the live tail does above.
    await persist("text", null, { text, finishReason });
  };
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
          // Persist text BEFORE finish so replay (seq-ordered) preserves the
          // live message.completed → turn.completed order (see persistText).
          await persistText();
          await persist("finish", null, { finishReason }, usage);
          break;
        }
        case "error": {
          const message = String((part as any).error ?? "unknown model error");
          // No turn.failed emit here: handler.ts's startTurn catch owns the
          // turn-lifecycle events (it emits exactly one turn.failed +
          // session.failed per failed turn); emitting here too produced a
          // duplicate turn.failed on the wire. The error *step* is still
          // persisted here so replay reconstructs the failure.
          await persist("error", null, { message });
          throw new Error(message);
        }
      }
    }
  } finally {
    // Error/early-exit fallback only — a normal turn already persisted its
    // text in the "finish" case above (persistText is idempotent).
    await persistText();
  }
  return { text, finishReason };
}
