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

/**
 * Returns `text` unchanged when it fits `maxTokens`. Otherwise writes the
 * full text to a file under `spillPath` (a directory; created if missing)
 * and returns a short pointer naming that file instead of the payload.
 *
 * Fail-open: a spill failure (unwritable path, no permission, ...) falls
 * back to an inline-truncated preview rather than throwing — this must
 * never fail a turn, only degrade how much of the hook's output survives.
 */
export async function capHookOutput(text: string, opts: CapHookOutputOpts = {}): Promise<CapHookOutputResult> {
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_HOOK_OUTPUT_TOKENS;
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return { text };

  try {
    const dir = opts.spillPath ?? (await Deno.makeTempDir({ prefix: "hook-output-" }));
    await Deno.mkdir(dir, { recursive: true });
    const filePath = `${dir}/hook-output-${crypto.randomUUID()}.txt`;
    await Deno.writeTextFile(filePath, text);
    return {
      text: `[hook output truncated: ~${tokens} tokens exceeds the ${maxTokens}-token cap; full output saved to ${filePath}]`,
      spilled: filePath,
    };
  } catch (err) {
    console.error("[hook-output] spill failed, truncating inline:", err instanceof Error ? err.message : err);
    // Budget the preview in characters against the same token cap (roughly
    // 4 chars/token) so a failed spill still shrinks the injection.
    const preview = text.slice(0, maxTokens * 4);
    return { text: `${preview}\n[hook output truncated: spill failed, remainder dropped]` };
  }
}
