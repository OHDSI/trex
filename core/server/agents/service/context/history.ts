// Assembles agents.turns/agents.steps rows into the ai@6 ModelMessage[]
// shape streamText consumes (runner.ts). Fixes the defect where handler.ts's
// historyForModel kept only the per-turn text step: tool-call/tool-result
// steps were replayed to the UI but never sent back to the model, so turn 2
// had no idea what turn 1's tools actually did.
import type { ContextConfig } from "./budget.ts";
import { truncateMiddle } from "./truncate.ts";
import { SUMMARY_PREFIX } from "./prompts.ts";

export interface StepRow {
  kind: string;
  name: string | null;
  payload: unknown;
}

export interface TurnRow {
  // Optional: task-11 fixtures and most callers only need `seq` for ordering.
  // handler.ts's pre-turn compaction wiring (compact.ts's maybeCompact) needs
  // the row's actual id to attach a "compaction" step to the right turn, so
  // store.ts's getHistory now selects it too.
  id?: string;
  seq: number;
  message: unknown;
  metadata: unknown;
  steps: StepRow[];
}

export type AssistantPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown };
// ai@6 requires a tool result's `output` to be the tagged ToolResultOutput
// union, not a bare value: standardizePrompt rejects anything else with
// AI_InvalidPromptError BEFORE the provider is reached, so every turn that
// followed a turn containing a tool call died. Only the two shapes a replay
// can produce are modelled here — `error-text`/`execution-denied` belong to
// the SDK's own live path, which builds its messages itself.
export type ToolResultOutput = { type: "text"; value: string } | { type: "json"; value: unknown };
export type ToolResultPart = { type: "tool-result"; toolCallId: string; toolName: string; output: ToolResultOutput };
export type ModelMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: AssistantPart[] }
  | { role: "tool"; content: ToolResultPart[] };

export function assembleHistory(turns: TurnRow[], config: ContextConfig): ModelMessage[] {
  const msgs: ModelMessage[] = [];

  // Resume from the newest compaction checkpoint, if one exists: everything
  // up to and including the turn that carries the "compaction" step was
  // folded into that step's summary by compact.ts's maybeCompact and is
  // never replayed again. Only the LATEST checkpoint matters — an earlier
  // one is itself inside the range this one already replaced.
  let scopeStart = 0;
  let summary: string | null = null;
  for (const [i, t] of turns.entries()) {
    const step = t.steps.find((s) => s.kind === "compaction");
    if (!step) continue;
    // Only `summary` is read. The payload also carries replacedTurnSeqTo /
    // replacedTurnSeqFrom / tokensBefore / tokensAfter (see handler.ts's
    // persist), but resumption here is by ARRAY POSITION — the checkpoint
    // step hangs off the last replaced turn, so `i + 1` is the resume point —
    // and naming a field this function never consults implied otherwise.
    const p = step.payload as { summary?: string };
    summary = p.summary ?? null;
    scopeStart = i + 1;
  }
  const scoped = turns.slice(scopeStart);
  if (summary) msgs.push({ role: "user", content: SUMMARY_PREFIX + summary });

  // Last `freshTurns` turns (inclusive, counting back from the most recent)
  // keep near-full tool output; everything older is squeezed hard — recent
  // context matters far more to the model than a stale tool dump. Counted
  // within the post-checkpoint scope, not the raw turn list.
  const freshFrom = Math.max(0, scoped.length - config.freshTurns);
  for (const [turnIndex, t] of scoped.entries()) {
    msgs.push({ role: "user", content: typeof t.message === "string" ? t.message : JSON.stringify(t.message) });
    for (const s of t.steps) {
      const p = (s.payload ?? {}) as Record<string, unknown>;
      if (s.kind === "text" && typeof p.text === "string") {
        msgs.push({ role: "assistant", content: [{ type: "text", text: p.text }] });
      } else if (s.kind === "tool-call") {
        msgs.push({
          role: "assistant",
          content: [{ type: "tool-call", toolCallId: String(p.toolCallId), toolName: s.name ?? "", input: p.input }],
        });
      } else if (s.kind === "tool-result") {
        const cap = turnIndex >= freshFrom ? config.freshToolOutputChars : config.staleToolOutputChars;
        msgs.push({
          role: "tool",
          content: [{
            type: "tool-result", toolCallId: String(p.toolCallId),
            toolName: s.name ?? "", output: toResultOutput(p.output, cap),
          }],
        });
      }
    }
  }
  return msgs;
}

/**
 * Tags a stored tool output as ai@6's ToolResultOutput, applying the tier cap.
 *
 * toolset.ts's wrapToolWithCap returns a result UNCHANGED when it already
 * fits, so agents.steps genuinely holds objects as well as strings: a
 * structured result stays structured (`json`) instead of being flattened into
 * a string the model has to re-parse. Only the string form is truncatable, so
 * anything over the tier cap is serialized once and lands as `text` carrying
 * truncateMiddle's header. The stale tier's cap is far smaller than the
 * storage-time cap, so an object CAN be over it here despite being under it
 * when stored — measuring rather than assuming is what keeps the stale
 * squeeze real.
 *
 * null/undefined becomes `{type:"json", value:null}`: a tool that returned
 * nothing is faithfully "no value", and json reaches the wire as the literal
 * `null` rather than as an empty text block, which some providers reject.
 */
function toResultOutput(output: unknown, cap: number): ToolResultOutput {
  if (typeof output === "string") return { type: "text", value: truncateMiddle(output, cap) };
  if (output === null || output === undefined) return { type: "json", value: null };
  let text: string | undefined;
  try {
    text = JSON.stringify(output);
  } catch {
    // Circular / BigInt-bearing: wrapToolWithCap deliberately passes such a
    // result through uncapped rather than failing the tool, so it can reach
    // storage. Failing to MEASURE it must not kill the turn replaying it.
    return { type: "text", value: truncateMiddle(String(output), cap) };
  }
  // undefined comes back for a value JSON cannot represent at all (a bare
  // function or symbol) — nothing to send, same as no result.
  if (text === undefined) return { type: "json", value: null };
  return text.length <= cap ? { type: "json", value: output } : { type: "text", value: truncateMiddle(text, cap) };
}

export const SYNTHETIC_RESULT_TEXT = "[no result recorded — turn was interrupted]";

/**
 * Every tool-call must have a matching tool-result or the provider rejects the
 * request. Runs on EVERY assembly, not just on resume: an interrupted turn
 * would otherwise poison the session permanently.
 */
export function ensureToolResultsPresent(msgs: ModelMessage[]): ModelMessage[] {
  const resolved = new Set<string>();
  for (const m of msgs) {
    if (m.role === "tool") for (const p of m.content) resolved.add(p.toolCallId);
  }
  const out: ModelMessage[] = [];
  for (const m of msgs) {
    out.push(m);
    if (m.role !== "assistant") continue;
    for (const part of m.content) {
      if (part.type !== "tool-call" || resolved.has(part.toolCallId)) continue;
      out.push({
        role: "tool",
        content: [{
          type: "tool-result", toolCallId: part.toolCallId,
          toolName: part.toolName, output: { type: "text", value: SYNTHETIC_RESULT_TEXT },
        }],
      });
      resolved.add(part.toolCallId);
    }
  }
  return out;
}
