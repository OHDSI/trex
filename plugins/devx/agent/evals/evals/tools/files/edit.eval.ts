import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "modifies a fixture file with the Edit tool",
  async test(t) {
    // Targets its own dedicated marker (FIXTURE_MARKER_EDIT), not FIXTURE_MARKER_ALPHA:
    // grep.eval.ts asserts on FIXTURE_MARKER_ALPHA in the same file, and eve runs the
    // family with real concurrency (run order isn't fixed) — sharing a marker risked
    // grep observing this eval's post-edit rewrite. Fixture keeps both markers in
    // fixture/src/util.ts (see seed.sh) so each eval mutates/reads an independent line.
    await t.send("The file fixture/src/util.ts already exists in your current project workspace. Use the Edit tool to replace the string FIXTURE_MARKER_EDIT with FIXTURE_MARKER_BETA in it, then reply DONE.");
    t.succeeded();
    t.calledTool("Edit");
    t.check(t.reply, includes("DONE"));
  },
});
