---
description: Per-check mechanics for running the checks a team picked (code/security/QA/design review, docs update) — which tool to call for which kind, the QA/design dev-server requirement, and the docs-update exception. Referenced from facilitate-coding-task's checks step.
---

# Run the chosen checks

For each check the team picked, call **`runReview`** with the app id and the
matching `kind` (`code`, `security`, `qa`, `design`). That runs devx's
maintained review agent and stores the result in the app's review history, so
the team can re-open it in the devx UI. Do NOT ask the coding agent to
improvise a review instead — it would use a general-purpose coder with none of
those prompts and leave no record.

Reviews take minutes; run them one at a time, `postUpdate` which one is
starting before each (naming what is left in the queue), and post each result
with `postPlan` (title e.g. "Security review", the findings as `text`), noting
the level counts.

`qa` and `design` drive a browser against the app's **dev server** — if it is
not running, `runReview` says so; either start it and retry, or tell the
channel that check was skipped rather than silently dropping it.

These two review the devx app's own dev server only. For **d2e platform UIs**
the real verification is the browser-driven pass against the live route (build
+ overwrite, exercise the route behind Logto) — do not treat a `qa`/`design`
pass as covering that; it is a separate, earlier step in the main flow.

**`Docs update` is the exception — it goes through the coder, not
`runReview`.** The docs must land on the SAME feature branch as the
implementation so they ride the same PR (`runReview`'s docs agent writes to
the shared workspace instead — use it only for standalone docs asks outside a
task). Call `askCodeAgent`: "Use your documenting-d2e-features skill to
document the implemented feature in the docs website (docs/website), verify
with a docs build, and commit on the feature branch. Report the pages you
added or updated." Post the reported pages with `postPlan` (title "Docs
update"). No apply-fixes gate needed — it writes the docs directly.
