---
description: Turn one source row into search queries (an English name, a clean reformulation, alternative phrasings) and a short factual description. Use for every row before retrieve_candidates.
---

# Query fan-out

Retrieval finds what it is asked for, so give it several good phrasings of the same procedure. Use the institution's coding-system briefing.

- **english_name**: if `source_name` is missing or not English, translate `original_source_name` into clinical English, literally and with medical terms. Leave abbreviations you cannot resolve as they are. If `source_name` is English, use it unchanged.
- **reformulated**: one clean term in the style of standard terminology, built from the English name. Remove what only matters for billing or documentation (session or side units, cost remarks, "without complications"), the patient's condition ("in patients with ...") and procedures the source says were not done ("without removal of ..."). Keep everything that describes the act, including "without contrast", for which explicit concepts exist. Replace Latin or unusual anatomy with the common clinical term and spell out abbreviations.
- **synonyms**: three to five other ways the vocabulary may phrase it: a different word order, an "X of Y" form, the common short form, and the radiology-style or surgery-style name where that applies.
- **core_procedure**: just the action and the body part, with every qualifier dropped. Do not use it in the first retrieval, since a deliberately broad query pushes specific concepts down; it belongs to the wider retrieval of low-confidence rows.
- **system_description**: one or two factual sentences on what the code is and which system it belongs to (for example: "National reimbursement catalog code; covers one session of one-to-one psychotherapy."). Do not add opinions about how to map it: such hints make all judges lean the same way and weaken the vote.

Then call `retrieve_candidates` with `queries` = [source_name (if present), english_name, reformulated, ...synonyms], and pass `system_description` as `coding_system` to `judge_candidates`.
