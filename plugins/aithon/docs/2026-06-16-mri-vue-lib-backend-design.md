# MRI-vue-lib-compatible analytics backend (new aithon function)

**Date:** 2026-06-16
**Status:** Approved design — ready for implementation plan
**Repo/area:** `trex` → `plugins/aithon`

## 1. Goal

Add an **mri-vue-lib-compatible analytics backend** as a **new Deno function** inside
`plugins/aithon`, so the existing MRI (Medical Research Insights) Vue frontend
(`vue-mri-ui-lib`) can run cohort/stratification analytics directly against FHIR data
stored in trex's DuckDB-backed FHIR server.

The new function:

1. Serves MRI's config + query HTTP contract.
2. Auto-generates the MRI config from the dataset's available FHIR resources.
3. Decodes MRI's filter+axis request (IFR), translates it to ELM, compiles ELM→SQL
   **in TypeScript** (a ported, MRI-scoped compiler with new stratification support),
   runs it on the same DuckDB FHIR tables the existing function uses, and returns
   MRI-shaped JSON.

## 2. Constraints (hard)

- **No changes to d2e** (`../d2e`, `../alp-data-node`, `vue-mri-ui-lib`).
- **No changes** to the existing aithon FHIR function (`plugins/aithon/functions`).
- **No changes** to the Rust `plugins/fhir` engine or `plugins/cql2elm`.
- All new code lives in a **sibling function directory** within `plugins/aithon`.

## 3. Background (why this shape)

Two relevant facts established during exploration:

- The working **ELM→SQL compiler is Rust-only** (`plugins/fhir/src/cql/compiler.rs`,
  reachable via the native `fhir` extension's embedded HTTP server `$cql`; CQL→ELM is
  the separate `cql2elm` DuckDB extension). The Deno aithon function's `$cql` route
  is a stub ("handler not implemented") — only a CQL *editor UI* exists in TS
  (`src/screens/CqlEditor.vue`). See `plugins/aithon/docs/CQL-BACKEND.md`.
- The MRI frontend is **config-driven** and talks to an `analytics-svc`-style HTTP
  contract (`getMyConfig`, `patientcount`, `barchart`), sending a compressed
  filter+axis "bookmark" (IFR) and expecting a stratified result grid back.

**Decision:** rather than depend on the Rust HTTP engine, the new function is
**fully self-contained TypeScript** — IFR→ELM→SQL in TS — so the aithon plugin
owns the whole MRI path. The TS compiler is a **bounded port** of the Rust compiler:
only the ELM subset our own IFR→ELM translator emits, plus new stratification.

The d2e term **"FAST"** (its `query-gen-svc` filter IR) maps onto **ELM** here; trex's
engine is ELM-native, so we translate IFR directly to ELM and do not introduce a
separate FAST IR.

## 4. Architecture & components

New function directory `plugins/aithon/functions-mri/` (sibling to `functions/`),
mounted via a second entry in `package.json` → `trex.functions.api`:

```json
{ "source": "/analytics-svc", "function": "/functions-mri" }
```

Internal modules:

| Module | Responsibility |
|---|---|
| `index.ts` / `router.ts` | `Deno.serve` handler + MRI URL routing (mirrors `functions/router.ts`) |
| `config/generate.ts` | FHIR resource registry → MRI config JSON |
| `mriquery/decode.ts` | base64+zlib → IFR object (+ `axisSelection`) |
| `ifr/to_elm.ts` | IFR (boolean filter tree + axes) → ELM (with stratification) |
| `elm/compiler.ts` | **TS port** of ELM→SQL compiler, MRI subset + GROUP BY/binning |
| `postprocess/barchart.ts` | fill-missing-combos, bin-label formatting, MRI response assembly |
| `db.ts` | reuse the `leaseMemoryConnection()` pattern from `functions/db.ts` |

**Data model:** reuses the existing per-dataset DuckDB schema (`{ds}.patient`,
`{ds}.condition`, … each with `_raw` JSON + flattened columns + `_is_deleted`). The TS
compiler targets these exactly as the Rust compiler does
(`json_extract_string(_raw,'$.path')`, `{schema}.{resourcetype}`), keeping results
consistent with the existing FHIR function.

