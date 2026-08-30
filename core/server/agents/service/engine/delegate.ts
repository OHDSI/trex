// The second way to execute a turn: hand it to an external engine that runs
// its OWN agentic loop (the claude-code sidecar today) and translate what it
// streams back, instead of runner.ts driving streamText over eve's tools.
// A delegated turn must persist what a runner.ts turn persists, row for row —
// the dashboard, /stream, claw's transport and history.ts's replay all read
// whichever path wrote them; every divergence is commented where it happens.
import type { AgentEngine, HookCtx } from "../../eve-shim/types.ts";
import type { LoadedAgent } from "../../loader.ts";
import type { AgentStore } from "../store.ts";
import type { AgentEvent } from "../events.ts";
import { resolveUserMessage } from "../toolset.ts";
import { createSdkTranslator } from "./events.ts";

// No `history`, unlike RunTurnOpts: the engine keeps its own transcript across
// turns (the sidecar resumes its session), so replaying eve's assembled
// history into the prompt would duplicate it rather than supply it.
export interface DelegatedTurnOpts {
  agent: LoadedAgent;
  engine: AgentEngine;
  sessionId: string;
  turnId: string;
  message: unknown;
  metadata?: unknown;
  store: Pick<AgentStore, "addStep">;
  emit: (e: AgentEvent) => void;
  hookCtx?: HookCtx;
  // Handed to the engine, which is the only thing here that can be mid-flight
  // for minutes — same seam as runTurn's abortSignal into streamText.
  abortSignal?: AbortSignal;
}

// The engine for THIS turn, or undefined to run runner.ts's model loop. A
// rejecting hook fails the turn rather than falling back to that loop, which
// would run on the wrong credentials and the wrong tools (resolveModel posture).
export async function resolveEngineForTurn(
  agent: LoadedAgent,
  hookCtx?: HookCtx,
): Promise<AgentEngine | undefined> {
  if (!agent.config.resolveEngine) return undefined;
  if (!hookCtx) {
    throw new Error("agents: resolveEngine hook configured but no request context (hookCtx) available");
  }
  return await agent.config.resolveEngine(hookCtx);
}

