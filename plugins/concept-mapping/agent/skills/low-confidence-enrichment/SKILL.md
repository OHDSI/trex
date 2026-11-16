---
description: Re-examine a row whose judge agreement was 3/5 or lower, whose vote tied, or whose retrieval confidence was low, using wider retrieval and web context (phase 5).
---

# Low-confidence enrichment (phase 5)

Use this for a row when `judge_candidates` returned `agreement <= 3`, `tie: true`, or no winner, **or** `retrieve_candidates` returned `retrieval_confidence: "low"` (even if the vote was unanimous: unanimous agreement on weak candidates is the signature of all judges settling on the least-bad option because the right concept was not retrieved).

1. **Wider retrieval**: call `retrieve_candidates` with `limit: 30` and all query variants (source name, english_name, reformulated, synonyms, plus any new phrasing the judges' definitions suggest). In testing this surfaced better candidates in most low-confidence rows.
2. **Web context**: 1 or 2 `web_search` calls for the specific source code and name, unless phase 1 already saved an official description for this code.
3. Write a 1 or 2 sentence `enrichment_summary` of what the procedure is.
4. **One careful re-evaluation by you** over the merged pool (the original candidates plus the 30 new ones). Apply the same rules the judges use: define the procedure, list the qualifiers stated in the source, eliminate candidates one by one, keep the most specific concept that adds no qualifier the source lacks, and use `broadMatch` when the best concept loses a stated qualifier. Use `concept_details` to compare the hierarchy of your top contenders.
5. Save with `phase: 5`, `vote_agreement` from the original vote, and a `rationale` that cites the enrichment.

Do **not** re-run `judge_candidates` on the expanded pool. Re-voting adds noise: the judges converge on the same answer from the same prompt. A single careful re-evaluation with the wider pool and web context works better.
