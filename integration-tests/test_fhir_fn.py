"""FHIR-fn integration parity test harness.

Tests the FHIR Deno edge-function plugin (plugins/fhir-fn) deployed inside a
running Trex runtime.  Every request must carry the service-role API key via the
``apikey`` header; without it the core auth middleware returns 401.

This suite is intentionally *skipped* (not failed) when the required environment
variables are absent, so it can live in CI and be opted-in per environment.

Run recipe
----------
1. Copy ``plugins/fhir-fn`` into the runtime's dev-plugins directory and restart,
   or have it present at build time::

       docker cp plugins/fhir-fn <container>:/usr/src/plugins-dev/@trex/fhir-fn
       docker restart <container>

2. Obtain the ``service_role`` API key for the deployment.

3. Run::

       FHIR_FN_BASE_URL=http://127.0.0.1:8001/plugins/trex/fhir \\
       FHIR_FN_APIKEY=<key> \\
       pytest integration-tests/test_fhir_fn.py -v

Notes
-----
* ``FHIR_FN_BASE_URL`` defaults to ``http://127.0.0.1:8001/plugins/trex/fhir``.
  Adjust if your runtime binds to a different port or if ``PLUGINS_BASE_PATH``
  produces a different prefix (e.g. ``/trex/fhir``).
* The suite uses unique dataset ids (UUID-prefixed) for each test to avoid
  cross-test interference.
* Export tests poll the status URL until the job completes (or a 10-second
  timeout is reached) because the fhir-fn export runs inline but the status
  endpoint is still consulted to confirm the response shape.
"""

import json
import os
import time
import urllib.request
import urllib.error
import uuid

import pytest

# ---------------------------------------------------------------------------
# FhirClient — wraps the stdlib client from the standalone harness, injecting
# the service-role apikey on every request.
# ---------------------------------------------------------------------------

# Try to import directly; if conftest/pytest path resolution makes it
# unavailable (e.g. when running from a different CWD), fall back to an
# inline copy that is functionally identical.
try:
    from test_fhir_standalone import FhirClient as _BaseFhirClient  # type: ignore

    class FhirClient(_BaseFhirClient):
        """FhirClient that injects ``apikey: <key>`` on every request."""

        def __init__(self, base_url: str, apikey: str):
            super().__init__(base_url)
            self._apikey = apikey

        def request(self, method, path, data=None, headers=None):
            merged = {"apikey": self._apikey}
            if headers:
                merged.update(headers)
            return super().request(method, path, data=data, headers=merged)

        def post_raw(self, path, raw_bytes, content_type="application/json"):
            url = f"{self.base_url}{path}"
            req = urllib.request.Request(url, data=raw_bytes, method="POST")
            req.add_header("Content-Type", content_type)
            req.add_header("apikey", self._apikey)
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    return self._parse(resp.status, resp.read(), resp.headers)
            except urllib.error.HTTPError as e:
                return self._parse(e.code, e.read(), e.headers)

except ImportError:
    # Inline fallback — identical logic to the standalone version.
    import json as _json

    class FhirClient:  # type: ignore[no-redef]
        """Thin HTTP client for FHIR API testing (stdlib only), with apikey auth."""

        def __init__(self, base_url: str, apikey: str):
            self.base_url = base_url
            self._apikey = apikey

        def request(self, method, path, data=None, headers=None):
            url = f"{self.base_url}{path}"
            body_bytes = _json.dumps(data).encode("utf-8") if data is not None else None
            req = urllib.request.Request(url, data=body_bytes, method=method)
            if data is not None:
                req.add_header("Content-Type", "application/json")
            req.add_header("apikey", self._apikey)
            for k, v in (headers or {}).items():
                req.add_header(k, v)
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    return self._parse(resp.status, resp.read(), resp.headers)
            except urllib.error.HTTPError as e:
                return self._parse(e.code, e.read(), e.headers)

        @staticmethod
        def _parse(status, raw_bytes, hdrs_obj):
            text = raw_bytes.decode("utf-8") if raw_bytes else ""
            try:
                body = _json.loads(text) if text.strip() else None
            except _json.JSONDecodeError:
                body = text
            hdrs = {k.lower(): v for k, v in hdrs_obj.items()}
            return status, body, hdrs

        def get(self, path, **kw):
            return self.request("GET", path, **kw)

        def post(self, path, data, **kw):
            return self.request("POST", path, data, **kw)

        def put(self, path, data, **kw):
            return self.request("PUT", path, data, **kw)

        def delete(self, path, **kw):
            return self.request("DELETE", path, **kw)

        def post_raw(self, path, raw_bytes, content_type="application/json"):
            url = f"{self.base_url}{path}"
            req = urllib.request.Request(url, data=raw_bytes, method="POST")
            req.add_header("Content-Type", content_type)
            req.add_header("apikey", self._apikey)
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    return self._parse(resp.status, resp.read(), resp.headers)
            except urllib.error.HTTPError as e:
                return self._parse(e.code, e.read(), e.headers)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uid() -> str:
    """Short unique dataset id safe for FHIR dataset names."""
    return f"t-{uuid.uuid4().hex[:8]}"


