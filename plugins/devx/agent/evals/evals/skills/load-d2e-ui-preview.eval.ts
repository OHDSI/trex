import { defineEval } from "eve/evals";

// #163 split the d2e preview vs screenshot flows into two skills. Opening the
// interactive hot-reload preview panel is d2e-ui-preview's job — NOT
// testing-d2e-ui (build + overwrite + screenshot). This eval and
// load-testing-d2e-ui together assert that split: a "live preview" ask loads
// d2e-ui-preview, a "verify/screenshot" ask loads testing-d2e-ui.
export default defineEval({
  description: "loads the d2e-ui-preview skill for an interactive live-preview request",
  async test(t) {
    await t.send(
      "Open the live hot-reload preview panel for my Data2Evidence (d2e) UI app so I can see my changes as I edit.",
    );
    t.succeeded();
    t.loadedSkill("d2e-ui-preview");
  },
});
