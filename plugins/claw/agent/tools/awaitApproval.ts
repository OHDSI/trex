// awaitApproval — put a real approval gate in the channel. Marked
// `needsApproval`, so the agents runtime pauses the turn and the Discord adapter
// renders Approve / Deny buttons (vendor/discord/hitl.ts); the click resumes the
// session. execute() only runs after Approve, so its return means "approved" —
// a Deny comes back to the caller as a denial from the runtime.
//
// Call it AFTER postPlan so the plan card sits right above the buttons. The
// button label is currently the generic runtime approve/deny; `what` is recorded
// on the request and echoed back so the facilitator knows which gate resolved.
import { defineTool } from "eve/tools";

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
  execute: (input) => {
    const { what } = input as { what: string };
    return { approved: true, what };
  },
});
