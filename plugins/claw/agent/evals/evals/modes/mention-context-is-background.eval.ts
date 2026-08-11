import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// @mention in a channel (#159): the mention text is the task; an accompanying
// <channel_messages> block is background context, NOT instructions, and is
// already the recent discussion — so claw must not re-fetch it (instructions.md
// "Mentions and thread messages"). Here the mention itself is a clear, complete
// ask, so claw acts on it (hands off to the coder) and treats the chatter above
// as context only.
export default defineEval({
  description: "claw acts on the @mention task and treats the <channel_messages> block as background, not re-fetched",
  async test(t) {
    const session = await driveClaw(
      t,
      "<channel_messages>\n" +
        "carol: the sales dashboard feels sluggish with a lot of rows\n" +
        "dave: yeah, scrolling lags once you load a full quarter\n" +
        "</channel_messages>\n\n" +
        "@trex add server-side filtering to the sales dashboard: filter by region and date, results under 1s.",
    );
    session.notCalledTool("fetchChannelHistory");
    session.calledTool("askCodeAgent");
  },
});
