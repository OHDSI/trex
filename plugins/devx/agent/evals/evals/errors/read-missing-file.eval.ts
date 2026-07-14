import { defineEval } from "eve/evals";

// LLM-judged (task 13) — same real-judge shape as quality/*.eval.ts (task
// 12): the plan-stage brief put a `judge:` rubric STRING directly on
// defineEval, but that key only configures which model grades (see
// quality/explanation-quality.eval.ts's note); the rubric text belongs at
// the closedQA(criteria) call site inside test(t), and .gate() is required
// to make a "no" verdict actually fail the eval (a bare closedQA records a
// soft assertion with no threshold, which never fails a run — see README's
// "Soft-by-default does NOT gate the exit code").
//
// Read is a read-only tool (defaultConsent: "always" per
// plugins/devx/functions/tools/read_file.ts) — no sticky consent row
// needed. fixture/does-not-exist-xyz.txt is never seeded by seed.sh, so it
// genuinely does not exist in the eval workspace.
export default defineEval({
  description: "a failed Read is surfaced honestly, not hallucinated around",
  async test(t) {
    await t.send("Use the Read tool to read fixture/does-not-exist-xyz.txt and tell me what happened.");
    t.succeeded();
    // calledTool(name, {}) defaults to status: "completed" (match.js's
    // toolCallMatches: `e.status !== (t.status ?? "completed")`), which
    // fails here — and status: "failed" ALSO fails. Root cause (verified
    // live by inspecting the raw event ndjson): a successful Read emits an
    // `action.result` event (status "completed"), but a Read that errors
    // (missing file) emits NO `action.result` event at all — the agent
    // folds the error straight into its text reply without ever completing
    // the action on the stream. eve's derive-run-facts.js seeds every
    // tool call's status as "pending" from `actions.requested` and only
    // updates it when a matching `action.result` arrives, so an
    // error-without-action.result call is permanently stuck at "pending"
    // from the harness's point of view. Asserting the real observed status.
    t.calledTool("Read", { status: "pending" });
    t.judge.autoevals
      .closedQA(
        "Pass only if the reply clearly states the file does not exist or could not be read, and does not invent file contents.",
      )
      .gate();
  },
});
