# FHIR Server as a Trex (Deno Edge) Function — Design

**Date:** 2026-06-12
**Status:** Approved design, pending implementation plan
**Author:** Peter Hoffmann (with Claude)

## Goal

Reimplement the FHIR R4 server currently shipped as a native Rust DuckDB
extension (`plugins/fhir`) as a **Deno edge-function plugin** running inside the
Trex runtime's shared HTTP surface.

### Motivation (chosen)

- **Operational simplicity** — one process/port model; function-level
  auth/secrets/scopes; deploy/rollback via the runtime's function machinery
  instead of building and loading a native `cdylib`.
- **Unify with the runtime** — serve FHIR from the same Deno edge-runtime HTTP
  server as `devx` and other function plugins, instead of a separate Axum
  server bound to its own TCP port.

### Non-goals

- Not retiring or modifying the native extension. `plugins/fhir` stays in place
  and keeps working. The function is an additive, parallel implementation.
- Not reimplementing the CQL→ELM compiler in TypeScript (delegated — see below).

## Coexistence with the native extension

- New code lives in a **separate plugin directory**: `plugins/fhir-fn/`.
  (Name adjustable; chosen to read as "fhir, function flavor".)
- `plugins/fhir` (the Rust `cdylib`) is **untouched** and continues to run.
- No path collision: the native server binds its own dedicated TCP port via
  `trex_fhir_start(host, port)`, while the function owns `/trex/fhir/*` on the
  runtime HTTP port. They can run simultaneously.

## URL surface

Standard plugin-function convention. The plugin registers a function with
`source: "/fhir"`, so the runtime mounts it and the FHIR **base URL** becomes:

```
<host>/trex/fhir/{dataset_id}
```

The dataset is the first path segment, exactly as in the native server's
router. Example routes (after the `/trex/fhir` mount, the worker sees the path
starting at `{dataset_id}`):

```
GET  /trex/fhir/{dataset_id}/metadata
GET  /trex/fhir/{dataset_id}/{resourceType}
POST /trex/fhir/{dataset_id}/{resourceType}
GET  /trex/fhir/{dataset_id}/{resourceType}/{id}
PUT  /trex/fhir/{dataset_id}/{resourceType}/{id}
DEL  /trex/fhir/{dataset_id}/{resourceType}/{id}
GET  /trex/fhir/{dataset_id}/{resourceType}/{id}/_history
GET  /trex/fhir/{dataset_id}/{resourceType}/{id}/_history/{vid}
POST /trex/fhir/{dataset_id}                       (transaction bundle)
POST /trex/fhir/{dataset_id}/$cql
POST /trex/fhir/{dataset_id}/Measure/$evaluate-measure
POST /trex/fhir/{dataset_id}/$import
GET  /trex/fhir/{dataset_id}/$export
GET  /trex/fhir/{dataset_id}/$export/status/{job_id}
GET  /trex/fhir/{dataset_id}/{resourceType}/$export
```

Dataset-management routes (`/datasets`, `/datasets/{id}`) are preserved.

## Architecture

Replace the `cdylib` + scalar functions (`trex_fhir_start`/`trex_fhir_stop`) and
the in-process Axum server with a single `Deno.serve()` entrypoint and a small
router that mirrors `router.rs`. The `server_registry` concept (multiple
named servers on different ports) disappears — there is exactly one mounted
worker.

### Plugin registration (`plugins/fhir-fn/package.json`)

```json
{
  "trex": {
    "functions": {
      "api": [
        { "source": "/fhir", "function": "/functions" }
      ]
    }
  }
}
```

Auth roles/scopes are added in Phase 3 (see Phasing).

## Database access

The function executes the **same DuckDB SQL** the native server emits, against
the **same shared in-memory DuckDB instance**, via
`globalThis.Trex.databaseManager()` (the pattern in `plugins/devx/functions/duckdb.ts`).

Critical discipline (load-bearing):

- **One leased session pinned per request**, `close()`d in a `finally`. This
  replaces `query_executor.rs::RequestConn`, which pinned one Connection for the
  request lifetime so BEGIN/COMMIT/ROLLBACK could not interleave between
  concurrent requests, and destroyed the session on drop.
- `getConnection()` leases a fresh pool session every call and never reuses it;
  failing to `close()` drains the shared DuckDB pool (default 64) and wedges the
  node (documented hazard in `devx/duckdb.ts` and the
  `trex-dx-duckdb-helper-session-leak` memory). The per-request pin makes this
  exactly one lease/release per request.

