import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";
import { EVAL_APP_ID, lastAssistantMessage, sendWithMode } from "./helpers";

// plan mode (agent.ts filterTools, mode === "plan") allows ONLY the
// PLAN_MODE_TOOLS allowlist (Read/Glob/Grep/CodeSearch/GitStatus/GitLog/
// GitBranchList/AskUserQuestion/WritePlan/ExitPlanMode/KB*/TaskGet/TaskList/
// CronList/ToolSearch — transcribed at agent.ts:23-31, verified against that
// source directly before writing this eval). The eval asks for three tool
// calls in one turn to make the allowlist real rather than a coincidental
// "read-only tools only" pass:
//   - Read (on the allowlist) must be called, and its real fixture content
//     must appear in the reply — proving this isn't build mode.
//   - DatabaseSchema (read-only, modifiesState: false, but NOT on the
//     allowlist) must NOT be called — proving plan mode is a genuine
//     allowlist, not merely "block mutating tools" (which would allow this
//     tool through, exactly as ask mode does in ask-blocks-mutation.eval.ts).
//   - Write (mutating, also not on the allowlist) must NOT be called.
export default defineEval({
  description: "plan mode allows only the plan allowlist, blocking Write and non-allowlisted read tools alike",
  async test(t) {
    const session = await sendWithMode(
      t,
      `Use the Read tool to read fixture/notes/greeting.txt and tell me the codeword it contains. Then separately use the DatabaseSchema tool with app_id ${EVAL_APP_ID} to list schema names, and use the Write tool to create fixture/tmp/plan-mode.txt containing PLAN_MODE. If a tool isn't available to you, say so rather than pretending to use it.`,
      "plan",
    );
    session.succeeded();
    session.calledTool("Read");
    session.notCalledTool("DatabaseSchema");
    session.notCalledTool("Write");
    t.check(lastAssistantMessage(session.events), includes("PLUM"));
  },
});
