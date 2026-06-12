# FHIR-fn Integration Test Harness

`test_fhir_fn.py` is the CI/Docker acceptance gate for the FHIR Deno edge-function
plugin (`plugins/fhir-fn`).  It mirrors the scenarios in `test_fhir_standalone.py`
but targets the HTTP surface exposed by the running Trex runtime rather than a
locally-started native extension.

## Prerequisites

| What | Where |
|------|-------|
| Running Trex runtime with `plugins/fhir-fn` loaded | Docker container or host process |
| A `service_role` API key for that deployment | runtime config / env |

## Quick start

### 1. Deploy the plugin

**Option A — copy into a running container's dev-plugins directory:**

```bash
docker cp plugins/fhir-fn <container_name>:/usr/src/plugins-dev/@trex/fhir-fn
docker restart <container_name>
```

**Option B — build time / volume mount:**

Ensure `plugins/fhir-fn` is present at `PLUGINS_DEV_PATH/@trex/fhir-fn` before
the container starts.

### 2. Obtain the service-role API key

The key is the `service_role` JWT / apikey configured for the runtime.  For local
Docker Compose deployments it is typically printed in the startup logs or stored
in `docker-compose.yml` under `TREX_SERVICE_ROLE_KEY`.

### 3. Run the tests

```bash
FHIR_FN_BASE_URL=http://127.0.0.1:8001/plugins/trex/fhir \
FHIR_FN_APIKEY=<service_role_key> \
pytest integration-tests/test_fhir_fn.py -v
```

The suite is **skipped** (not failed) when `FHIR_FN_APIKEY` is unset, so it is
safe to include in a CI matrix without breaking runs that do not have a runtime
available.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FHIR_FN_BASE_URL` | `http://127.0.0.1:8001/plugins/trex/fhir` | Base URL of the mounted FHIR function. Adjust if `PLUGINS_BASE_PATH` differs (e.g. `/trex/fhir`). |
| `FHIR_FN_APIKEY` | *(none — suite skipped if absent)* | `service_role` API key; sent as the `apikey` HTTP header on every request. |

## Scenarios covered

| Category | Tests |
|----------|-------|
| Health | `test_health_check` |
| Datasets | create (201), list, get, delete (204 + subsequent 404), duplicate → 400/409, not-found → 404 |
| Metadata | CapabilityStatement shape, Patient resource entry, nonexistent dataset → 404 |
| CRUD | create Patient (201 + Location + ETag), read (200), read-missing (404), update (200 + version bump), delete (204), read-after-delete (410), upsert via PUT (201) |
| Search | empty searchset, 2-patient result set, `?gender=` filter, deleted resources excluded |
| History | ≥2 entries after update, version read `/_history/1`, DELETE appears in history |
| Bundle | transaction (200 + `transaction-response` + both entries 201), resources readable after transaction, batch (200 + `batch-response`), unsupported type → 400, non-Bundle body → 400 |
| $import | 3-patient NDJSON (counts + each readable), mixed resource types, verify via search, nonexistent dataset → 404 |
| $export | 202 + `Content-Location` header, status URL polls to 200 with `output` array, Patient count ≥ seeded count |
| Auth | unauthenticated request → 401 |
| Error shapes | 404 / 410 OperationOutcome bodies, wrong resourceType → 400, invalid JSON → 400/422 |

## Notes

- Each test creates its own dataset with a `t-<uuid>` prefix so tests are fully
  independent and can run in parallel.
- Export tests poll the `Content-Location` status URL for up to 30 seconds; the
  fhir-fn export runs inline so this should complete quickly, but the polling
  loop guards against any async latency.
- The mount path (`/plugins/trex/fhir` by default) depends on the runtime's
  `PLUGINS_BASE_PATH` setting.  Override `FHIR_FN_BASE_URL` accordingly.