def _create_dataset(client: FhirClient, dataset_id: str = None, name: str = None) -> str:
    """Create a dataset and return its id (asserts 201)."""
    did = dataset_id or _uid()
    status, body, _ = client.post("/datasets", {"id": did, "name": name or f"DS {did}"})
    assert status == 201, f"create_dataset failed ({status}): {body}"
    return did


def _create_patient(
    client: FhirClient,
    dataset_id: str,
    family: str = "Doe",
    given: str = "John",
    gender: str = "male",
):
    """POST a Patient; return (status, body, headers)."""
    return client.post(
        f"/{dataset_id}/Patient",
        {
            "resourceType": "Patient",
            "name": [{"family": family, "given": [given]}],
            "gender": gender,
        },
    )


def _poll_export_status(client: FhirClient, status_url: str, timeout: float = 30.0):
    """Poll *status_url* (relative or absolute) until the job completes or times out.

    Returns ``(status_code, body, headers)`` of the final response.
    """
    deadline = time.time() + timeout
    # status_url may be absolute (http://...) or relative (/ds/$export/status/...)
    if status_url.startswith("http"):
        # Make it relative to base_url for the FhirClient
        base = client.base_url
        path = status_url[len(base):]
    else:
        path = status_url

    while time.time() < deadline:
        s, body, hdrs = client.get(path)
        if s == 200:
            return s, body, hdrs
        if s == 202:
            time.sleep(0.5)
            continue
        # Any other status is unexpected — return it for the caller to assert on
        return s, body, hdrs
    return client.get(path)


# ---------------------------------------------------------------------------
# Module-scoped fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def fhir():
    """Resolve env vars, poll /health, and yield an authenticated FhirClient.

    Skips the entire module when ``FHIR_FN_APIKEY`` is not set so the suite is
    safe to include in CI without breaking builds that don't have a running
    runtime.
    """
    apikey = os.environ.get("FHIR_FN_APIKEY", "")
    if not apikey:
        pytest.skip("set FHIR_FN_APIKEY to run fhir-fn integration tests")

    base_url = os.environ.get(
        "FHIR_FN_BASE_URL", "http://127.0.0.1:8001/plugins/trex/fhir"
    )
    client = FhirClient(base_url, apikey)

    # Poll /health until the function is reachable.
    deadline = time.time() + 60
    last_err = None
    while time.time() < deadline:
        try:
            s, body, _ = client.get("/health")
            if s == 200:
                break
        except Exception as exc:
            last_err = exc
        time.sleep(1.0)
    else:
        pytest.fail(
            f"fhir-fn /health did not return 200 within 60 s "
            f"(base_url={base_url}, last_err={last_err})"
        )

    yield client


# ===================================================================
# HEALTH
# ===================================================================

def test_health_check(fhir):
    """GET /health returns 200 with status=healthy."""
    status, body, _ = fhir.get("/health")
    assert status == 200
    assert body["status"] == "healthy"


# ===================================================================
# DATASETS
# ===================================================================

def test_create_dataset(fhir):
    """POST /datasets creates a dataset and returns 201."""
    did = _uid()
    status, body, _ = fhir.post("/datasets", {"id": did, "name": "Create Test"})
    assert status == 201
    assert body["id"] == did
    assert body["status"] == "active"


def test_list_datasets_includes_new(fhir):
    """GET /datasets lists all datasets including newly created ones."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.get("/datasets")
    assert status == 200
    assert isinstance(body, list)
    assert did in [d["id"] for d in body]


def test_get_dataset(fhir):
    """GET /datasets/{id} returns the dataset."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/datasets/{did}")
    assert status == 200
    assert body["id"] == did


