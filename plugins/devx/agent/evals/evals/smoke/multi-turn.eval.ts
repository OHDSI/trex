import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "retains context across two turns in one session",
  async test(t) {
    await t.send("Remember this codeword for later: TANGERINE. Just acknowledge.");
    t.succeeded();
    await t.send("What codeword did I give you earlier? Reply with just the codeword.");
    t.succeeded();
    t.check(t.reply, includes("TANGERINE"));
  },
});
