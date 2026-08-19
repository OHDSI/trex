// recordDecision (claw-devx-reliability). awaitApproval records
// a gate's outcome on its own (see that file), but most settled decisions
// never go through a gate: a postChoice dropdown pick resumes the session as
// a plain message with NO callback into postChoice's execute() (see that
// file's comment — the majority path in the measured baseline, 63 picks vs
// 35 approvals), and plenty of decisions are just settled in plain
// conversation. This tool is claw's own way of putting either into the
// ledger, so the hand-off after this one never re-asks it.
//
// Deliberately NOT recorded from core/server/agents/channels/adapters/discord.ts:
// claw.orchestrations is a claw-owned table and that adapter is shared
// channel infrastructure — the layering must not invert.
import { defineTool } from "eve/tools";
import { appendDecision, type QueryFn } from "../lib/state.ts";

interface Input { question: string; decision: string }

// Exported separately so this is testable without going through defineTool's
// execute plumbing (same shape as askCore/postDevSummaryCore/awaitApprovalCore
// elsewhere in this package).
export async function recordDecisionCore(sql: QueryFn, sessionId: string, input: Input): Promise<{ recorded: true }> {
  await appendDecision(sql, sessionId, { question: input.question, decision: input.decision });
  return { recorded: true };
}

export default defineTool({
  description:
    "Record a decision the team just settled, so it rides every future hand-off and is never " +
    "re-asked. Call this right after a postChoice pick resumes your session with the chosen " +
    "value, or right after a teammate settles something in plain conversation (not through a " +
    "gate). `question` is a short, stable label for the topic (so a later mention of the same " +
    "topic matches, e.g. 'follow-up window'); `decision` is what was decided. Do NOT call this " +
    "for a plain approve/deny — awaitApproval already records those on its own.",
  inputSchema: {
    type: "object",
    properties: {
      question: { type: "string", description: "Short, stable label for what was decided, e.g. 'follow-up window'." },
      decision: { type: "string", description: "What was decided, e.g. 'configurable, default 365 days'." },
    },
    required: ["question", "decision"],
  },
  execute: (input, ctx) => {
    if (!ctx?.sql) throw new Error("recordDecision: ctx.sql unavailable");
    return recordDecisionCore(ctx.sql, ctx.sessionId, input as Input);
  },
});
