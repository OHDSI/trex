import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// Acknowledge before you act (#161, facilitate-coding-task step 4 + the
// "Rule of thumb"): claw posts a one-line status with postUpdate right BEFORE
// each askCodeAgent hand-off, so the channel isn't silent while the coder runs.
// With a clear ask (the default stub discussion), claw reaches Gate 1 and must
// postUpdate before the brainstorm hand-off — asserted via ordering, not just
// presence.
export default defineEval({
  description: "claw posts a status update before handing the work to the coder",
  async test(t) {
    const session = await driveClaw(t, "Facilitate the task in this channel.");
    session.calledTool("postUpdate");
    session.toolOrder(["postUpdate", "askCodeAgent"]);
  },
});
