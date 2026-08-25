export interface ContextConfig {
  freshToolOutputChars: number;
  staleToolOutputChars: number;
  freshTurns: number;
  compactAtFraction: number;
  // Optional absolute ceiling on the compaction trigger, in input tokens.
  // The trigger becomes min(compactAtFraction * window, compactAtTokens).
  // Unset (the default) means the fraction alone decides, exactly as before.
  // It exists because the fraction does not bound COST: on a 1M-token window
  // 0.75 first compacts around 750k input tokens, which is correct but is a
  // very expensive single request.
  compactAtTokens?: number;
  verbatimTurnsAfterCompaction: number;
  contextWindow?: number;
  summarizationPrompt?: string;
  deferredTools: string[];
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  freshToolOutputChars: 20_000,
  staleToolOutputChars: 2_000,
  freshTurns: 3,
  compactAtFraction: 0.75,
  verbatimTurnsAfterCompaction: 3,
  deferredTools: [],
};

// Never guess high: an over-estimated window produces a provider rejection
// instead of a compaction. This map lags new model releases by design.
export const FALLBACK_CONTEXT_WINDOW = 128_000;

const CONTEXT_WINDOWS: Record<string, number> = {
  "claude-fable-5": 1_000_000,
  "claude-opus-5": 1_000_000,
  "claude-sonnet-5": 1_000_000,
  "claude-opus-4-8": 1_000_000,
  "claude-opus-4-7": 1_000_000,
  "claude-opus-4-6": 1_000_000,
  "claude-sonnet-4-6": 1_000_000,
  "claude-haiku-4-5": 200_000,
};

// Callers estimating tokens over already-assembled messages get TRUNCATION_HEADER_OVERHEAD
// cost for free — warning headers are literal text in the formatted output. Use this function
// when tokens are measured post-formatting. For cap sizing BEFORE formatting, subtract
// TRUNCATION_HEADER_OVERHEAD from the budget (see truncate.ts).
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function resolveContextWindow(modelId: string, override?: number): number {
  if (override !== undefined) return override;
  return CONTEXT_WINDOWS[modelId] ?? FALLBACK_CONTEXT_WINDOW;
}

/**
 * Whether the next request should compact first.
 *
 * `ceiling` is optional and, when given, only ever LOWERS the trigger:
 * min(window * fraction, ceiling). Omitting it (or passing undefined) must
 * stay bit-for-bit identical to the fraction alone — `claw` and
 * `d2esupport` configure no ceiling and their behaviour is unchanged.
 */
export function shouldCompact(
  opts: { inputTokens: number; window: number; fraction: number; ceiling?: number },
): boolean {
  const byFraction = opts.window * opts.fraction;
  const threshold = opts.ceiling === undefined ? byFraction : Math.min(byFraction, opts.ceiling);
  return opts.inputTokens >= threshold;
}
