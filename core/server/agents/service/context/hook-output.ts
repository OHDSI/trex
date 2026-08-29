// Caps text a hook injects into a model prompt. Unbounded injection can undo
// the compaction that just ran to free the same budget — see this module's
// test file header comment. Uses budget.ts's estimateTokens (the SAME
// estimator the compaction trigger measures against) rather than a second
// heuristic, so this cap and the budget it protects never disagree.
import { estimateTokens } from "./budget.ts";

export const DEFAULT_MAX_HOOK_OUTPUT_TOKENS = 2500;

export interface CapHookOutputOpts {
  maxTokens?: number;
  spillPath?: string;
}

export interface CapHookOutputResult {
  text: string;
  spilled?: string;
}

// Reserves room for the note itself, so the returned string still shrinks
// the injection rather than growing past the original for a small overage.
const NOTE_OVERHEAD = 100;

// Truncates to (roughly) maxTokens and notes how much was cut, without
// pretending the cut content is retrievable anywhere.
function truncateNote(text: string, tokens: number, maxTokens: number): string {
  const preview = text.slice(0, Math.max(0, maxTokens * 4 - NOTE_OVERHEAD));
  return `${preview}\n[hook output truncated: ~${tokens} tokens exceeds the ${maxTokens}-token cap; ~${
    tokens - maxTokens
  } tokens omitted]`;
}

/**
 * Returns `text` unchanged when it fits `maxTokens`.
 *
 * Otherwise, if `opts.spillPath` names a directory, writes the full text to
 * a file under it and returns a short pointer naming that file. A pointer is
 * only honest when its reader can actually open the file — so with no
 * `spillPath`, this truncates inline instead of inventing a temp-file
 * location no caller asked for and no reader can reach (see this module's
 * test file for the two callers this distinguishes: a workspace-scoped
 * coding model vs. a summarizer with no file access at all).
 *
 * Fail-open: a spill failure (unwritable path, no permission, ...) falls
 * back to the same inline truncation rather than throwing — this must never
 * fail a turn, only degrade how much of the hook's output survives.
 */
export async function capHookOutput(text: string, opts: CapHookOutputOpts = {}): Promise<CapHookOutputResult> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_HOOK_OUTPUT_TOKENS;
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return { text };

  if (opts.spillPath) {
    try {
      await Deno.mkdir(opts.spillPath, { recursive: true });
      const filePath = `${opts.spillPath}/hook-output-${crypto.randomUUID()}.txt`;
      await Deno.writeTextFile(filePath, text);
      return {
        text: `[hook output truncated: ~${tokens} tokens exceeds the ${maxTokens}-token cap; full output saved to ${filePath}]`,
        spilled: filePath,
      };
    } catch (err) {
      console.error("[hook-output] spill failed, truncating inline:", err instanceof Error ? err.message : err);
      // Fall through to the same truncation a caller with no spillPath gets.
    }
  }

  return { text: truncateNote(text, tokens, maxTokens) };
}
