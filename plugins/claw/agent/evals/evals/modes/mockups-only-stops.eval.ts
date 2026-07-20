import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// present-mockups mockups-only mode: when the team asks just for design ideas,
// the posted screenshots are the deliverable. The postChoice stub returns
// immediately (no HITL park), so a claw that wrongly treats this as a build
// task would barrel on to Gate 2 in the same turn — a plan hand-off ending in
// awaitApproval. Asserting no awaitApproval catches exactly that overrun.
export default defineEval({
  description: "a mockups-only ask ends with posted screenshots, not a plan gate",
  async test(t) {
    const session = await driveClaw(t, "Facilitate the task in this channel.", {
      evalDiscussion: [
        {
          author: "alice",
          content: "/trex just mock up a few design ideas for the sales dashboard empty state, no need to build anything yet",
        },
      ],
    });
    session.calledTool("postScreenshots");
    session.notCalledTool("awaitApproval");
  },
});
