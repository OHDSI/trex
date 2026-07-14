import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "finds a marker string with the Grep tool",
  async test(t) {
    await t.send("Use the Grep tool to find which file under fixture/ contains FIXTURE_MARKER_ALPHA, and reply with the file name.");
    t.succeeded();
    t.calledTool("Grep");
    t.check(t.reply, includes("util.ts"));
  },
});
