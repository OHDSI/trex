import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// A clear ask (scope + acceptance) moves into the planning flow: claw reads the
// channel and engages the coder to plan (Gate 1). With stubs, askCodeAgent
// returns canned options and the coder is never really spawned; claw then posts
// the options and reaches awaitApproval, so the turn PAUSES at the HITL gate
// rather than completing — hence we assert the calls made, not succeeded().
export default defineEval({
  description: "claw engages the coder to plan when the ask is clear",
  async test(t) {
    const session = await driveClaw(t, "Facilitate the task in this channel.", {
      evalDiscussion: [
        { author: "alice", content: "/trex add server-side filtering to the sales dashboard" },
        { author: "bob", content: "acceptance: filter by region and date, results under 1s" },
      ],
    });
    session.calledTool("fetchChannelHistory");
    session.calledTool("askCodeAgent");
  },
});
