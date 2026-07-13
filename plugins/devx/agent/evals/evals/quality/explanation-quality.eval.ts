import { defineEval } from "eve/evals";

// LLM-judged (task 12). The plan-stage brief put a `judge:` STRING (a
// rubric) on defineEval expecting it to gate pass/fail, but that's not how
// eve's judge works. A bare `judge: "<string>"` is not rejected at load time
// by validateEvalInput (which only rejects legacy top-level `model`/
// `modelOptions` keys); it simply does nothing — a per-eval judge string sits
// inert. Real LLM-as-judge grading happens inside test(t) via the call chain
// `t.judge.autoevals.closedQA(criteria).gate()` (see below), which records a
// gate assertion scored by the model configured via this eval's own `judge`
// (absent here) falling back to evals.config.ts's default (a runner-side
// Bedrock model — see evals/lib/judge-model.ts).
//
// `closedQA` records a *soft* assertion by default (see judge.js: severity
// is fixed to `soft` with no threshold) — verified live (see README) that a
// soft assertion with no threshold auto-passes regardless of score
// (collector.js's computePassed: severity soft + threshold undefined + gate
// only defaults threshold to 1 → an unset soft threshold never fails), and
// the eve CLI only turns a `scored` verdict into a nonzero exit code under
// `--strict` (cli/eval.js). Chaining `.gate()` on the returned handle makes
// the grade a real gate (severity "gate", default threshold 1 — closedQA's
// score is 0 or 1), so a "no" verdict fails this eval's exit status without
// needing `--strict`.
export default defineEval({
  description: "explains fixture code accurately (LLM-judged)",
  async test(t) {
    await t.send("Explain what fixture/src/math.ts does.");
    t.succeeded();
    t.judge.autoevals
      .closedQA(
        "Pass only if the reply correctly explains that the module exports exactly two functions, add and multiply, states what each computes, and invents no APIs that are not in the file.",
      )
      .gate();
  },
});
