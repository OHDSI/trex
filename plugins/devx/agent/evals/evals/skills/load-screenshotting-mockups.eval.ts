import { defineEval } from "eve/evals";

// The screenshotting-mockups skill turns prototypes/<screen>/index.html
// mockups (brainstorming visual companion) into PNGs under trex/screenshots/ —
// the hand-off format claw's postScreenshots relays to Discord. A "capture the
// mockups as PNGs" ask should load it (not testing-d2e-ui, which is for built
// app routes, and not d2e-ui-preview, which is the interactive panel).
export default defineEval({
  description: "loads the screenshotting-mockups skill to turn prototype mockups into PNGs",
  async test(t) {
    await t.send(
      "The design mockups are in prototypes/ in my app workspace. Capture a PNG screenshot of each screen so they can be posted to the team's Discord channel.",
    );
    t.succeeded();
    t.loadedSkill("screenshotting-mockups");
  },
});
