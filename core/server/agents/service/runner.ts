// The shared agent loop (spec §5): one call = one turn. Wraps AI SDK
// streamText with the agent's tool set (see toolset.ts); persists every step
// via the store AND emits live events. Extracted/adapted from
// plugins/devx/functions/agent.ts.
// deno-lint-ignore-file no-explicit-any
import { streamText, stepCountIs } from "ai";
import { cacheProviderOptions, mergeProviderOptions, reasoningEffortProviderOptions, resolveModelForTurn, withSystemCachePoint } from "./model.ts";
import type { HookCtx, ToolDef } from "../eve-shim/types.ts";
import type { LoadedAgent } from "../loader.ts";
import type { AgentStore } from "./store.ts";
import type { AgentEvent } from "./events.ts";
import { buildSdkTools, resolveInstructions, resolveUserMessage } from "./toolset.ts";
import type { ConnectionProviderOpts } from "../connections/provider.ts";
import type { SpawnCapabilities } from "./spawn.ts";

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
  // Threaded through to ToolBuildCtx via this function's `{ ...opts,
  // model, toolEmit }` spread into buildSdkTools below — see toolset.ts's
  // ToolBuildCtx.plugin/agentName. Set by handler.ts's startTurn from its
  // Deps {plugin, agentName}.
  plugin?: string;
  agentName?: string;
  // Per-request context for the agent's resolveModel/buildInstructions
  // hooks. Optional so existing callers/tests that never touch hooks
  // (no agent.config.resolveModel/buildInstructions) keep working unchanged
  // — resolveModelForTurn/resolveInstructions only require it when a hook
  // is actually configured.
  hookCtx?: HookCtx;
  approvalPollMs?: number;
  approvalTimeoutMs?: number;
  // Connection-provider opts (OAuth broker deps). Threaded into
  // buildSdkTools via the `{ ...opts }` spread below so kind:"oauth"
  // connections resolve/park tokens. Undefined when no broker is wired.
  connectionOpts?: ConnectionProviderOpts;
  // Task 15: this session's already-activated deferred-tool names, read
  // fresh by handler.ts's startTurn (store.getActivatedTools) before every
  // turn. Threaded straight through to buildSdkTools via the `{ ...opts }`
  // spread below — see toolset.ts's ToolBuildCtx.activatedTools.
  activatedTools?: string[];
  // Child-spawn capabilities for this turn's `agent`/`agent_spawn`/...
  // tools — see toolset.ts's ToolBuildCtx.spawn. Threaded straight through
  // to buildSdkTools via the `{ ...opts }` spread below. Set by handler.ts's
  // startTurn once the turn's own id is known (spawnChild needs it as the
  // child's parent_turn_id); undefined for callers that never wire spawning
  // (e.g. /chat, and any existing test that doesn't need it).
  spawn?: SpawnCapabilities;
  // Threaded through to ToolBuildCtx via the `{ ...opts }` spread below —
  // see toolset.ts's ToolBuildCtx.depth. Set by handler.ts's startTurn from
  // a fresh store.isChildSession(sessionId) check on EVERY turn (not passed
  // down from spawn time) — see that call site's own comment for why a
  // durable-state check, not a threaded parameter, is what keeps a child
  // structurally unable to spawn its own children. Undefined defaults to 0
  // (top level) in buildSdkTools, same as before this field existed.
  depth?: number;
  // Cancels this turn's model call and every step after it. Handed straight
  // to streamText, which is the only thing here that can be mid-flight for
  // minutes. Set by handler.ts's startTurn for a CHILD turn (depth 1), from
  // the per-worker registry agent_stop triggers — see aborts.ts. Undefined
  // for every other turn: nothing else can be stopped from the outside today,
  // and an unused controller per turn is bookkeeping nobody reads.
  abortSignal?: AbortSignal;
}

