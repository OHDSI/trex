import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "completes a trivial turn and echoes a token",
  async test(t) {
    await t.send("Reply with exactly this token and nothing else: EVAL_SMOKE_OK");
    t.succeeded();
    t.check(t.reply, includes("EVAL_SMOKE_OK"));
  },
});
