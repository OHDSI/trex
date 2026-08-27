// Context-checkpoint summarization: builds the request that asks a model for
// a handoff summary of the turns being compacted away, and runs it. See
// prompts.ts for why SUMMARIZATION_PROMPT/SUMMARY_PREFIX live outside this
// file (avoiding a circular import with history.ts) — import them from there
// directly; this module deliberately re-exports neither.
import { assembleHistory, type ModelMessage, type TurnRow } from "./history.ts";
import { type ContextConfig, estimateTokens, resolveContextWindow, shouldCompact } from "./budget.ts";
import { SUMMARIZATION_PROMPT } from "./prompts.ts";
import { TRUNCATION_HEADER_OVERHEAD, truncateMiddle } from "./truncate.ts";
import type { AgentEvent } from "../events.ts";

/**
 * Renders assembled messages as a plain-text transcript for the summarizer.
 *
 * The summarization call declares NO `tools`, so handing it the structured
 * messages — which carry `tool-call` and `tool-result` parts — asks a provider
 * to accept tool blocks for tools it was never told about. Anthropic rejects
 * that outright, and the rejection was swallowed by maybeCompact's
 * drop-fallback, so the summarizer would in practice have NEVER run: every
 * compaction would silently degrade to dropping turns.
 *
 * Flattening also loses nothing that matters. A summarizer is asked for a
 * handoff narrative, not a replayable transcript; it has no use for a
 * toolCallId or a structured input envelope, only for what was called and
 * what came back.
 */
export function flattenForSummary(msgs: ModelMessage[]): string {
  const lines: string[] = [];
  for (const m of msgs) {
    if (m.role === "user") {
      lines.push(`User: ${m.content}`);
      continue;
    }
    if (m.role === "assistant") {
      for (const p of m.content) {
        if (p.type === "text") lines.push(`Assistant: ${p.text}`);
        else lines.push(`Assistant called ${p.toolName}(${JSON.stringify(p.input ?? {})})`);
      }
      continue;
    }
    for (const p of m.content) {
      const output = typeof p.output === "string" ? p.output : JSON.stringify(p.output ?? "");
      lines.push(`Result of ${p.toolName}: ${output}`);
    }
  }
  return lines.join("\n");
}

export function buildSummarizationRequest(
  transcript: string,
  config: ContextConfig,
): { system: string; messages: ModelMessage[] } {
  return {
    system: config.summarizationPrompt ?? SUMMARIZATION_PROMPT,
    messages: [{ role: "user", content: transcript }],
  };
}

export async function summarize(
  transcript: string,
  config: ContextConfig,
  callModel: (req: { system: string; messages: ModelMessage[] }) => Promise<string>,
): Promise<string> {
  return await callModel(buildSummarizationRequest(transcript, config));
}

/** Fraction of the context window a compaction summary may occupy. */
export const SUMMARY_WINDOW_SHARE = 0.25;

export type CompactOutcome =
  | { compacted: false }
  | { compacted: true; via: "summary" | "drop"; summary?: string; replacedTurnSeqTo: number };

