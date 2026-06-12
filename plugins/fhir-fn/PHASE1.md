# fhir-fn — Phase 1 (Core REST) status

`fhir-fn` reimplements the native FHIR DuckDB extension (`plugins/fhir`) as a Trex
Deno edge-function plugin. The native extension is untouched; the two run in
parallel. See the design + plan in `docs/superpowers/specs/` and
`docs/superpowers/plans/`.

## What's implemented (Phase 1 — core REST)

All ported faithfully from `plugins/fhir/src/**`, with byte-identical SQL verified
against the Rust unit tests where they pinned exact strings.

| Area | TS module | Source |
|------|-----------|--------|
| Shared DuckDB session (1 lease/request) | `functions/db.ts` | `query_executor.rs` (RequestConn) |
| Errors / OperationOutcome | `functions/error.ts` | `error.rs` |
| Validation + identifier escaping | `functions/sql_safety.ts` | `sql_safety.rs` |
| StructureDefinition parsing | `functions/fhir/structure_definition.ts` | `structure_definition.rs` |
| Schema gen / DDL / json_transform spec | `functions/schema/*.ts` | `schema/*.rs` |
| Resource registry (facade + cache) | `functions/fhir/resource_registry.ts` | `resource_registry.rs` |
| Search-parameter engine | `functions/fhir/search_parameter.ts` | `search_parameter.rs` |
| Resource validation | `functions/fhir/validation.ts` | `validation.rs` |
| Bundle parsing + processing | `functions/fhir/bundle_processor.ts`, `functions/handlers/bundle.ts` | `bundle_processor.rs`, `bundle.rs` |
| Shared upsert | `functions/handlers/upsert.ts` | `upsert.rs` |
| Router + dispatch + response rewrite | `functions/router.ts`, `functions/state.ts` | `router.rs`, `fhir_server.rs` |
| Handlers | `functions/handlers/{metadata,dataset,crud,search,history,import,export}.ts` | `handlers/*.rs` |
| Capability statement | `functions/fhir/capability.ts` | `capability.rs` |
| Bulk export job model | `functions/export/ndjson.ts` | `export/ndjson.rs` |

**Endpoints:** metadata, dataset CRUD, resource CRUD (+versioning/history),
search (searchset bundle + pagination), `_history`/version read, transaction &
batch bundles, `$import` (NDJSON), `$export` (async job model).

**Tests:** 449 Deno unit tests (`deno test --allow-env --allow-read functions/ test/`),
all green. Every ported Rust `#[cfg(test)]` test is transcribed; handler tests use a
mock connection.

## URL surface

Mounted by the runtime at `<host>${PLUGINS_BASE_PATH}/trex/fhir` (e.g.
`/plugins/trex/fhir` or `/trex/fhir` depending on `PLUGINS_BASE_PATH`). The worker
derives its mount prefix from the request path (or `FHIR_BASE_PATH`), so it works
under any base. FHIR base URL = `<mount>/{dataset_id}`. Dataset schemas live in the
`memory` DuckDB catalog (override via `FHIR_DB_NAME`).

## Intentional deviations from the native server

- **`$export` runs synchronously inline** (no `tokio::spawn`): the edge-function
  model has no reliable background task. The bounded COUNT queries run before the
  `202` returns, so the job is `complete` on first status poll.
- **Validation failure body** returns the validation `OperationOutcome` directly
  (the native server double-wraps it inside another OperationOutcome's
  `diagnostics` — a latent bug; the function returns the cleaner form). Status 400
  in both.
- **vread** sets an `ETag` the native omits (FHIR R4 §3.1.0.7).
- Bundle entry `resourceType` is shape-validated (`^[A-Za-z0-9]+$`) to prevent SQL
  identifier injection (the native server does not validate it here).

## CQL / measures (Phase 2 — not in this phase)

`$cql` and `$evaluate-measure` routes are parsed but return "not implemented".
Phase 2 will delegate translation to the `cql2elm` plugin
(`SELECT trex_fhir_cql_translate(?)`) and run measure logic in TS.

## Integration acceptance gate (CI/Docker)

`integration-tests/test_fhir_fn.py` is the end-to-end parity harness (reuses the
native `FhirClient`). It cannot run in a unit sandbox — it needs a running Trex
runtime serving the plugin and a `service_role` apikey. See
`integration-tests/README_fhir_fn.md` for the Docker run recipe. The suite
`pytest.skip`s when `FHIR_FN_APIKEY` is unset.

A live smoke test confirmed the plugin loads, registers, and routes correctly under
the runtime (request reaches the worker; only core auth middleware gates it). Full
end-to-end CRUD-over-HTTP validation is pending a CI/Docker run with working auth.

## Known follow-ups / cleanups

- Dead `?? row.column0` positional fallbacks in a few handlers (harmless; rows are
  keyed by column name).
- Unused mirror-helpers `parseCheckRow` (crud) and `rowToDatasetObject` (dataset)
  kept for Rust symmetry; can be removed.
- `import.ts` pre-fetches `transformSpec`/`columnNames` it doesn't use (cosmetic;
  collapses two Rust error prefixes into one).
