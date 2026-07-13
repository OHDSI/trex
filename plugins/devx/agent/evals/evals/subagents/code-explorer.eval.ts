import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "delegates to the code-explorer subagent via the agent tool",
  async test(t) {
    await t.send("Use your agent tool to delegate to the code-explorer subagent: ask it what functions fixture/src/math.ts exports, then relay its answer.");
    t.succeeded();
    t.calledTool("agent");
    t.check(t.reply, includes("multiply"));
  },
});