def test_delete_dataset(fhir):
    """DELETE /datasets/{id} removes the dataset; subsequent GET returns 404."""
    did = _create_dataset(fhir)
    status, _, _ = fhir.delete(f"/datasets/{did}")
    assert status == 204
    status, _, _ = fhir.get(f"/datasets/{did}")
    assert status == 404


def test_create_dataset_duplicate_returns_400_or_409(fhir):
    """Creating a dataset with an already-used id returns 400 or 409."""
    did = _create_dataset(fhir)
    status, _, _ = fhir.post("/datasets", {"id": did, "name": "Dup"})
    assert status in (400, 409)


def test_get_dataset_not_found(fhir):
    """GET /datasets/{nonexistent} returns 404 OperationOutcome."""
    status, body, _ = fhir.get("/datasets/nonexistent-ds-xyz-fn")
    assert status == 404
    assert body["resourceType"] == "OperationOutcome"


# ===================================================================
# METADATA
# ===================================================================

def test_metadata_capability_statement(fhir):
    """GET /{ds}/metadata returns a CapabilityStatement for FHIR R4."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/metadata")
    assert status == 200
    assert body["resourceType"] == "CapabilityStatement"
    assert body["fhirVersion"] == "4.0.1"
    assert "json" in body["format"]


def test_metadata_has_patient_resource(fhir):
    """CapabilityStatement lists Patient with read + create interactions."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/metadata")
    assert status == 200
    rest = body["rest"][0]
    types = [r["type"] for r in rest["resource"]]
    assert "Patient" in types
    patient = next(r for r in rest["resource"] if r["type"] == "Patient")
    codes = [i["code"] for i in patient["interaction"]]
    assert "read" in codes
    assert "create" in codes


def test_metadata_nonexistent_dataset(fhir):
    """GET /{nonexistent}/metadata returns 404."""
    status, _, _ = fhir.get("/nonexistent-ds-xyz-fn/metadata")
    assert status == 404


# ===================================================================
# RESOURCE CRUD
# ===================================================================

def test_create_patient(fhir):
    """POST /{ds}/Patient creates a resource: 201 + Location + ETag."""
    did = _create_dataset(fhir)
    status, body, hdrs = _create_patient(fhir, did)
    assert status == 201
    assert body["resourceType"] == "Patient"
    assert "id" in body
    assert body["meta"]["versionId"] == "1"
    assert "location" in hdrs
    assert "etag" in hdrs


def test_read_patient(fhir):
    """GET /{ds}/Patient/{id} returns 200 with the created resource."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}")
    assert status == 200
    assert body["id"] == pid
    assert body["resourceType"] == "Patient"


def test_read_missing_patient_returns_404(fhir):
    """GET /{ds}/Patient/{nonexistent} returns 404 OperationOutcome."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/Patient/does-not-exist-fn")
    assert status == 404
    assert body["resourceType"] == "OperationOutcome"
    assert body["issue"][0]["code"] == "not-found"


def test_update_patient_increments_version(fhir):
    """PUT /{ds}/Patient/{id} returns 200 with versionId bumped to 2."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]

    status, body, _ = fhir.put(
        f"/{did}/Patient/{pid}",
        {
            "resourceType": "Patient",
            "id": pid,
            "name": [{"family": "Smith", "given": ["Jane"]}],
            "gender": "female",
        },
    )
    assert status == 200
    assert body["meta"]["versionId"] == "2"
    assert body["name"][0]["family"] == "Smith"


def test_delete_patient_returns_204(fhir):
    """DELETE /{ds}/Patient/{id} returns 204."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]

    status, _, _ = fhir.delete(f"/{did}/Patient/{pid}")
    assert status == 204


def test_read_deleted_patient_returns_410(fhir):
    """GET /{ds}/Patient/{id} after deletion returns 410 OperationOutcome."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]
    fhir.delete(f"/{did}/Patient/{pid}")

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}")
    assert status == 410
    assert body["resourceType"] == "OperationOutcome"
    assert body["issue"][0]["code"] == "deleted"


def test_upsert_via_put(fhir):
    """PUT /{ds}/Patient/{new-id} for a non-existent resource creates it (201)."""
    did = _create_dataset(fhir)
    new_id = str(uuid.uuid4())
    status, body, _ = fhir.put(
        f"/{did}/Patient/{new_id}",
        {"resourceType": "Patient", "id": new_id, "name": [{"family": "Upsert"}]},
    )
    assert status == 201
    assert body["id"] == new_id


# ===================================================================
# SEARCH
# ===================================================================

def test_search_empty_returns_searchset(fhir):
    """GET /{ds}/Patient on an empty dataset returns a 0-total searchset Bundle."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/Patient")
    assert status == 200
    assert body["resourceType"] == "Bundle"
    assert body["type"] == "searchset"
    assert body["total"] == 0


