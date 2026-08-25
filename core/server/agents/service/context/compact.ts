// Context-checkpoint summarization: builds the request that asks a model for
// a handoff summary of the turns being compacted away, and runs it. See
// prompts.ts for why SUMMARIZATION_PROMPT/SUMMARY_PREFIX live outside this
// file (avoiding a circular import with history.ts).
import type { ModelMessage, TurnRow } from "./history.ts";
import { type ContextConfig, estimateTokens, resolveContextWindow, shouldCompact } from "./budget.ts";
import { SUMMARIZATION_PROMPT, SUMMARY_PREFIX } from "./prompts.ts";
import { TRUNCATION_HEADER_OVERHEAD, truncateMiddle } from "./truncate.ts";

// Re-exported so this module's own public surface still carries both
// constants, matching what callers of a "summarization module" expect to
// find here — the split into prompts.ts is an internal-import-cycle
// concern, not a change to compact.ts's API.
export { SUMMARIZATION_PROMPT, SUMMARY_PREFIX };

export function buildSummarizationRequest(
  msgs: ModelMessage[],
  config: ContextConfig,
): { system: string; messages: ModelMessage[] } {
  return { system: config.summarizationPrompt ?? SUMMARIZATION_PROMPT, messages: msgs };
}

export async function summarize(
  msgs: ModelMessage[],
  config: ContextConfig,
  callModel: (req: { system: string; messages: ModelMessage[] }) => Promise<string>,
): Promise<string> {
  return await callModel(buildSummarizationRequest(msgs, config));
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
  callModel: (req: { system: string; messages: ModelMessage[] }) => Promise<string>;
}): Promise<CompactOutcome> {
  const { turns, msgs, config, modelId, observedInputTokens, callModel } = opts;
  const window = resolveContextWindow(modelId, config.contextWindow);
  // Prefer server-observed usage (runner.ts persists it on every turn's
  // "finish" step) over estimateTokens: the estimate is a char/4 heuristic
  // over the locally-assembled messages, which can drift from what the
  // provider actually counted (system prompt, tool schemas, provider-side
  // formatting overhead are not visible to estimateTokens at all).
  const inputTokens = observedInputTokens ?? estimateTokens(JSON.stringify(msgs));
  if (turns.length === 0 || !shouldCompact({ inputTokens, window, fraction: config.compactAtFraction })) {
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
    const raw = await summarize(msgs, config, callModel);
    // A summary that itself exceeds the window defeats the purpose. Allow it
    // a quarter of the window and truncate the rest away. truncateMiddle's
    // maxChars bounds RETAINED content only — its warning header and
    // omission marker are additional (see truncate.ts) — so the cap passed
    // in must already have that overhead subtracted, or the result can come
    // back slightly OVER the intended budget.
    const cap = Math.max(0, Math.floor(window * SUMMARY_WINDOW_SHARE * 4) - TRUNCATION_HEADER_OVERHEAD);
    const summary = truncateMiddle(raw, cap);
    return { compacted: true, via: "summary", summary, replacedTurnSeqTo };
  } catch (err) {
    // Never fail the turn because the summarizer did. Drop oldest whole
    // turns instead — never mid-turn, which would orphan a tool call and get
    // the request rejected by the provider.
    console.warn("[agents] summarization failed, dropping oldest turns:", err);
    return { compacted: true, via: "drop", replacedTurnSeqTo };
  }
}
