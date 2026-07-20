import { defineEval } from "eve/evals";

// #163 added the testing-d2e-flows skill (trigger a real Prefect flow run over
// the REST API, feed the authtoken input, poll to a terminal state, read logs).
// A request to run/verify a d2e Prefect flow locally should load it.
export default defineEval({
  description: "loads the testing-d2e-flows skill for a d2e Prefect-flow run task",
  async test(t) {
    await t.send(
      "I want to run my Data2Evidence (d2e) Prefect flow locally and confirm it completes. How do I trigger it and check the result?",
    );
    t.succeeded();
    t.loadedSkill("testing-d2e-flows");
  },
});
