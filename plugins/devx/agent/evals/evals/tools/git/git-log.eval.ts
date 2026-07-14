import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "reads commit history with the GitLog tool",
  async test(t) {
    await t.send("The workspace is a git repository (fixture/ is a tracked subdirectory within it). Use the GitLog tool to show its full history and reply with the commit message that mentions the greeting note.");
    t.succeeded();
    t.calledTool("GitLog");
    t.check(t.reply, includes("greeting"));
  },
});
