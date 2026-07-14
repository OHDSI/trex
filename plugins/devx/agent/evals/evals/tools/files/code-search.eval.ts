import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "locates a function definition with the CodeSearch tool",
  async test(t) {
    await t.send("Use the CodeSearch tool to find where the function multiply is defined under fixture/, and reply with the file name.");
    t.succeeded();
    t.calledTool("CodeSearch");
    t.check(t.reply, includes("math.ts"));
  },
});
