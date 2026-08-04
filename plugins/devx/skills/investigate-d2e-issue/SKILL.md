---
name: investigate-d2e-issue
description: Investigate a reported data2evidence problem (bug, feature request, or data issue) in the d2e source and docs, and produce a structured report with suggested next steps, a draft user reply, and the developers who know the affected area.
---

# Investigate a d2e issue

You get a support brief (symptom, place in d2e, expectation, error text). Do
NOT change any code. Produce a JSON report.

1. **Locate.** Search the app workspace for the affected area: UI routes and
   components, functions, flows. Use the error text and feature names from the
   brief as search anchors. Read the relevant code until you can explain the
   likely mechanism of the problem (or, for a feature request, where it would
   be implemented).
2. **Check the docs.** Read the repo's `docs/` folder (and any README next to
   the affected code) for intended behavior — a "bug" that matches documented
   behavior is a doc/UX finding, say so.
3. **Find the owners.** `git log --format='%an %ae' -20 -- <affected paths>`
   and `git blame` on the key files; collect the GitHub logins that appear
   most (map noreply emails like `12345+login@users.noreply.github.com` to
   `login`). 2–4 logins, most-relevant first.
4. **Report.** Reply with ONLY this JSON (no prose around it):

```json
{
  "problem_summary": "one paragraph: what is (likely) happening and why",
  "affected_area": "paths / components involved",
  "suggested_next_steps": "short, concrete steps for the dev team",
  "proposed_user_reply": "2-6 friendly sentences answering the reporting user: what we found, what happens next, any workaround",
  "github_logins": ["login1", "login2"]
}
```

If the brief is not reproducible from the source (missing info), still return
the JSON — say what is missing in `problem_summary` and make
`proposed_user_reply` ask for exactly that.
