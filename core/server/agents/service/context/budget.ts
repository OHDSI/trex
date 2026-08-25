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
  return tokensForChars(text.length);
}

/** estimateTokens for a length already counted, so a caller summing the sizes
 * of many strings need not concatenate them just to measure the total. */
function tokensForChars(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * Rough token cost of the request's FIXED prefix — the system prompt plus the
 * tool schemas — which every request carries and which `estimateTokens` over
 * the assembled messages cannot see.
 *
 * This exists for `maybeCompact`'s estimate fallback. That fallback is the
 * live path for a session's first turn and for every session whose turns were
 * persisted before `lastStepInputTokens` existed, and measuring messages alone
 * under-counted the real prefill by the several thousand tokens this prefix
 * costs. It is NOT for the observed-usage path: the provider's own count
 * already includes both, so adding this there would double-count.
 *
 * A deliberate FLOOR, not an exact figure. Callers can only pass what is
 * already resolved without I/O, so the result excludes anything that needs an
 * await — a `buildInstructions` hook's output (devx replaces the base prompt
 * with a much larger one), dynamically provided tools, realized connection
 * tools, and the built-ins `buildSdkTools` adds. Awaiting those here would
 * widen `handler.ts`'s documented check-then-act window (see its comment at
 * the `getRunningTurn` read), which is a worse trade than an estimate that
 * under-counts by less than it used to.
 */
export function estimatePrefixTokens(
  system: string,
  tools: Iterable<readonly [string, { description?: string; inputSchema?: unknown }]>,
): number {
  let chars = system.length;
  for (const [name, def] of tools) {
    chars += name.length + (def?.description?.length ?? 0);
    try {
      chars += JSON.stringify(def?.inputSchema ?? {})?.length ?? 0;
    } catch {
      // A schema that will not serialize (a zod object's cyclic `_def`, say)
      // contributes its name and description only. An estimate must never be
      // the thing that throws — this runs in the pre-turn block, which has no
      // try/catch of its own and whose only backstop produces no turn.failed.
    }
  }
  return tokensForChars(chars);
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
