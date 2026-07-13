import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "creates a commit with the GitCommit tool",
  async test(t) {
    await t.send("The workspace is a git repository. Use the Write tool to create a new file fixture/CHANGELOG.md containing 'eval entry'. Then use the GitCommit tool (not a shell command) with the message 'eval: add changelog' to commit your changes. Reply DONE once the commit exists.");
    t.succeeded();
    t.calledTool("GitCommit");
    t.check(t.reply, includes("DONE"));
  },
});
