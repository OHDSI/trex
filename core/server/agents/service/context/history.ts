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
export type ToolResultPart = { type: "tool-result"; toolCallId: string; toolName: string; output: unknown };
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
    const p = step.payload as { summary?: string; replacedTurnSeqTo: number };
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
        const raw = typeof p.output === "string" ? p.output : JSON.stringify(p.output ?? "");
        msgs.push({
          role: "tool",
          content: [{
            type: "tool-result", toolCallId: String(p.toolCallId),
            toolName: s.name ?? "", output: truncateMiddle(raw, cap),
          }],
        });
      }
    }
  }
  return msgs;
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
          toolName: part.toolName, output: SYNTHETIC_RESULT_TEXT,
        }],
      });
      resolved.add(part.toolCallId);
    }
  }
  return out;
}
