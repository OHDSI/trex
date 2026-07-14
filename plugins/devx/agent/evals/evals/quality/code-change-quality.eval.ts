import { defineEval } from "eve/evals";

// LLM-judged (task 12) — see explanation-quality.eval.ts for the full note
// on why the brief's `judge:` rubric-string shape is wrong and why
// `.gate()` is required to make the judge grade an actual pass/fail gate.
//
// Mutates fixture/src/quality-math.ts (NOT fixture/src/math.ts) via the Edit
// tool; relies on the sticky "always" consent row for Edit already seeded
// per README's "Mutating-tool HITL approval" section (no new consent row
// needed here). Uses a dedicated copy of math.ts, seeded by seed.sh,
// specifically so this eval's mutation never pollutes
// quality/explanation-quality's "exactly two functions, add and multiply"
// rubric on the shared file (see seed.sh's comment for the full collision
// hazard — this bit us empirically: a first pass of all three quality evals
// passed 3/3, but a second run without reseeding regressed
// explanation-quality because a prior code-change-quality run had already
// added subtract() to what was then the shared math.ts).
export default defineEval({
  description: "makes a minimal correct code change (LLM-judged)",
  async test(t) {
    await t.send(
      "Add a subtract(a, b) function that returns a - b to fixture/src/quality-math.ts. Make the smallest possible change, then summarize exactly what you changed.",
    );
    t.succeeded();
    t.judge.autoevals
      .closedQA(
        "Pass only if the reply indicates a subtract(a, b) function returning a - b was added to fixture/src/quality-math.ts via a small targeted edit, with no unrelated changes described.",
      )
      .gate();
  },
});
