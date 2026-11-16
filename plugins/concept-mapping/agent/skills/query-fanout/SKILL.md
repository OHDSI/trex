---
description: Turn one source row into retrieval queries (English name, cleaned reformulation, synonyms) and a factual coding-system description. Use for every row before retrieve_candidates (phase 2).
---

# Query fan-out (phase 2)

For each row, produce the fields below. More good variants mean a higher chance that the right concept reaches the top candidates. Use the coding-system briefing from phase 1.

0. **english_name**: if `source_name` is empty or not English (check the script and the phase 1 language), translate `original_source_name` to clinical English. Translate literally, using medical terminology; keep code-system abbreviations you are unsure about and expand them in step 1. If `source_name` is English, use it verbatim. The standard vocabularies are English-centric, so non-English queries retrieve poorly.
1. **reformulated**: one clean, SNOMED-style term built from `english_name`. Keep "without contrast" (explicit concepts for it exist). Strip billing noise ("per session", "per side", "without the cost of materials", "without complications"), disease status ("with heart failure") and excluded concomitant procedures ("without removal of lymph nodes"), replace Latin anatomy ("viscerocranium" becomes "face" or "facial bones"), expand abbreviations ("ECC" becomes "extracorporeal circulation"). This is the primary query.
2. **synonyms**: 3 to 5 alternative phrasings likely to exist in the vocabularies. For a plain X-ray of a joint, include a "plain X-ray of <joint>" form, a "radiography of <site>" form, and short forms ("<site> X-ray"). Use the anatomy and qualifiers of the source, not of this example.
2b. **core_procedure**: the bare action and site with every qualifier dropped (method, approach, guidance, laterality, device, billing units), e.g. "removal of <organ>" for a laparoscopic, image-guided removal of that organ. Do not use it in the first retrieval (a deliberately broad query would push specific concepts down); it is for the wider retrieval of low-confidence rows.
3. **system_description**: 1 or 2 factual sentences combining the coding system and what the code denotes, e.g. "National reimbursement catalog code; covers one session of one-to-one psychotherapy." Keep it factual. **Do not add judgment hints** such as "prefer site-agnostic" or "K is critical": hints correlate the judges' errors and bias the vote.

Then call `retrieve_candidates` with `queries` = [source_name (if present), english_name, reformulated, ...synonyms] and pass `system_description` as `coding_system` to `judge_candidates`.
