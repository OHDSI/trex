import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "lists fixture TypeScript files with the Glob tool",
  async test(t) {
    await t.send("Use the Glob tool to list all .ts files under fixture/ and reply with their file names.");
    t.succeeded();
    t.calledTool("Glob");
    t.check(t.reply, includes("math.ts"));
  },
});
