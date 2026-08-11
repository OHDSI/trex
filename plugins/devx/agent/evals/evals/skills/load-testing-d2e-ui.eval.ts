import { defineEval } from "eve/evals";

// #163 added the testing-d2e-ui skill (build + overwrite the served resources,
// then drive the real :41100 route with Playwright + Logto). A request to
// verify/screenshot a d2e UI change should load THAT skill. loadedSkill is
// eve sugar for calledTool("load_skill", { input: { skill } }); the built-in
// skill tool is offered in default mode. No fixture/consent prerequisite —
// skill loading is read-only.
export default defineEval({
  description: "loads the testing-d2e-ui skill for a d2e UI verification/screenshot task",
  async test(t) {
    await t.send(
      "I just changed a Data2Evidence (d2e) UI app. Verify it renders correctly and capture a screenshot of the change. What's the right way to do that here?",
    );
    t.succeeded();
    t.loadedSkill("testing-d2e-ui");
  },
});
