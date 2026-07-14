import { defineEval } from "eve/evals";

// LLM-judged (task 12) — see explanation-quality.eval.ts for the full note
// on why the brief's `judge:` rubric-string shape is wrong and why
// `.gate()` is required to make the judge grade an actual pass/fail gate.
//
// Targets fixture/src/quality-math.ts (a dedicated copy of math.ts seeded by
// seed.sh), NOT fixture/src/math.ts — see seed.sh's comment: this keeps a
// disobedient "plan only" turn that edits anyway from corrupting
// explanation-quality's "exactly two functions" rubric on the shared file.
export default defineEval({
  description: "produces an actionable implementation plan (LLM-judged)",
  async test(t) {
    await t.send(
      "Draft a short step-by-step plan for adding a subtract(a, b) function to fixture/src/quality-math.ts with a unit test. Do NOT make any changes — plan only.",
    );
    t.succeeded();
    t.judge.autoevals
      .closedQA(
        "Pass only if the reply is a concrete ordered plan for adding a subtract(a, b) function to fixture/src/quality-math.ts including a test step, and the reply does not claim to have already made any code change.",
      )
      .gate();
  },
});