// A child has exactly ONE turn, so a message queued for it (spawn.ts's
// sendToChild / the agent_send tool) is only meaningful DURING that turn —
// there is no "next turn" for it to ride into the way an ordinary session's
// queueFollowUp does (handler.ts's startTurn drains that queue at the START
// of a turn). prepareStep is the only AI SDK hook that runs BETWEEN steps of
// an already-streaming turn, and PrepareStepResult permits a per-step
// `messages` override (verified against the installed ai's index.d.ts:
// PrepareStepFunction/PrepareStepResult) — returning one here is what makes
// mid-turn delivery possible at all.
//
// Two consequences, both accepted (see spawn.ts's sendToChild, which reports
// whether the child was still `running` when it queued the message, not
// whether it was ever actually read): a message sent while a long tool call
// is executing lands only once that call returns and the next step's
// prepareStep runs; a message sent after the turn's FINAL step has already
// started is never read at all.
export function makePrepareStep(deps: { sessionId: string; store: Pick<AgentStore, "takeFollowUps"> }) {
  return async ({ messages }: { messages: any[] }) => {
    const pending = await deps.store.takeFollowUps(deps.sessionId);
    if (pending.length === 0) return {}; // no override: leave the step untouched
    return {
      messages: [
        ...messages,
        ...pending.map((content) => ({ role: "user" as const, content })),
      ],
    };
  };
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
  const rawUserContent = typeof opts.message === "string" ? opts.message : JSON.stringify(opts.message);
  const userContent = await resolveUserMessage(agent, rawUserContent, opts.hookCtx);
  const messages = [...opts.history, { role: "user" as const, content: userContent }];

  let stepSeq = 0;
  const persist = (kind: string, name: string | null, payload: unknown, usage?: unknown) =>
    store.addStep(turnId, ++stepSeq, kind, name, payload, usage).catch((e) =>
      console.error("agents: step persist failed:", e)
    );

  const clientOnlyNames = new Set(
    Object.entries(agent.tools).filter(([, d]) => (d as ToolDef).clientOnly).map(([n]) => n),
  );
  // Agent-agnostic — runner.ts does not know any tool by name, so a tool
  // declares whether ITS OWN execute() already speaks to the channel directly
  // (outside this turn's emit/message.completed path), the same way it declares
  // clientOnly. See ToolDef.postsToChannel (eve-shim/types.ts).
  const postsToChannelNames = new Set(
    Object.entries(agent.tools).filter(([, d]) => (d as ToolDef).postsToChannel).map(([n]) => n),
  );

  // ToolContext.emit's session-path channel. A tool's execute() calls
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

  // Async now that a top-level dynamic-tools.ts provider may need to run
  // (opts already carries hookCtx — see RunTurnOpts — so ToolBuildCtx picks
  // it up via the spread).
  const tools = await buildSdkTools({ ...opts, model, toolEmit });
  // Cache the stable TOOLS+SYSTEM prefix on bedrock and the direct
  // anthropic provider (no-op on every other provider — see
  // withSystemCachePoint in model.ts). `system` here is identical across
  // every step of this turn AND across turns for the same agent+metadata,
  // making it (together with `tools`, cached transitively — see
  // withSystemCachePoint) the high-value cache target the brief calls for;
  // per-turn `messages` are deliberately left uncached since they change
  // every turn.
  const result = streamText({
    model,
    system: withSystemCachePoint(model, system),
    messages,
    tools,
    // Only ever set for a child turn (see RunTurnOpts.abortSignal). Passing
    // undefined is exactly the same as not passing it at all.
    abortSignal: opts.abortSignal,
    stopWhen: stepCountIs(agent.config.maxSteps ?? 25),
    // openai/Responses caches automatically; a stable per-agent key keeps the
    // TOOLS+SYSTEM prefix routed to the same cache across turns. No-op ({}) for
    // bedrock/anthropic (they cache via withSystemCachePoint's markers above).
    // Task 14: reasoningEffortProviderOptions is agent.config.reasoningEffort
    // applied to THIS turn's own resolved model — nothing spawn-specific is
    // needed beyond ordinary turn execution, since a child's turn already
    // runs with its OWN LoadedAgent.config (handler.ts's buildSpawnCapabilities
    // resolves it before ever calling startTurn).
    providerOptions: mergeProviderOptions(
      cacheProviderOptions(model, agent.dir),
      reasoningEffortProviderOptions(model, agent.config.reasoningEffort, agent.dir),
    ),
    // Only wired for a CHILD turn (depth===1). prepareStep runs on every
    // step of every turn if it's set at all — leaving it undefined for the
    // overwhelming majority (top-level) case means zero DB round trips for
    // a feature only children use, rather than relying on makePrepareStep's
    // own no-op path to be cheap enough. `opts.depth` is already derived once
    // per turn by handler.ts's startTurn (store.isChildSession) — reusing it
    // here costs nothing extra.
    ...(opts.depth === 1 ? { prepareStep: makePrepareStep({ sessionId: opts.sessionId, store: opts.store }) } : {}),
  });

  let text = "";
  // The text produced by the CURRENT step only, reset at every step
  // boundary (see "finish-step" below). Delegation (toolset.ts's
  // runAsChild/awaitChild) needs step-scoped semantics — the same thing
  // ai's own `result.text` promise gives a nested in-process call — because
  // a preamble step ("Let me check the config...") followed by a tool call
  // and then the real answer must not have the preamble leak into the
  // returned answer. `text` above stays the full cross-step narrative
  // (message.appended/message.completed still want that for a human reading
  // chat); `lastStepText` is captured alongside it, purely additively.
  let stepText = "";
  let lastStepText = "";
  let finishReason = "unknown";
  let textPersisted = false;
  // A clientOnly tool call ends the turn with no text by DESIGN — the caller
  // executes it and continues in a follow-up turn, it's a hand-off, not
  // silence. The no-silent-turn fallback below must not fire for that case (see
  // the "does not emit message.completed for a clientOnly tool-call turn"
  // test).
  let sawClientOnlyCall = false;
  // Whether the MOST RECENT tool call posted to the channel — not whether one
  // EVER did. An earlier version made this sticky (true forever once any
  // postsToChannel tool ran), but claw's skill makes postUpdate immediately
  // before EVERY askCodeAgent call an invariant (facilitate-coding-task.md) —
  // so claw's canonical turn shape is postUpdate("starting X") -> askCodeAgent
  // (long) -> step cap, no closing text. A sticky flag suppressed the
  // no-silent-turn fallback for that whole shape, leaving "starting X" as the
  // channel's last word even though askCodeAgent (not postUpdate) was how the
  // turn actually ended — exactly the 14%-silent-turn defect this fix was
  // written to remove. Tracking only the LAST tool call means a channel post at
  // the START of a turn no longer silences a fallback for whatever happened
  // AFTER it; a channel post that genuinely is the last thing the turn did
  // still suppresses it.
  let lastToolWasChannelPost = false;
  // Distinguishes "the turn genuinely did nothing" (safe to say
  // "Nothing was changed") from "tools ran but nothing reached the channel
  // and there's no closing text" (the actually-silent-after-doing-work case
  // this task exists to fix — must NOT claim nothing changed, since it might
  // have).
  let sawAnyToolCall = false;
  // The LAST step's input-token count, which is the only usage number that
  // approximates "how full is the context window". ai@6's fullStream carries
  // per-step usage ONLY on `finish-step`; the terminal `finish` part carries
  // `totalUsage`, documented in ai/dist/index.d.ts as "the sum of all step
  // usages". Summing input tokens across steps is meaningless as a context
  // size — a 20-step turn over a 30k context reports ~600k — and compaction
  // reads this number, so it must be the last step's, not the sum.
  let lastStepInputTokens: number | undefined;
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
    // stepToEvent) the same way the live tail does above. lastStepText is
    // for spawn.ts's awaitChild only (see its own comment) — every other
    // reader of this step keeps using `text`.
    await persist("text", null, { text, finishReason, lastStepText });
  };
  try {
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          const delta = (part as any).text ?? (part as any).delta ?? "";
          text += delta;
          stepText += delta;
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
          sawAnyToolCall = true;
          if (clientOnly) sawClientOnlyCall = true;
          // Reassigned (not OR'd) on every tool call: only the LAST call's
          // answer survives to the finish case — see the declaration above.
          lastToolWasChannelPost = postsToChannelNames.has(p.toolName);
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
        case "finish-step": {
          // Overwritten on every step, so after the stream drains this holds
          // the FINAL step's prefill — see lastStepInputTokens' declaration.
          const u = (part as any).usage;
          if (typeof u?.inputTokens === "number") lastStepInputTokens = u.inputTokens;
          // Capture THIS step's text before resetting for the next one, so
          // after the last step lastStepText holds exactly its text (and
          // nothing from any earlier step) — see stepText's declaration.
          lastStepText = stepText;
          stepText = "";
          break;
        }
        case "finish": {
          const p = part as any;
          finishReason = p.finishReason ?? "stop";
          // Surface cache token counts alongside the existing
          // inputTokens/outputTokens so the eval artifacts (and any other
          // usage consumer) can see cache reuse land. ai@6's
          // LanguageModelUsage nests these under inputTokenDetails
          // (cacheReadTokens/cacheWriteTokens) rather than the
          // provider-raw cacheReadInputTokens/cacheWriteInputTokens names —
          // re-expose them under the provider-raw names here since that's
          // the vocabulary the rest of this codebase/docs use. undefined on
          // every non-caching provider/response (unchanged shape otherwise).
          //
          // inputTokens/outputTokens stay TOTALS (billing/eval vocabulary —
          // what the turn cost). lastStepInputTokens is a SEPARATE field
          // because it answers a different question: how full the window was
          // on the final request of the turn. store.ts's getLastTurnUsage
          // reads only that one; feeding it the total made a multi-step turn
          // look like a near-full window and re-summarized before every turn.
          const usage = {
            inputTokens: p.totalUsage?.inputTokens,
            outputTokens: p.totalUsage?.outputTokens,
            lastStepInputTokens,
            cacheReadInputTokens: p.totalUsage?.inputTokenDetails?.cacheReadTokens,
            cacheWriteInputTokens: p.totalUsage?.inputTokenDetails?.cacheWriteTokens,
          };
          // eve's client only reads the final reply off message.completed
          // (see events.ts) — emit it once, right before turn.completed, when
          // this turn actually produced text. A pure tool-call turn with no
          // trailing text falls to the clientOnly hand-off check, the
          // channel-post check, or the no-silent-turn fallback below.
          if (text) {
            emit({ type: "message.completed", data: { turnId, message: text, finishReason } });
          } else if (sawClientOnlyCall) {
            // Unchanged: a clientOnly tool call ends the turn with no text by
            // DESIGN (the caller executes it and continues in a follow-up
            // turn) — see the "does not emit message.completed for a
            // clientOnly tool-call turn" test.
          } else if (lastToolWasChannelPost) {
            // The LAST tool call this turn made was a postsToChannel tool
            // (postUpdate/postChoice/postPlan/
            // postQuestion/postScreenshots/postDevSummary) — the channel just
            // heard from the agent as the turn's closing act, so emitting the
            // fallback here would be pure noise at best, and at worst a false
            // "Nothing was changed" after a turn that actually changed things.
            // A channel post EARLIER in the turn (not the last call) falls
            // through to the branches below instead — see the declaration of
            // lastToolWasChannelPost for why that distinction matters.
          } else if (!sawAnyToolCall) {
            // No-silent-turn guarantee: the turn produced no text, called no
            // tool at all, and posted nothing anywhere — it genuinely did
            // nothing, so "Nothing was changed" is true.
            text =
              'That step finished without producing a reply. Nothing was changed — say "retry" and I\'ll run it again.';
            emit({ type: "message.completed", data: { turnId, message: text, finishReason } });
          } else {
            // Tools ran (so work may have happened) but none of
            // them posted to the channel and the model never produced closing
            // text — e.g. it hit the step cap mid tool-call loop. This is the
            // genuinely-silent-after-doing-work case the task exists to fix.
            // Deliberately makes NO claim about whether anything changed.
            text = 'That step ended without a reply. Say "retry" and I\'ll run it again.';
            emit({ type: "message.completed", data: { turnId, message: text, finishReason } });
          }
          emit({ type: "turn.completed", data: { turnId, usage, finishReason } });
          // Persist text BEFORE finish so replay (seq-ordered) preserves the
          // live message.completed → turn.completed order (see persistText).
          await persistText();
          await persist("finish", null, { finishReason }, usage);
          break;
        }
        case "abort": {
          // The turn was cancelled from outside — today that means agent_stop
          // reached this worker's controller for a running child (aborts.ts).
          // ai emits this part and then simply ENDS the stream, so without
          // this case the loop would fall out and runTurn would return
          // normally, reporting a stopped turn as a completed one.
          //
          // Treated as a failure instead, and by the same route as a model
          // error: persist an error step (so a replay shows why the turn stops
          // here) and throw, which hands the turn to handler.ts's startTurn
          // catch. That catch marks the turn `failed` and, for a child,
          // delivers to its parent — which is what matters if this abort ever
          // arrives WITHOUT agent_stop's database marking having taken effect.
          // Whoever ends the turn must tell the parent; a stopped child must
          // never end up notifying nobody.
          const reason = (part as any).reason;
          const message = `agents: turn aborted${reason ? `: ${reason}` : ""}`;
          await persist("error", null, { message });
          throw new Error(message);
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
  // After the finally block, so persistText() has already run — and outside
  // it, so a thrown turn (the "error" case) never reaches here. Errors are
  // logged, never rethrown: the turn already succeeded.
  if (agent.config.onTurnEnd) {
    if (opts.hookCtx) {
      try {
        await agent.config.onTurnEnd({ text, finishReason }, opts.hookCtx);
      } catch (err) {
        console.error("agents: onTurnEnd hook failed:", err);
      }
    } else {
      // Neither throw (the turn already succeeded — retro-failing it here
      // would defeat the point of running this hook after persistText) nor
      // silent skip (a configured-but-unrunnable hook is a caller wiring
      // bug worth surfacing) — warn and move on.
      console.warn("agents: onTurnEnd hook configured but no request context (hookCtx) available — skipping");
    }
  }
  return { text, finishReason };
}
