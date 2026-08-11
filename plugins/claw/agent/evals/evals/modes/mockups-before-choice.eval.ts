import { defineEval } from "eve/evals";
import { driveClaw } from "../helpers.ts";

// present-mockups skill: a clearly visual design decision goes to the team as
// pictures — claw has the coder mock the options up and screenshot them (the
// askCodeAgent stub's mockup branch returns two trex/screenshots paths), posts
// the images, and only THEN asks for the pick. The ordering is the point: the
// screenshots must be in the channel before the postChoice question.
export default defineEval({
  description: "a visual design decision reaches the team as posted mockup screenshots before the choice",
  async test(t) {
    const session = await driveClaw(t, "Facilitate the task in this channel.", {
      evalDiscussion: [
        {
          author: "alice",
          content: "/trex redesign the sales dashboard filters, we can't decide between a left sidebar and a top toolbar",
        },
        { author: "bob", content: "either works, pick whichever reads better, but the results table must stay visible" },
      ],
    });
    session.calledTool("askCodeAgent");
    session.toolOrder(["postScreenshots", "postChoice"]);
  },
});
