import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "agent self-identifies as Code (rename regression)",
  async test(t) {
    await t.send("In one sentence, introduce yourself. What is your name?");
    t.succeeded();
    t.check(t.reply, includes("Code"));
  },
});