## 5. MRI config generation (`config/generate.ts`)

Reuse the existing `functions/fhir/resource_registry.ts` + `data/*.json`
(StructureDefinitions, search-parameters). For a dataset, produce the MRI config
(`meta` + `config.patient.{attributes,interactions}`):

- **`patient.attributes`** ← Patient-level fields:
  - `Age` from `birthDate` → `type: num`, `ordered: true`, `measure: true`, binnable.
  - `Gender` → `type: text`, `category: true`.
  - other Patient search params as needed.
- **`patient.interactions`** ← one interaction per non-Patient resource type present in
  the dataset (Condition→"Diagnosis", Observation, Procedure, MedicationRequest,
  Encounter…), each with attributes derived from that resource's key elements + search
  parameters.
- **The config is the single source of truth for the FHIR mapping.** Each generated
  attribute carries internal mapping metadata (resource type + JSON path + type +
  binnable) consumed by `ifr/to_elm.ts`. The frontend sees the standard MRI shape and
  ignores the embedded mapping fields.
- A **curated mapping table** for common resources (Patient, Condition, Observation,
  Procedure, MedicationRequest, Encounter) provides good defaults; other resources fall
  back to generic search-parameter-derived attributes.

## 6. Request decoding & IFR model (`mriquery/decode.ts`)

Accept `mriquery` (base64 + zlib-deflated JSON) from the query param **or** POST body
(decode both). Parse into the IFR:

- `filter.cards`: boolean tree — `BooleanContainer` (AND/OR/NOT) → `FilterCard`
  (`configPath`, `instanceNumber`) → `Attribute` (`configPath`) → `constraints`
  (`BooleanContainer`) → `Expression { operator, value }`.
- `axisSelection[]`: `{ categoryId (x1/x2/x3/x4/y1), attributeId, binsize }`.

Validate against the config's `configMetadata.id` / `version`.

## 7. IFR → ELM (`ifr/to_elm.ts`)

Walk the IFR using the config mapping:

- Each `FilterCard` → an ELM `Retrieve` over its resource type, joined to Patient by
  subject reference.
- `constraints` boolean tree → ELM `And`/`Or`/`Not` + `Equal`/`Less`/`Greater`/`In`/
  `Exists` over `Property` (resource JSON path from config).
- Patient-context query whose result is the distinct patient set.
- **Axes → stratification:** each `axisSelection` attribute becomes an ELM `groupBy`
  `Property`; numeric axes with `binsize` get a binning wrapper
  (`floor(value/binsize)*binsize`). Measure = `Count(distinct patient)`.
  This is the "stratify options added to the ELM layer."

## 8. ELM → SQL compiler (`elm/compiler.ts`) — TS port

Port **only the ELM subset our own translator emits** (bounded scope, not the full ELM
spec): `Library/statements`, `Retrieve`, `Property`, `And`/`Or`/`Not`, comparison
operators, `In`, `Exists`, `Count`, `Distinct`, date/age helpers — mirroring
`plugins/fhir/src/cql/compiler.rs` semantics and CTE structure.

**New vs. Rust:** an `Aggregation` node → `GROUP BY` + numeric binning +
`COUNT(DISTINCT patient)`, producing the stratified result grid.

Output SQL runs via `leaseMemoryConnection()` (same DuckDB pool the existing function
uses).

## 9. Execution, post-processing & response shapes

- **patientcount:** compile filter-only ELM → `SELECT COUNT(DISTINCT …)` →
  ```json
  { "data": [{ "patient.attributes.pcount": 1234 }] }
  ```
