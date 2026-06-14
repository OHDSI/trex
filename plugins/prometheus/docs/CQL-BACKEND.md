# Running CQL end-to-end (real `fhir` + `cql2elm`)

The CQL editor (`/{dataset}/cql`) POSTs raw CQL to `POST /{dataset}/$cql` and renders the returned FHIR `Parameters`. **Execution is never mocked** — it requires a real FHIR server with the `fhir` and `cql2elm` DuckDB extensions loaded.

## What does / doesn't run CQL
- The **Deno `fhir-fn`** plugin (what the UI talks to by default) does **not** implement `$cql` (returns "handler not implemented").
- The **native `fhir` extension** (`plugins/fhir`) started via `trex_fhir_start(...)` with `cql2elm` loaded **does** execute `$cql` (raw CQL → ELM via `cql2elm` → evaluate). This is what the integration tests in `integration-tests/test_fhir_cql_translation.py` exercise.

The prebuilt image `ghcr.io/ohdsi/trexsql:*` ships both extensions (`/usr/lib/trexsql/extensions/{fhir,cql2elm}.trex`). `trex_fhir_start` requires the trex runtime's `_config` catalog to be initialized (it fails with `Catalog "_config" does not exist` against a bare `trex` CLI), so it must run against a fully-initialized trex instance.

## Point the UI at a real backend (no CORS)
The dev server has an optional same-origin proxy so the browser can reach a real fhir server without CORS:

```bash
cd plugins/fhir-ui
VITE_FHIR_PROXY_TARGET=http://<fhir-host>:<port> \
VITE_FHIR_BASE_URL=/fhir-live \
npm run dev
```

All FHIR calls (including `$cql`) then go through `/fhir-live` → the real backend. Open the CQL screen and Run.

## Bringing up a real fhir+cql2elm server
Options (in increasing self-containment):
1. **Your dev stack** — if you already run the trex stack (`docker-compose up`), start the native fhir server against the initialized DB (`SELECT trex_fhir_start('0.0.0.0', <port>)`) and set `VITE_FHIR_PROXY_TARGET` to it.
2. **Full compose** — `docker-compose up` brings up the initialized runtime; wire the native fhir server start + seed a dataset, then proxy.

Counts (`$counts`), global search (`$global-search`), and the StructureDefinition endpoint are implemented in the Deno `fhir-fn` and work against the normal `/plugins/trex/fhir` mount.
