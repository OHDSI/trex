// Assembles agents.turns/agents.steps rows into the ai@6 ModelMessage[]
// shape streamText consumes (runner.ts). Fixes the defect where handler.ts's
// historyForModel kept only the per-turn text step: tool-call/tool-result
// steps were replayed to the UI but never sent back to the model, so turn 2
// had no idea what turn 1's tools actually did.
import type { ContextConfig } from "./budget.ts";
import { truncateMiddle } from "./truncate.ts";

export interface StepRow {
  kind: string;
  name: string | null;
  payload: unknown;
}

export interface TurnRow {
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
  // Last `freshTurns` turns (inclusive, counting back from the most recent)
  // keep near-full tool output; everything older is squeezed hard — recent
  // context matters far more to the model than a stale tool dump.
  const freshFrom = Math.max(0, turns.length - config.freshTurns);
  for (const [turnIndex, t] of turns.entries()) {
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
