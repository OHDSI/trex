---
sidebar_position: 12
---

# cql2elm — Clinical Quality Language → ELM

The `cql2elm` extension translates [Clinical Quality Language (CQL)](https://cql.hl7.org/)
into the [Expression Logical Model (ELM)](https://cql.hl7.org/04-logicalspecification.html)
JSON representation. Combined with the [fhir extension](fhir), it lets you author
quality measures in CQL and execute them against FHIR resources stored in Trex.

The extension wraps the HL7 cqframework cql-to-elm translator
(`info.cqframework:cql-to-elm`), compiled to a native image via GraalVM and
loaded as a DuckDB C-API extension.

## Functions

### `trex_fhir_cql_translate(cql)`

Translate a CQL library to ELM JSON.

| Parameter | Type | Description |
|-----------|------|-------------|
| cql | VARCHAR | CQL library source. |

**Returns:** VARCHAR — ELM JSON string.

```sql
SELECT trex_fhir_cql_translate('
  library Test version "1.0.0"
  using FHIR version "4.0.1"
  context Patient
  define "InDemographic":
    AgeInYears() >= 16 and AgeInYears() < 24
');
```

The function is named `trex_fhir_cql_translate` (not `trex_cql2elm_*`) because
the primary consumer is the FHIR / quality-measure pipeline. Pass the resulting
ELM JSON to FHIR `$evaluate-measure` or store it for later use.

## Pairing with the FHIR Extension

A typical CQL-driven measure evaluation looks like:

```sql
-- 1. Translate the CQL library to ELM
WITH elm AS (
  SELECT trex_fhir_cql_translate(cql_source) AS elm_json
  FROM cql_libraries WHERE name = 'BreastCancerScreening'
)
-- 2. Pass the ELM into the FHIR runtime (extension-specific glue varies)
SELECT * FROM elm;
```

See the [fhir extension](fhir) docs for the runtime side of measure
evaluation. The integration tests under
`integration-tests/test_fhir_cql*.py` show the full end-to-end flow:
ingest FHIR resources, define a CQL library, translate to ELM, run
`$evaluate-measure`, validate the resulting `MeasureReport`.

## Why ELM and not direct CQL?

ELM is the post-parse, post-typecheck representation of CQL. By translating
once and storing the ELM JSON, downstream tools (the FHIR runtime, OHDSI
quality-measure pipelines) avoid re-parsing CQL on every evaluation and
catch syntax / type errors at translation time rather than evaluation time.

## Limitations

- The translator is invoked per call — there is no compiled-library cache. For
  bulk evaluations, translate once and reuse the ELM JSON.
- CQL `include` / library imports require all referenced libraries to be inlined
  into the input string; the translator does not resolve external library names.
- Only the FHIR data model is wired in. dQM / QDM data models are not registered.
