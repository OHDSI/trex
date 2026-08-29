// Resolves how much of a parent's history a spawned child inherits (the
// `fork_turns` tool parameter). Gated on #275's context work — a forked
// slice is only worth inheriting now that history carries real tool calls.
import type { ContextConfig } from "./budget.ts";
import { estimateTokens } from "./budget.ts";
import { assembleHistory, ensureToolResultsPresent, type ModelMessage, type TurnRow } from "./history.ts";

export type ForkSpec = number | "all" | "none";

/** Anything unrecognized means "none" — inheriting nothing is the safe default. */
export function parseForkTurns(raw: string | undefined): ForkSpec {
  if (raw === undefined || raw === "none") return "none";
  if (raw === "all") return "all";
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : "none";
}

/**
 * Slices the parent's turns per `spec`, then trims WHOLE turns from the
 * OLDEST end until the result fits `budgetTokens`. Never slices within a
 * turn: that would separate a tool-call from its result and the provider
 * would reject the child's very first request.
 */
export function forkParentHistory(
  turns: TurnRow[],
  spec: string | undefined,
  config: ContextConfig,
  budgetTokens: number,
): ModelMessage[] {
  const parsed = parseForkTurns(spec);
  if (parsed === "none" || turns.length === 0) return [];

  let slice = parsed === "all" ? turns : turns.slice(-parsed);
  while (slice.length > 0 && estimateTokens(JSON.stringify(assembleHistory(slice, config))) > budgetTokens) {
    slice = slice.slice(1);
  }
  if (slice.length === 0) return [];

  // A turn already interrupted mid-tool-call (no matching result ever
  // persisted) survives the whole-turn slicing above as-is; backfill a
  // synthetic result so the provider never sees an unresolved call.
  return ensureToolResultsPresent(assembleHistory(slice, config));
}
