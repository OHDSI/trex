import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// The core facilitation gate (facilitate-coding-task, step 3): a vague ask must
// be CLARIFIED with the team before anything reaches the coder. With stubs on,
// fetchChannelHistory returns the vague discussion; assert claw reads it but does
// NOT hand it to askCodeAgent (which, unstubbed, would spawn a real coder turn).
export default defineEval({
  description: "claw reads the channel but does not delegate a vague ask to the coder",
  async test(t) {
    const session = await driveClaw(t, "Facilitate the task in this channel.", {
      evalDiscussion: [{ author: "alice", content: "/trex make the dashboard better" }],
    });
    session.succeeded();
    session.calledTool("fetchChannelHistory");
    session.notCalledTool("askCodeAgent");
  },
});
