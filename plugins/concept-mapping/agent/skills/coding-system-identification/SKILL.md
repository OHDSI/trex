---
description: Identify each institution's source coding system(s) with web research before mapping any row. Use once per institution at the start of a run (phase 1); this is the highest-leverage step.
---

# Coding-system identification (phase 1)

Correctly identifying the coding system is the single biggest accuracy lever. In evaluation, a richer phase 1 lifted the weakest institution from 38.9% to 72.2%, almost entirely by labelling its coding system correctly. A wrong label propagates to every later phase. Spend generously here.

## Steps

1. Group rows by `source_data_identifier` (one value = one institution or source system). `start_run` returns the groups; use `next_rows` with a larger `limit` to look at samples.
2. For each group, examine:
   - `source_code` patterns: numeric or alphanumeric, prefix structure, mixed formats within one institution.
   - `original_source_name` language and register: Greek, Dutch, German, Norwegian; billing shorthand or clinical prose.
   - `source_name` style: medical jargon, billing language, abbreviations.
3. Research with `web_search` until you are confident: budget **5 to 10 searches per institution**, not 1 to 3. Useful queries:
   - `"<sample source_code>" medical procedure code`
   - `"<prefix>" procedure classification <country or language>`
   - `"<code family>" catalog site:<national publisher>`
   - `"<coding system>" SNOMED crosswalk OR mapping`
   - for numeric-only codes, try sample values against registry variable dictionaries (cancer, birth, pharmacy registries).
4. Do not assume one institution uses one system. One training institution mixed Norwegian cancer-registry integer codes, Medical Birth Registry variable names and NCSP surgical codes; mislabelling it cost about 30 points.
5. For each system, find the official publisher and catalog URL and document the **full prefix taxonomy**. Decode every position of compositional codes (e.g. NCSP: letter = chapter, digit = region, letter = action, letter = modality) and enumerate every alphanumeric body-system prefix that appears in the rows (e.g. Austrian MEL BA, BB, BC, BD, BH).
6. Look for published SNOMED or OHDSI crosswalks for the system. Some national authorities publish them; treat them as top-quality evidence.
7. For structured-code institutions (e.g. Austrian MEL `BE520`, Norwegian NCSP `PJA23K`, Greek EOPYY, Belgian RIZIV), search once per **distinct code** for its official catalog description, unless the `source_name` is already clinically complete (short, clean English, no billing qualifiers, a well-known procedure). A clean-looking English name often loses the specificity the catalog encodes.
8. Save the result with `save_coding_systems`, once per institution:

```json
{
  "systems": [
    {
      "name": "Norwegian NCSP (Nordic Classification of Surgical Procedures)",
      "country": "Norway",
      "language": "Norwegian/English",
      "publisher": "Helsedirektoratet",
      "catalog_url": "...",
      "applies_to_rows": ["PJA23K", "PJA33K"],
      "prefix_taxonomy": { "position_1_P": "lymphoid system", "position_2_J": "lymph node" },
      "crosswalks_available": [],
      "notes": "Compositional 4-character code"
    }
  ],
  "per_row_enrichment": [
    { "source_code": "BE520", "official_description": "...", "published_target": "optional SNOMED/OMOP target named by the authority" }
  ]
}
```

If `web_search` returns an error (disabled or refused), say so once, then work from the code patterns and names alone, and record that the briefing is unverified in `notes`.