def test_search_returns_all_patients(fhir):
    """Creating 2 Patients and searching returns both."""
    did = _create_dataset(fhir)
    _create_patient(fhir, did, family="Alpha")
    _create_patient(fhir, did, family="Beta")

    status, body, _ = fhir.get(f"/{did}/Patient")
    assert status == 200
    assert body["total"] == 2
    assert len(body["entry"]) == 2


def test_search_by_gender(fhir):
    """?gender=female filters to matching patients only."""
    did = _create_dataset(fhir)
    _create_patient(fhir, did, family="A", gender="male")
    _create_patient(fhir, did, family="B", gender="female")
    _create_patient(fhir, did, family="C", gender="male")

    status, body, _ = fhir.get(f"/{did}/Patient?gender=female")
    assert status == 200
    assert body["total"] == 1
    assert body["entry"][0]["resource"]["gender"] == "female"


def test_search_excludes_deleted_resources(fhir):
    """Deleted resources do not appear in search results."""
    did = _create_dataset(fhir)
    _, p1, _ = _create_patient(fhir, did, family="Keep")
    _, p2, _ = _create_patient(fhir, did, family="Remove")
    fhir.delete(f"/{did}/Patient/{p2['id']}")

    status, body, _ = fhir.get(f"/{did}/Patient")
    assert status == 200
    assert body["total"] == 1
    assert body["entry"][0]["resource"]["name"][0]["family"] == "Keep"


# ===================================================================
# HISTORY
# ===================================================================

def test_history_after_update_has_two_entries(fhir):
    """_history bundle has total=2 after one update (v1 + v2)."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did, family="V1")
    pid = created["id"]

    fhir.put(
        f"/{did}/Patient/{pid}",
        {"resourceType": "Patient", "id": pid, "name": [{"family": "V2"}]},
    )

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}/_history")
    assert status == 200
    assert body["resourceType"] == "Bundle"
    assert body["type"] == "history"
    assert body["total"] == 2


def test_read_specific_version(fhir):
    """GET /{ds}/Patient/{id}/_history/1 returns the original (v1) resource."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did, family="VerA")
    pid = created["id"]

    fhir.put(
        f"/{did}/Patient/{pid}",
        {"resourceType": "Patient", "id": pid, "name": [{"family": "VerB"}]},
    )

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}/_history/1")
    assert status == 200
    assert body["name"][0]["family"] == "VerA"


def test_history_after_delete_includes_delete_entry(fhir):
    """_history after deletion has ≥2 entries with a DELETE method entry."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did, family="DelHist")
    pid = created["id"]
    fhir.delete(f"/{did}/Patient/{pid}")

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}/_history")
    assert status == 200
    assert body["total"] >= 2
    methods = [e["request"]["method"] for e in body["entry"]]
    assert "DELETE" in methods


# ===================================================================
# BUNDLES
# ===================================================================

def _make_bundle(btype, entries):
    return {"resourceType": "Bundle", "type": btype, "entry": entries}


def _entry(resource_type, resource, method="POST"):
    return {"request": {"method": method, "url": resource_type}, "resource": resource}


def test_transaction_bundle_two_creates(fhir):
    """POST transaction Bundle with 2 Patient creates → 200 transaction-response."""
    did = _create_dataset(fhir)
    bundle = _make_bundle(
        "transaction",
        [
            _entry("Patient", {"resourceType": "Patient", "name": [{"family": "TxA"}]}),
            _entry("Patient", {"resourceType": "Patient", "name": [{"family": "TxB"}]}),
        ],
    )
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200
    assert body["type"] == "transaction-response"
    assert len(body["entry"]) == 2
    assert "201" in body["entry"][0]["response"]["status"]
    assert "201" in body["entry"][1]["response"]["status"]


def test_transaction_bundle_resources_are_readable(fhir):
    """Resources created via a transaction bundle are individually readable."""
    did = _create_dataset(fhir)
    bundle = _make_bundle(
        "transaction",
        [
            {
                "resource": {"resourceType": "Patient", "name": [{"family": "BundleRead"}]},
                "request": {"method": "PUT", "url": "Patient/br-pat-001"},
            },
        ],
    )
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200, f"transaction failed: {body}"
    assert "201" in body["entry"][0]["response"]["status"]

    status, patient, _ = fhir.get(f"/{did}/Patient/br-pat-001")
    assert status == 200
    assert patient["id"] == "br-pat-001"
    assert patient["name"][0]["family"] == "BundleRead"


def test_batch_bundle_returns_batch_response(fhir):
    """POST batch Bundle → 200 batch-response with per-entry statuses."""
    did = _create_dataset(fhir)
    bundle = _make_bundle(
        "batch",
        [
            _entry("Patient", {"resourceType": "Patient", "name": [{"family": "BtA"}]}),
            _entry("Patient", {"resourceType": "Patient", "name": [{"family": "BtB"}]}),
        ],
    )
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200
    assert body["type"] == "batch-response"
    assert len(body["entry"]) == 2


def test_bundle_unsupported_type_returns_400(fhir):
    """POSTing a 'document' bundle returns 400."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.post(f"/{did}", _make_bundle("document", []))
    assert status == 400


