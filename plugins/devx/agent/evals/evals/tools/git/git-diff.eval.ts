import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "surfaces the uncommitted fixture change with the GitDiff tool",
  async test(t) {
    await t.send("The workspace is a git repository. Use the Write tool to append the line 'diff-eval probe' to fixture/notes/greeting.txt, creating an uncommitted change. Then use the GitDiff tool and reply with the name of the changed file.");
    t.succeeded();
    t.calledTool("GitDiff");
    t.check(t.reply, includes("greeting.txt"));
  },
});
