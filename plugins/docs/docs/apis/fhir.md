---
sidebar_position: 8
---

# FHIR REST API

Trex ships a FHIR R4 REST API as an edge function (the `@trex/aithon`
plugin). It is the HTTP API behind the Aithon clinical-analytics UI:
datasets, resource CRUD, search, history, bundles, and bulk import/export.

:::info Two FHIR servers
This is **not** the same thing as the `fhir` SQL extension. The
[`fhir` extension](../sql-reference/fhir) is a standalone Rust/Axum HTTP server
you start with `trex_fhir_start(...)`. This gateway is an independent
TypeScript/Deno reimplementation of the same handler surface that runs as an
edge function and executes SQL against DuckDB in-process. They share the
on-disk data model and FHIR R4 definitions but are separate servers. Use the
`fhir` extension for a dedicated FHIR endpoint; this gateway is what the
Aithon UI talks to.
:::

## Endpoint

```
${BASE_PATH}/fhir/*
```

With the default configuration that resolves to `/trex/fhir/*` (and
`/plugins/trex/fhir/*`, which the Aithon UI uses by default). FHIR
responses carry `application/fhir+json`, and relative `Location` headers and
Bundle `fullUrl`s are rewritten to absolute URLs.

## Authentication

The gateway does **not** enforce authentication itself. Put it behind the
platform auth layer or a private network if you expose it. `$export` status
responses report `requiresAccessToken: false`.

## Endpoints

Paths are relative to the mount prefix. `{ds}` is a dataset id.

**Operational**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check. |
| GET | `/metrics` | Metrics stub. |

**Datasets** (a dataset is an isolated FHIR store backed by a DuckDB schema)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/datasets` | Create a dataset. |
| GET | `/datasets` | List datasets. |
| GET | `/datasets/{ds}` | Get a dataset. |
| PUT | `/datasets/{ds}` | Update a dataset. |
| DELETE | `/datasets/{ds}` | Delete a dataset. |

**Resources**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/{ds}/metadata` | CapabilityStatement (`fhirVersion: 4.0.1`). |
| GET | `/{ds}/{resourceType}` | Search. |
| POST | `/{ds}/{resourceType}` | Create. |
| GET | `/{ds}/{resourceType}/{id}` | Read. |
| PUT | `/{ds}/{resourceType}/{id}` | Update (honors `If-Match`). |
| DELETE | `/{ds}/{resourceType}/{id}` | Delete (soft). |
| GET | `/{ds}/{resourceType}/{id}/_history` | Version history. |
| GET | `/{ds}/{resourceType}/{id}/_history/{versionId}` | Read a version. |
| GET | `/{ds}/StructureDefinition` | List registered resource types. |
| GET | `/{ds}/StructureDefinition/{type}` | Read a StructureDefinition. |

**Operations**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/{ds}` | Process a transaction/batch Bundle. |
| POST | `/{ds}/$import` | Bulk import NDJSON. |
| GET | `/{ds}/$export` | System-level bulk export (runs inline, returns `202`). |
| GET | `/{ds}/{resourceType}/$export` | Type-level export. |
| GET | `/{ds}/$export/status/{jobId}` | Export job status. |
| GET | `/{ds}/$counts` | Per-resource-type row counts. |
| GET | `/{ds}/$global-search?q=` | Cross-resource text search. |

:::warning Not yet implemented
`POST /{ds}/$cql` and the `$evaluate-measure` operations are recognized by the
router but have no handler in this gateway yet — they return `500 handler not
implemented`. For CQL and measure evaluation, use the
[`fhir` SQL extension](../sql-reference/fhir), which implements them.
:::

## Backend & data model

The gateway leases an in-process DuckDB connection per request (no proxying to
an upstream FHIR server). Each dataset is a DuckDB schema with one lowercase
table per resource type plus `_history` and `_valueset_expansion` tables; rows
carry `_id`, `_resource_type`, `_version_id`, `_last_updated`, `_raw`, and
`_is_deleted`. Updates push the prior version into `_history`. The database
name comes from `FHIR_DB_NAME` (default `memory`).

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FHIR_DB_NAME` | `memory` | DuckDB catalog the FHIR schemas live in. |
| `FHIR_BASE_PATH` | `/trex/fhir` | External mount prefix. |

## Next steps

- [SQL Reference → fhir](../sql-reference/fhir) — the standalone FHIR server
  extension (with CQL and measure evaluation).
- [SQL Reference → cql2elm](../sql-reference/cql2elm) — CQL to ELM translation.
- [Tutorial: Clinical analytics](../tutorials/clinical-analytics) — OHDSI
  workflow end to end.
