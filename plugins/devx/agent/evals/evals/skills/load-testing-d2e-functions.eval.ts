import { defineEval } from "eve/evals";

// #163 added the testing-d2e-functions skill (exercise an edge function against
// a full d2e stack in the same trex — edge runtime, register, hot-reload, real
// Postgres). A request to run/test a d2e function locally should load it.
export default defineEval({
  description: "loads the testing-d2e-functions skill for a d2e edge-function testing task",
  async test(t) {
    await t.send(
      "How do I run and test my edit to a Data2Evidence (d2e) edge function locally against the stack running in this trex?",
    );
    t.succeeded();
    t.loadedSkill("testing-d2e-functions");
  },
});
