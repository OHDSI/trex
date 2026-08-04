import { defineEval } from "eve/evals";

export default defineEval({
  description: "delegates to the code-reviewer subagent via the agent tool",
  async test(t) {
    await t.send("Use your agent tool to delegate to the code-reviewer subagent: ask it to review fixture/src/math.ts, then relay its verdict in one sentence.");
    t.succeeded();
    t.calledTool("agent");
  },
});
