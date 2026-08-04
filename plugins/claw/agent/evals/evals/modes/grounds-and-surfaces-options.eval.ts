import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// Gate 1 grounding + option-rendering (facilitate-coding-task steps 4-5): claw
// grounds the task in a real app (listApps) and, when the brainstorm hand-off
// returns multiple real options (the askCodeAgent stub returns two), surfaces
// them to the team as a dropdown (postChoice) rather than picking itself. The
// order assertion pins that the options came FROM the coder and were then
// posted — not a postChoice fabricated without a brainstorm.
export default defineEval({
  description: "claw grounds the ask in an app and surfaces the coder's options as a choice",
  async test(t) {
    const session = await driveClaw(t, "Facilitate the task in this channel.");
    session.calledTool("listApps");
    session.toolOrder(["askCodeAgent", "postChoice"]);
  },
});