Dataset → schema mapping is unchanged: `dataset_id` with `-`→`_` is the DuckDB
schema name in the `memory` database; a meta schema holds `_datasets` and
`_export_jobs`.

## Components (TS modules mirror the Rust modules)

| TS module | Replaces (Rust) | Notes |
|---|---|---|
| `functions/index.ts` | `router.rs`, `fhir_server.rs`, `server_registry.rs` | `Deno.serve` + route table. No start/stop, no registry. |
| `functions/db.ts` | `query_executor.rs` (`RequestConn`) | Shared-DuckDB wrapper; one pinned session per request, `close()` in `finally`. |
| `functions/sql_safety.ts` | `sql_safety.rs` | dataset/resource/id validation, identifier escaping, `to_schema_name`/`to_qualified_schema`. |
| `functions/schema/*.ts` | `schema/` | generator, sql_builder, json_transform, type_mapping — build per-dataset tables from StructureDefinitions. |
| `functions/fhir/*.ts` | `fhir/` | search_parameter, bundle_processor, validation, structure_definition, capability, resource_registry. |
| `functions/handlers/*.ts` | `handlers/` | crud, search, bundle, history, export, dataset, import, upsert, metadata. |
| `functions/cql.ts` + `functions/measure.ts` | `cql/`, `handlers/{cql,measure}.rs` | No TS compiler. ELM via SQL; measure interpretation in TS. |
| `functions/export/ndjson.ts` | `export/ndjson.rs` | `$export`; jobs persisted in meta schema. |
| `functions/error.ts` | `error.rs` | `OperationOutcome` + HTTP status mapping. |
| `data/*.json` | `data/` | search-parameters.json, profiles-types.json, profiles-resources.json — copied/shared, imported by the worker. |

## CQL / Measure (delegated)

The CQL→ELM compiler is **not** reimplemented in TS. The function obtains ELM by
calling the existing `cql2elm` plugin's DuckDB scalar function on the shared
connection:

```sql
SELECT trex_fhir_cql_translate(?)
```

Measure-evaluation logic (population counting, stratification, `MeasureReport`
assembly) runs in TS. Callers may also supply pre-compiled ELM directly, as the
native server already allows.

## Data flow

1. Runtime HTTP server matches `/trex/fhir/*` and routes to the fhir worker.
2. `Deno.serve` handler → router parses `{dataset_id}/{resourceType}/...`.
3. Validate (sql_safety) → build SQL → execute on shared DuckDB (lease one
   session, `close()` in `finally`).
4. Transform rows → FHIR JSON (json_transform).
5. Response post-processing: set `Content-Type: application/fhir+json`; rewrite
   `Bundle.fullUrl` entries and `Location` headers to base
   `<host>/trex/fhir/{dataset_id}`.

Transaction bundles pin the single per-request session across BEGIN/COMMIT.

## Error handling

Port `error.rs` to a TS `OperationOutcome` builder with domain-error → HTTP
status mapping. A response wrapper forces `application/fhir+json` on FHIR
endpoints (replacing the Axum content-type middleware).

## Phasing

- **Phase 1 — core REST**: metadata/capability, dataset CRUD, resource CRUD,
  search, history, transaction bundle, `$import`, `$export` + NDJSON.
- **Phase 2 — CQL / measure**: `$cql`, `$evaluate-measure` via cql2elm
  delegation.
- **Phase 3 — auth**: function-level roles/scopes for FHIR endpoints.

(No retirement phase — the native extension stays.)

## Testing

Test-driven. Each ported unit gets Deno tests before/with its implementation:

- Unit: `sql_safety` (validation/escaping), search-parameter parsing,
  `json_transform`, OperationOutcome mapping.
- Integration / parity: repoint the existing `integration-tests/test_fhir_*.py`
  and `plugins/fhir/test/sql/fhir.test` at the new base URL
  (`<host>/trex/fhir/...`). Passing the existing suite against the function is
  the acceptance gate per phase.

## Risks

- **Session/transaction isolation** — the pinned-session-per-request discipline
  is load-bearing; mishandling drains the DuckDB pool and wedges the node.
- **No client-disconnect signal** to the worker (documented in devx) — `$export`
  must use bounded jobs + status polling, never an unbounded stream/poll loop.
- **Large bodies** — the 100 MB bundle limit must be permitted by the runtime
  worker configuration.
- **Response rewriting** — `Bundle.fullUrl` / `Location` must consistently
  reflect the `/trex/fhir/{dataset_id}` base, including behind a reverse proxy.