export async function runDelegatedTurn(opts: DelegatedTurnOpts): Promise<{ text: string; finishReason: string }> {
  const { agent, engine, store, emit, turnId } = opts;

  let stepSeq = 0;
  const persist = (kind: string, name: string | null, payload: unknown, usage?: unknown) =>
    store.addStep(turnId, ++stepSeq, kind, name, payload, usage).catch((e) =>
      console.error("agents: step persist failed:", e)
    );

  const rawUserContent = typeof opts.message === "string" ? opts.message : JSON.stringify(opts.message);
  const prompt = await resolveUserMessage(agent, rawUserContent, opts.hookCtx);

  // Created HERE, per turn: the translator carries tool_use_id -> toolName
  // correlation state, and a translator shared across turns would recover a
  // previous turn's tool name for a colliding id.
  const translate = createSdkTranslator();

  let text = "";
  // The engine has no step boundaries on the wire, but each assistant text
  // message is one step of its loop — so the last one is what runner.ts's
  // lastStepText means (spawn.ts's awaitChild is its only reader).
  let lastStepText = "";
  let finishReason = "unknown";
  let textPersisted = false;
  let sawAnyToolCall = false;
  let closed = false;
  let errorPersisted = false;

  const persistText = async () => {
    if (textPersisted || !text) return;
    textPersisted = true;
    await persist("text", null, { text, finishReason, lastStepText });
  };

  // Persist the error step and throw, exactly as runner.ts's "error" stream
  // part does: the throw is what makes handler.ts's catch fail the turn, so a
  // failing engine can never leave one `running`. No turn.failed emit — that
  // catch owns the event, and emitting here would duplicate it on the wire.
  const failTurn = async (message: string): Promise<never> => {
    if (!errorPersisted) {
      errorPersisted = true;
      await persist("error", null, { message });
    }
    throw new Error(message);
  };

  try {
    try {
      for await (
        const m of engine.run({
          sessionId: opts.sessionId,
          turnId,
          prompt,
          metadata: opts.metadata,
          signal: opts.abortSignal,
        })
      ) {
        const event = translate(m);
        // null is a deliberately dropped message kind (see events.ts), not an
        // error — the engine streams far more than eve has a vocabulary for.
        if (!event) continue;
        switch (event.type) {
          case "message.appended": {
            const delta = event.data.messageDelta;
            text += delta;
            lastStepText = delta;
            // messageSoFar must be cumulative across the whole turn; the
            // translator can only see the one message it was handed.
            emit({ type: "message.appended", data: { turnId, messageDelta: delta, messageSoFar: text } });
            break;
          }
          case "actions.requested": {
            sawAnyToolCall = true;
            emit({ type: "actions.requested", data: { turnId, actions: event.data.actions } });
            // One row per call: the engine can request several in one message,
            // where runner.ts only ever sees one part at a time.
            for (const a of event.data.actions) {
              await persist("tool-call", a.toolName, { toolCallId: a.callId, input: a.input });
            }
            break;
          }
          case "action.result": {
            const result = event.data.result;
            emit({ type: "action.result", data: { turnId, result, status: event.data.status } });
            await persist("tool-result", result.toolName, { toolCallId: result.callId, output: result.output });
            break;
          }
          case "turn.failed":
            await failTurn(event.data.message);
            break;
          case "turn.completed": {
            closed = true;
            finishReason = event.data.finishReason ?? "stop";
            // No lastStepInputTokens: the engine reports ONE cumulative usage,
            // and getLastTurnUsage reads that field as a context-window size —
            // a total there re-summarizes before every turn (see runner.ts).
            const usage = event.data.usage;
            if (text) {
              emit({ type: "message.completed", data: { turnId, message: text, finishReason } });
            } else if (!sawAnyToolCall) {
              // runner.ts's no-silent-turn fallbacks, verbatim (its clientOnly
              // and postsToChannel branches have no counterpart: the engine's
              // tools are its own, with no ToolDef flags to read).
              text = 'That step finished without producing a reply. Nothing was changed — say "retry" and I\'ll run it again.';
              emit({ type: "message.completed", data: { turnId, message: text, finishReason } });
            } else {
              text = 'That step ended without a reply. Say "retry" and I\'ll run it again.';
              emit({ type: "message.completed", data: { turnId, message: text, finishReason } });
            }
            emit({ type: "turn.completed", data: { turnId, usage, finishReason } });
            // Text BEFORE finish so seq-ordered replay preserves the live
            // message.completed -> turn.completed order.
            await persistText();
            await persist("finish", null, { finishReason }, usage);
            break;
          }
          default:
            // context.compacted and anything else turn-agnostic: live-only,
            // never persisted by runner.ts either.
            emit(event);
        }
        // The terminal event ends the turn exactly once; breaking also closes
        // the engine's stream (for-await calls its return()), so a talkative
        // engine cannot reopen a turn that is already finished.
        if (closed) break;
      }
      if (!closed) {
        await failTurn(`agents: engine ${engine.name} ended its stream without a terminal event`);
      }
    } catch (err) {
      if (errorPersisted) throw err;
      await failTurn(String(err ?? "unknown engine error"));
    }
  } finally {
    // Error/early-exit fallback only — a completed turn already persisted its
    // text above (persistText is idempotent).
    await persistText();
  }

  // Same contract as runner.ts's onTurnEnd call: after the text is persisted,
  // never for a failed turn (every failure path threw above), errors logged
  // rather than retro-failing a turn that already succeeded.
  if (agent.config.onTurnEnd) {
    if (opts.hookCtx) {
      try {
        await agent.config.onTurnEnd({ text, finishReason }, opts.hookCtx);
      } catch (err) {
        console.error("agents: onTurnEnd hook failed:", err);
      }
    } else {
      console.warn("agents: onTurnEnd hook configured but no request context (hookCtx) available — skipping");
    }
  }
  return { text, finishReason };
}
