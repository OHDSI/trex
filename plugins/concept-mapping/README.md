# @trex/concept-mapping

An agent plugin (`concept-mapper`) that maps source procedure terms (code, original-language name, English name, institution) to standard concepts in the OMOP Standardized Vocabularies, each with an `exactMatch` or `broadMatch` predicate.

The pipeline:

1. **Coding-system identification**: web research per institution to identify the source coding system, its prefix taxonomy and official code descriptions.
2. **Query fan-out**: translation, a cleaned reformulation, synonyms and a factual description per term.
3. **Hybrid retrieval**: exact name and synonym matching (non-standard matches followed through "Maps to"), plus semantic search via [Hecate](https://github.com/OHDSI/Hecate), merged by reciprocal rank fusion (k = 60).
4. **Judge voting**: five independent model judges, each seeing the candidates in a different order with the candidates' hierarchy (and the institution's gold examples, if configured), then a majority vote.
5. **Low-confidence enrichment**: rows with 3/5 agreement or less, or weak retrieval, get wider retrieval (30 candidates) and web context, then one careful re-evaluation.
6. **Validation**: every saved concept must exist, be standard and valid, and match the vocabulary name.

The model makes every mapping decision; tools only fetch, search, count and validate. Judge agreement is a usable confidence signal: in evaluation, unanimous votes were correct for 73% of terms and votes of 3/5 or lower for 18%, so low-agreement rows can be routed to human review.

## Setup

### Vocabulary

Load the OMOP Standardized Vocabularies (an [Athena](https://athena.ohdsi.org) download) into a Postgres schema. The agent reads `concept`, `concept_synonym`, `concept_relationship` and `concept_ancestor`. Exact matching compares lower-cased names, so add these indexes:

```sql
CREATE INDEX ON vocab.concept (lower(concept_name));
CREATE INDEX ON vocab.concept_synonym (lower(concept_synonym_name));
CREATE INDEX ON vocab.concept_relationship (concept_id_1, relationship_id);
CREATE INDEX ON vocab.concept_ancestor (descendant_concept_id, min_levels_of_separation);
CREATE INDEX ON vocab.concept_ancestor (ancestor_concept_id, min_levels_of_separation);
```

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `CONCEPT_MAPPING_MODEL` | (none) | Model as `provider/model-id`. Falls back to `TREX_AGENTS_DEFAULT_MODEL`; one of the two is required. Use a strong model: mapping quality depends on it. |
| `CONCEPT_MAPPING_JUDGE_MODEL` | the agent model | Optional separate model for the five judges. |
| `CONCEPT_MAPPING_VOCAB_DATABASE_URL` | (worker database) | Postgres URL of the database holding the vocabulary. |
| `CONCEPT_MAPPING_VOCAB_SCHEMA` | `vocab` | Schema holding the vocabulary tables. |
| `HECATE_URL` | (off) | Semantic search endpoint, e.g. the public `https://hecate.pantheon-hds.com` or a self-hosted Hecate. Unset means semantic search is off. |
| `CONCEPT_MAPPING_WEB_SEARCH` | `off` | Set to `on` to enable web search. |
| `CONCEPT_MAPPING_EXAMPLES_FILE` | (none) | Path to a CSV of calibration examples for the judges (see below). |
| `BRAVE_SEARCH_API_KEY` | (none) | Brave Search API key. Recommended: without it the agent uses the keyless DuckDuckGo lite endpoint, which often refuses server-side requests. |

Provider credentials (`ANTHROPIC_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK`, ...) are passed through by the agents runtime as for any agent.

**External services are off by default.** Semantic search and web search send source terms and codes to third-party services, so a deployment opts in explicitly (`HECATE_URL=...`, `CONCEPT_MAPPING_WEB_SEARCH=on`). Without them the agent maps from exact name matching and the model's own knowledge of coding systems, and accuracy drops: the approach's best results used both (web search drives coding-system identification; semantic search finds most candidates). A self-hosted Hecate keeps semantic search on-premises.

### Calibration examples

The judges calibrate on expert-reviewed mappings when they are available, and this matters most for an institution's own coding conventions. Supply them as a CSV readable by the worker and point `CONCEPT_MAPPING_EXAMPLES_FILE` at it:

```csv
source_data_identifier,source_code,original_source_name,source_name,target_concept_id,predicate
hosp-a,A1,Kniearthroskopie,Knee arthroscopy,4205229,exactMatch
```

Use the same `source_data_identifier` values as your input files: a row's judges see only its institution's examples (or all examples if that institution has none). Give concept ids only; names are read from your vocabulary.

## Terminology licensing

The plugin ships no terminology content: no SNOMED CT descriptions, no CPT descriptors, no national classification catalogs and no example mappings. Concept names in the judge prompt are references (`{{concept:ID}}`) that are filled in at runtime from the vocabulary you load, so all terminology text comes from your own Athena download under your own licenses (SNOMED CT affiliate license, UMLS license for CPT4 names, and any others Athena lists). A unit test (`agent/licensing.test.ts`) keeps literal concept names out of the shipped prompt. If you provide calibration examples or gold files, make sure you may use the source codes and descriptions they contain.

## Usage

The agent mounts at `/plugins/trex/concept-mapper` with the standard eve session API (see the agent plugin docs).

- Send a CSV with the columns `source_data_identifier, source_code, original_source_name, source_name`. The agent maps the rows, persists progress in the `concept_mapping` schema, and returns a submission CSV (also emitted as a `run_export` event). Large inputs span several turns: reply "continue" to resume. Runs belong to the session that started them. Rows with no candidate at all are closed as unmapped and listed in the export result.
- Or paste a single term to get one mapping with a rationale.

## Tests

```bash
deno test --no-check --allow-all --import-map plugins/concept-mapping/importmap.json \
  --node-modules-dir=auto plugins/concept-mapping/
```

Unit tests run against an in-process PGlite database with a small vocabulary fixture and stubbed model and HTTP calls. The evals under `agent/evals/` run the real agent against a live stack.

### Evals

`agent/evals/` is an [eve](https://github.com/vercel/eve) eval suite that runs against a live stack with a loaded vocabulary and a configured model (auth as in the devx eval README, via `EVE_EVAL_AUTH_TOKEN`). The quality eval needs a gold-standard CSV in the submission format (`EVAL_GOLD_CSV`); none is bundled.

```bash
cd plugins/concept-mapping/agent/evals && npm install
npm run eval -- smoke      # one pasted term, end to end
npm run eval -- quality    # a gold sample as a CSV run, scored (EVAL_GOLD_CSV, EVAL_SAMPLE_ROWS default 12)
```

If the gold rows are also configured as calibration examples, the score is optimistic; use held-out rows for an accuracy estimate.
