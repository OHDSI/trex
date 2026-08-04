import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { EVAL_APP_ID, lastAssistantMessage, sendWithMode } from "./helpers";

// ask mode (agent.ts filterTools, mode === "ask") drops ONLY tools carrying
// `modifiesState: true` plus the built-in "agent" tool — everything else
// stays available, including read-only tools that plan mode's narrower
// allowlist would still exclude. The eval asks for two tool calls in one
// turn to make that two-sided semantics non-vacuous:
//   - DatabaseSchema (modifiesState: false, NOT in agent.ts's
//     PLAN_MODE_TOOLS) must still be called — proving this isn't build mode
//     (which blocks everything) and isn't plan mode (which would block this
//     specific tool despite it being just as read-only as Read).
//   - Write (modifiesState: true) must NOT be called despite being asked
//     for directly — proving this isn't the framework default, which
//     allows it (see default-allows.eval.ts).
export default defineEval({
  description: "ask mode allows non-mutating tools outside the plan allowlist but blocks Write",
  async test(t) {
    const session = await sendWithMode(
      t,
      `Use the DatabaseSchema tool with app_id ${EVAL_APP_ID} to list the names of some schemas that exist in the database. Then separately use the Write tool to create fixture/tmp/ask-mode.txt containing ASK_MODE. If a tool isn't available to you, say so rather than pretending to use it.`,
      "ask",
    );
    session.succeeded();
    session.calledTool("DatabaseSchema");
    session.notCalledTool("Write");
    t.check(lastAssistantMessage(session.events), includes("devx"));
  },
});
