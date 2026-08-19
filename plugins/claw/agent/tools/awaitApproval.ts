// awaitApproval — put a real approval gate in the channel. Marked
// `needsApproval`, so the agents runtime pauses the turn and the Discord adapter
// renders Approve / Deny buttons (vendor/discord/hitl.ts); the click resumes the
// session. execute() only runs after Approve, so its return means "approved" —
// a Deny comes back to the caller as a denial from the runtime.
//
// Call it AFTER postPlan so the plan card sits right above the buttons. The
// button label is currently the generic runtime approve/deny; `what` is recorded
// on the request and echoed back so the facilitator knows which gate resolved.
//
// execute() runs ONLY on approve (a Deny never reaches here), so this is the
// one place that unconditionally captures a gate resolution — both a button
// click and a typed "approve" in the thread (the text-resume path still ends up
// here; see channels/layer.ts) land on the same execute(). Appended to the
// decision ledger so the hand-off after this one never re-asks it.
//
// The ledger write must NEVER be able to turn an already-granted
// human approval into a failed gate. It's wrapped in its own try/catch — a
// throwing appendDecision (DB blip, connection reset) is logged distinctly
// and swallowed; the approval still returns normally. A missing sql or
// sessionId skips the write outright rather than attempting a doomed/
// mis-keyed one (an empty-string sessionId would otherwise write a row keyed
// on "").
import { defineTool } from "eve/tools";
import { appendDecision, type QueryFn } from "../lib/state.ts";

// Exported separately so the decision-recording behavior is testable without
// going through defineTool's execute plumbing (same shape as
// postDevSummaryCore/askCore elsewhere in this package).
export async function awaitApprovalCore(
  sql: QueryFn | undefined,
  sessionId: string | undefined,
  what: string,
): Promise<{ approved: true; what: string }> {
  if (sql && sessionId) {
    try {
      await appendDecision(sql, sessionId, { question: what, decision: "approved" });
    } catch (e) {
      console.error(`awaitApproval: failed to record decision for session ${sessionId} — approval still stands:`, e);
    }
  }
  return { approved: true, what };
}

export default defineTool({
  description:
    "Ask the channel to approve the current step with Approve/Deny buttons, and wait for the " +
    "click. Call this right AFTER postPlan at each planning gate. On Approve it returns " +
    "{approved:true} and you proceed to the next step; a Deny comes back as a denial — revise " +
    "and gate again. Never move past a gate without calling this.",
  inputSchema: {
    type: "object",
    properties: {
      what: {
        type: "string",
        description: "Short label of what's being approved, e.g. 'the plan' or 'design option B'.",
      },
    },
    required: ["what"],
  },
  needsApproval: true,
  execute: (input, ctx) => {
    const { what } = input as { what: string };
    return awaitApprovalCore(ctx?.sql, ctx?.sessionId, what);
  },
});
