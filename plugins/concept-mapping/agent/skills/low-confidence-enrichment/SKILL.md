---
description: Take a second, closer look at a row whose judges agreed weakly (3 of 5 or fewer, a tie, or no winner) or whose retrieval was weak, using wider retrieval and outside context.
---

# Low-confidence enrichment

Use this when `judge_candidates` returned `agreement` of 3 or less, a `tie`, or no winner, or when `retrieve_candidates` reported `retrieval_confidence: "low"`. Weak retrieval counts even if the judges agreed: five judges agreeing on the least bad of several poor candidates is not a good mapping.

1. **Retrieve wider**: `retrieve_candidates` with `limit: 30` and every query variant, including the `core_procedure` query and any new phrasing the judges' definitions suggest. Broader concepts appear here, which is what a broadMatch usually needs.
2. **Get context**: one or two `web_search` calls (when enabled) for the specific code and name, unless the coding-system briefing already has its official description.
3. **Summarize** in one or two sentences what the procedure actually is.
4. **Decide yourself**, once, over the original and the new candidates, by the same rules the judges use: what does the source state, which candidate keeps all of it, and if none does, which is the most specific one that still covers it (`broadMatch`). Compare the hierarchy of the top contenders with `concept_details`.
5. **Save** with `phase: 5`, the original `vote_agreement`, and a `rationale` that says what the extra context changed.

Do not run `judge_candidates` again on the larger pool: repeating the vote with the same instructions mostly repeats the same answer. One careful decision with more context does better.
