import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "creates a file with the Write tool",
  async test(t) {
    await t.send("Use the Write tool to create fixture/tmp/write-eval.txt containing exactly WRITE_EVAL_TOKEN, then reply DONE.");
    t.succeeded();
    t.calledTool("Write");
    t.check(t.reply, includes("DONE"));
  },
});