// Pre-turn only (see the design note in task-12-brief.md): this is called
// once, before a turn starts, never mid-stream. A mid-turn summary would
// have to be injected above the last user message or the model misreads it —
// deliberately deferred. A turn that exhausts the window mid-stream fails
// with a clear error; the NEXT turn is what compacts.
export async function maybeCompact(opts: {
  turns: TurnRow[];
  msgs: ModelMessage[];
  config: ContextConfig;
  modelId: string;
  observedInputTokens?: number;
  // Token cost of the fixed system-prompt + tool-schema prefix, applied to
  // the estimate fallback ONLY — see the inputTokens comment below.
  prefixTokens?: number;
  callModel: (req: { system: string; messages: ModelMessage[] }) => Promise<string>;
  // Session stream publisher. Optional so unit tests and any caller without a
  // stream can omit it; the spec's error table requires a warning event when
  // summarization fails, and a console.warn is not one — nobody watching the
  // session sees it, and the user is the only party who can supply again what
  // the drop fallback just discarded.
  emit?: (e: AgentEvent) => void;
}): Promise<CompactOutcome> {
  const { turns, msgs, config, modelId, observedInputTokens, prefixTokens, callModel, emit } = opts;
  const window = resolveContextWindow(modelId, config.contextWindow);
  // Prefer server-observed usage (runner.ts persists it on every turn's
  // "finish" step) over estimateTokens: the estimate is a char/4 heuristic
  // over the locally-assembled messages, which can drift from what the
  // provider actually counted (provider-side formatting overhead is not
  // visible to estimateTokens at all).
  //
  // `prefixTokens` is added to the ESTIMATE only, never to the observed
  // count. The observed value is the provider's own figure for the final
  // request and already includes the system prompt and the tool schemas;
  // adding the prefix there would double-count it. The estimate, measured
  // over the assembled messages, includes neither — and that fallback is the
  // live path for a session's first turn and for every session persisted
  // before lastStepInputTokens existed, so leaving it out under-counted the
  // real prefill by a fixed several thousand tokens on exactly the sessions
  // with no better number available.
  const inputTokens = observedInputTokens ?? (estimateTokens(JSON.stringify(msgs)) + (prefixTokens ?? 0));
  if (
    turns.length === 0 ||
    // config.compactAtTokens is undefined for every agent that does not set
    // it, which shouldCompact treats as "fraction alone" — unchanged.
    !shouldCompact({ inputTokens, window, fraction: config.compactAtFraction, ceiling: config.compactAtTokens })
  ) {
    return { compacted: false };
  }
  // Compact the oldest turns, keeping the most recent `keep` verbatim. When
  // the whole history is at or under `keep` turns there is nothing "old" to
  // leave alone in the usual sense — but we are ALREADY over the trigger
  // threshold, and pre-turn compaction is the only chance to reclaim budget
  // before the next turn's request is built (a turn that exhausts the window
  // mid-stream just fails — see the module comment). So compact at least the
  // single oldest turn rather than doing nothing.
  const keep = config.verbatimTurnsAfterCompaction;
  const cutoff = Math.max(1, turns.length - keep);
  const replacedTurnSeqTo = turns[cutoff - 1].seq;
  try {
    // Summarize ONLY the turns being compacted away. Passing the whole
    // history also summarized the `keep` most recent turns, which survive
    // verbatim right below the summary — so the model was handed the same
    // content twice, once condensed and once in full, contradicting this
    // module's own header and wasting the budget compaction is reclaiming.
    // Re-assembled from the compacted slice rather than sliced out of
    // `msgs`: message count and turn count do not correspond (one turn emits
    // a user message plus one message per step), so there is no honest index
    // to cut `msgs` at.
    //
    // ensureToolResultsPresent is deliberately NOT applied — it exists to
    // satisfy a provider's tool_use/tool_result pairing rule, and
    // flattenForSummary emits no tool blocks for a provider to reject.
    const transcript = flattenForSummary(assembleHistory(turns.slice(0, cutoff), config));
    const raw = await summarize(transcript, config, callModel);
    // A summary that itself exceeds the window defeats the purpose. Allow it
    // a quarter of the window and truncate the rest away. truncateMiddle's
    // maxChars bounds RETAINED content only — its warning header and
    // omission marker are additional (see truncate.ts) — so the cap passed
    // in must already have that overhead subtracted, or the result can come
    // back slightly OVER the intended budget.
    const cap = Math.max(0, Math.floor(window * SUMMARY_WINDOW_SHARE * 4) - TRUNCATION_HEADER_OVERHEAD);
    const summary = truncateMiddle(raw, cap);
    // Isolated for the same reason as the failure path below, and for one
    // more: a throwing subscriber here would otherwise fall into the catch
    // and report `via: "drop"` for a summarization that actually SUCCEEDED,
    // discarding the summary it just paid a model call for.
    try {
      emit?.({ type: "context.compacted", data: { via: "summary", replacedTurnSeqTo } });
    } catch (e) {
      console.error("[agents] failed to publish the compaction event:", e);
    }
    return { compacted: true, via: "summary", summary, replacedTurnSeqTo };
  } catch (err) {
    // Never fail the turn because the summarizer did. Drop oldest whole
    // turns instead — never mid-turn, which would orphan a tool call and get
    // the request rejected by the provider.
    const warning = err instanceof Error ? err.message : String(err);
    console.warn("[agents] summarization failed, dropping oldest turns:", err);
    // Isolated: emit publishes to live subscribers, and a throwing subscriber
    // must not convert a successful drop-fallback into a failed compaction —
    // reclaiming the budget is the point, telling someone about it is a
    // courtesy.
    try {
      emit?.({ type: "context.compacted", data: { via: "drop", replacedTurnSeqTo, warning } });
    } catch (e) {
      console.error("[agents] failed to publish the compaction warning event:", e);
    }
    return { compacted: true, via: "drop", replacedTurnSeqTo };
  }
}
