import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// Thread-native conversations (#159): when the prompt already carries a
// <thread_messages> block, that IS the recent discussion — claw must NOT
// re-fetch it (instructions.md "Mentions and thread messages";
// facilitate-coding-task step 1). The ask in the block is clear, so claw
// grounds it and hands off to the coder; the point is that it reaches the
// coder WITHOUT calling fetchChannelHistory first.
export default defineEval({
  description: "claw uses an injected <thread_messages> block instead of re-fetching channel history",
  async test(t) {
    const session = await driveClaw(
      t,
      "<thread_messages>\n" +
        "alice: we should add server-side filtering to the sales dashboard\n" +
        "bob: filter by region and date, and results should load under a second\n" +
        "</thread_messages>\n\n" +
        "Yes, let's build that.",
    );
    session.notCalledTool("fetchChannelHistory");
    session.calledTool("askCodeAgent");
  },
});
