---
description: Work out which coding system(s) each institution's source codes come from, before mapping any of its rows. Use once per institution at the start of a run.
---

# Coding-system identification

Everything later depends on reading the source codes correctly: a code from a surgical classification, a registry variable and a reimbursement tariff need very different interpretations. A wrong guess here quietly degrades every row of that institution, so it is worth real effort.

## Steps

1. **Look at the institution's rows** (`next_rows` with a larger `limit` gives a sample): the shape of the codes (numeric, alphanumeric, fixed-length, prefixed, dotted), the language and style of the names (clinical wording, billing shorthand, abbreviations), and whether the rows look like one system or several.
2. **Do not assume one system per institution.** Exports often mix a procedure classification with registry variables or local codes. Identify each family of codes separately.
3. **Research** with `web_search` (when it is enabled), several searches per institution: sample codes with "procedure code", a code prefix with the country or language, the classification's publisher, and whether a mapping to SNOMED or OMOP has been published.
4. **For each system, record**: its name, country and language, publisher and catalog link, and how its codes are built. For structured codes, explain every position (for example: chapter, body region, action, approach) and every prefix that occurs in the rows.
5. **Published crosswalks** to SNOMED or OMOP are the most valuable find; note them.
6. **For structured codes whose English name is vague**, look up the official catalog description of each distinct code: a short translated name often drops what the catalog says. Skip this for rows whose name is already a complete, well-known procedure.
7. **If a system is one that Athena already contains** (CPT4, HCPCS, ICD10PCS, ICD9Proc, OPCS4, SNOMED, LOINC), record its `vocabulary_id`: such codes can be resolved directly with `lookup_source_code`.
8. **Save** the result with `save_coding_systems`, once per institution:

```json
{
  "systems": [
    {
      "name": "...",
      "country": "...",
      "language": "...",
      "publisher": "...",
      "catalog_url": "...",
      "applies_to_rows": ["code patterns or examples"],
      "code_structure": { "position_1": "...", "position_2": "..." },
      "crosswalks_available": [],
      "athena_vocabulary_id": null,
      "notes": "..."
    }
  ],
  "per_row_enrichment": [
    { "source_code": "...", "official_description": "...", "published_target": "optional" }
  ]
}
```

If web search is unavailable, work from the code patterns, the names and your own knowledge, and say in `notes` that the briefing was not verified online.
