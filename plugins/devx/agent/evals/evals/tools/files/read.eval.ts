import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "reads a fixture file with the Read tool",
  async test(t) {
    await t.send("Use the Read tool to read fixture/notes/greeting.txt and tell me the codeword it contains.");
    t.succeeded();
    t.calledTool("Read");
    t.check(t.reply, includes("PLUM"));
  },
});