- **barchart:** compile filter+axes → stratified SQL → rows → `postprocess/barchart.ts`
  fills the Cartesian product of axis values, formats bin labels, and assembles per
  `MRIEndpointResultType`:
  ```json
  {
    "data": [ { "<axis cols>": "...", "<measure cols>": 0 } ],
    "categories": [ { "id": "x1", "name": "Age", "type": "num", "value": "...", "axis": 1, "binsize": 10, "order": "ASC" } ],
    "measures": [ { "id": "...", "name": "...", "type": "...", "value": "...", "group": 1 } ],
    "totalPatientCount": 216,
    "postProcessingConfig": { "fillMissingValuesEnabled": true, "NOVALUE": "NO_VALUE", "shouldFormatBinningLabels": true }
  }
  ```

## 10. Endpoints

```
GET /analytics-svc/pa/services/analytics.xsjs?action=getMyConfig&datasetId=…
GET /analytics-svc/pa/services/analytics.xsjs?action=getMyConfigList&datasetId=…
GET /analytics-svc/pa/services/analytics.xsjs?action=getFrontendConfig&configId=…&configVersion=…
GET /analytics-svc/api/services/population/json/patientcount?mriquery=…
GET /analytics-svc/api/services/population/json/barchart?mriquery=…
```

(Both GET query-param and POST-body forms of `mriquery` supported.)

## 11. Testing strategy

- **Unit (Deno test):**
  - config generation from a sample registry,
  - `mriquery` decode (base64+zlib round-trip),
  - IFR→ELM for representative filters/axes,
  - ELM→SQL snapshots (including binning + GROUP BY),
  - post-processing fill/format.
- **Integration:** seed a dataset (Patient + Condition + Observation), run
  `patientcount` and a 2-axis `barchart`, assert MRI response shape and counts against
  direct SQL.

## 12. Scope (YAGNI)

**In (first deliverable):**
- config: `getMyConfig` / `getMyConfigList` / `getFrontendConfig`,
- `patientcount`,
- stratified `barchart`,
- auto-generated config from the FHIR registry,
- TS ELM compiler subset + stratification.

**Deferred (out of first cut):**
- `patientlist`, cohorts, custom plugin endpoints, censoring thresholds, bookmarks,
  non-bar chart types, value-set terminology expansion.

## 13. Phases

1. Scaffold function dir + routing + manifest mount (`/analytics-svc`).
2. Config generation from FHIR registry.
3. `mriquery` decode + IFR model.
4. TS ELM compiler subset (filter-only) + `patientcount`.
5. Stratification (axes/binning) + `barchart` + post-processing.
6. Integration test with a seeded dataset.

## 14. Key risks / open points

- **Compiler-port drift:** the TS compiler duplicates Rust logic; bounded by porting
  only the emitted ELM subset and by SQL snapshot tests.
- **Reference/join shape:** Patient↔resource joins depend on how subject references are
  stored in `_raw`; the translator's join predicate must match the existing flattening
  in `functions/schema/`.
- **Binning/label parity** with what `vue-mri-ui-lib` expects for numeric axes.

## 15. Reference paths

| Artifact | Path |
|---|---|
| Existing aithon FHIR function | `plugins/aithon/functions/{index,router,db,state}.ts` |
| FHIR resource registry (reuse) | `plugins/aithon/functions/fhir/resource_registry.ts` |
| Plugin manifest | `plugins/aithon/package.json` (`trex.functions.api`) |
| Rust ELM→SQL compiler (port source) | `plugins/fhir/src/cql/compiler.rs`, `elm_types.rs` |
| Rust measure (population COUNT example) | `plugins/fhir/src/handlers/measure.rs` |
| MRI frontend request builder | `../d2e-ui2/apps/vue-mri-ui-lib/src/store/modules/bookmark.ts` |
| MRI frontend config loader | `../d2e-ui2/apps/vue-mri-ui-lib/src/store/modules/config.ts` |
| MRI response types | `../alp-data-node/analytics-svc/src/types.ts` |
| MRI barchart endpoint (reference) | `../alp-data-node/analytics-svc/src/mri/endpoint/StackedBarchartEndpoint.ts` |
| Real MRI config example | `../d2e-ui2/apps/portal/src/plugins/mri/CDM/ui5/lib/config.json` |