def test_bundle_not_a_bundle_returns_400(fhir):
    """POSTing a non-Bundle resource to the bundle endpoint returns 400."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.post(f"/{did}", {"resourceType": "Patient"})
    assert status == 400


# ===================================================================
# $IMPORT (NDJSON)
# ===================================================================

def test_import_ndjson_three_patients(fhir):
    """POST NDJSON with 3 Patients → success counts; all 3 retrievable."""
    did = _create_dataset(fhir)
    ids = [str(uuid.uuid4()) for _ in range(3)]
    lines = [
        json.dumps({"resourceType": "Patient", "id": pid, "name": [{"family": f"Imp{i}"}]})
        for i, pid in enumerate(ids)
    ]
    ndjson = "\n".join(lines).encode("utf-8")

    status, body, _ = fhir.post_raw(f"/{did}/$import", ndjson, content_type="application/x-ndjson")
    assert status == 200, f"$import failed ({status}): {body}"
    assert body["outcome"] == "complete"
    assert body["total"]["success"] == 3
    assert body["total"]["errors"] == 0
    assert body["success"]["Patient"] == 3

    # All 3 patients must be readable
    for pid in ids:
        s, res, _ = fhir.get(f"/{did}/Patient/{pid}")
        assert s == 200, f"Patient {pid} not found after import ({s}): {res}"


def test_import_ndjson_mixed_resource_types(fhir):
    """Import Patient + Observation in one NDJSON payload."""
    did = _create_dataset(fhir)
    patient_id = str(uuid.uuid4())
    obs_id = str(uuid.uuid4())
    ndjson = "\n".join([
        json.dumps({"resourceType": "Patient", "id": patient_id, "name": [{"family": "ImpMix"}], "gender": "female"}),
        json.dumps({"resourceType": "Observation", "id": obs_id, "status": "final",
                    "code": {"text": "bp"}, "subject": {"reference": f"Patient/{patient_id}"}}),
    ]).encode("utf-8")

    status, body, _ = fhir.post_raw(f"/{did}/$import", ndjson, content_type="application/x-ndjson")
    assert status == 200, f"$import failed ({status}): {body}"
    assert body["total"]["success"] == 2
    assert body["total"]["errors"] == 0
    assert body["success"]["Patient"] == 1
    assert body["success"]["Observation"] == 1


def test_import_ndjson_verify_via_search(fhir):
    """Imported patients appear in a subsequent search."""
    did = _create_dataset(fhir)
    lines = [
        json.dumps({"resourceType": "Patient", "id": str(uuid.uuid4()), "gender": "male"})
        for _ in range(3)
    ]
    ndjson = "\n".join(lines).encode("utf-8")

    status, body, _ = fhir.post_raw(f"/{did}/$import", ndjson, content_type="application/x-ndjson")
    assert status == 200

    s, search, _ = fhir.get(f"/{did}/Patient?gender=male")
    assert s == 200
    assert search["total"] == 3


def test_import_ndjson_nonexistent_dataset_returns_404(fhir):
    """$import against a non-existent dataset returns 404 OperationOutcome."""
    ndjson = json.dumps({"resourceType": "Patient", "id": "x"}).encode("utf-8")
    status, body, _ = fhir.post_raw(
        "/nonexistent-ds-fn-import/$import", ndjson, content_type="application/x-ndjson"
    )
    assert status == 404
    assert body["resourceType"] == "OperationOutcome"


# ===================================================================
# $EXPORT
# ===================================================================

def test_export_returns_202_and_content_location(fhir):
    """GET /{ds}/$export returns 202 Accepted with a Content-Location header."""
    did = _create_dataset(fhir)
    # Seed at least one patient so the export has something to process
    _create_patient(fhir, did, family="ExportMe")

    status, body, hdrs = fhir.get(f"/{did}/$export")
    assert status == 202, f"$export expected 202, got {status}: {body}"
    assert "content-location" in hdrs, f"missing Content-Location; headers: {hdrs}"
    loc = hdrs["content-location"]
    assert loc, "Content-Location must not be empty"


def test_export_status_url_eventually_completes(fhir):
    """Poll the export status URL until 200 (complete) and verify output shape."""
    did = _create_dataset(fhir)
    _create_patient(fhir, did, family="ExportPoll")

    status, body, hdrs = fhir.get(f"/{did}/$export")
    assert status == 202, f"$export failed ({status}): {body}"

    loc = hdrs.get("content-location", "")
    assert loc, "no Content-Location returned by $export"

    final_status, final_body, _ = _poll_export_status(fhir, loc, timeout=30.0)
    assert final_status == 200, (
        f"export did not complete within 30 s (last status={final_status}): {final_body}"
    )
    # FHIR bulk-data response shape
    assert "output" in final_body, f"'output' key missing from export response: {final_body}"
    assert isinstance(final_body["output"], list)
    assert "requiresAccessToken" in final_body
    assert final_body["requiresAccessToken"] is False


def test_export_output_has_patient_counts(fhir):
    """Export output for a dataset with Patients includes a Patient entry with count > 0."""
    did = _create_dataset(fhir)
    for i in range(2):
        _create_patient(fhir, did, family=f"ExportCt{i}")

    status, body, hdrs = fhir.get(f"/{did}/$export")
    assert status == 202

    loc = hdrs.get("content-location", "")
    final_status, final_body, _ = _poll_export_status(fhir, loc, timeout=30.0)
    assert final_status == 200, f"export did not complete: {final_body}"

    patient_entries = [o for o in final_body["output"] if o.get("type") == "Patient"]
    assert len(patient_entries) >= 1, (
        f"no Patient entry in export output: {final_body['output']}"
    )
    assert patient_entries[0]["count"] >= 2


# ===================================================================
# AUTH — unauthenticated requests must be rejected
# ===================================================================

def test_unauthenticated_request_returns_401(fhir):
    """A request without the apikey header returns 401."""
    # Build an unauthenticated client by bypassing the FhirClient wrapper
    url = f"{fhir.base_url}/datasets"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.status
    except urllib.error.HTTPError as e:
        status = e.code
    assert status == 401, f"expected 401 for unauthenticated request, got {status}"


# ===================================================================
# ERROR SHAPES
# ===================================================================

def test_404_has_operation_outcome(fhir):
    """404 responses carry a FHIR OperationOutcome body."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/Patient/does-not-exist-fn-err")
    assert status == 404
    assert body["resourceType"] == "OperationOutcome"
    assert body["issue"][0]["severity"] == "error"


def test_410_has_operation_outcome(fhir):
    """410 responses carry a FHIR OperationOutcome with code=deleted."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]
    fhir.delete(f"/{did}/Patient/{pid}")

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}")
    assert status == 410
    assert body["resourceType"] == "OperationOutcome"
    assert body["issue"][0]["code"] == "deleted"


def test_create_wrong_resource_type_returns_400(fhir):
    """POST body with mismatched resourceType to endpoint returns 400."""
    did = _create_dataset(fhir)
    status, _, _ = fhir.post(
        f"/{did}/Patient",
        {"resourceType": "Observation", "code": {"text": "wrong"}},
    )
    assert status == 400


def test_invalid_json_returns_400_or_422(fhir):
    """POSTing non-JSON bytes returns 400 or 422."""
    did = _create_dataset(fhir)
    status, _, _ = fhir.post_raw(f"/{did}/Patient", b"not valid json{{{")
    assert status in (400, 422)
