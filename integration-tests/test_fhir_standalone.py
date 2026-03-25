"""FHIR R4 Server integration tests.

Tests the HTTP API end-to-end: requests go through axum routing,
middleware, handlers, and hit a real DuckDB database.

A single FHIR server is started per module. Each test creates its own
dataset with a unique name so tests don't interfere with each other.
"""

import json
import os
import socket
import time
import urllib.request
import urllib.error
import uuid

import pytest

from conftest import Node, FHIR_EXT, alloc_ports

# Pool sizes to test: single-threaded and multi-threaded.
# Each parametrized value starts a separate FHIR server instance.
POOL_SIZES = [1, 4]

# DB modes: "standalone" = FHIR server owns its own DuckDB (default),
#            "host" = FHIR server uses the host DuckDB connection.
DB_MODES = ["standalone", "host"]


def _free_port():
    """Ask the OS for a free TCP port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


# ---------------------------------------------------------------------------
# HTTP client
# ---------------------------------------------------------------------------

class FhirClient:
    """Thin HTTP client for FHIR API testing (stdlib only)."""

    def __init__(self, base_url):
        self.base_url = base_url

    def request(self, method, path, data=None, headers=None):
        """Return (status_code, parsed_body, response_headers)."""
        url = f"{self.base_url}{path}"
        body_bytes = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=body_bytes, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return self._parse(resp.status, resp.read(), resp.headers)
        except urllib.error.HTTPError as e:
            return self._parse(e.code, e.read(), e.headers)

    @staticmethod
    def _parse(status, raw_bytes, headers):
        text = raw_bytes.decode("utf-8") if raw_bytes else ""
        try:
            body = json.loads(text) if text.strip() else None
        except json.JSONDecodeError:
            body = text  # plain-text (metrics, etc.)
        # Normalise header keys to lowercase for consistent lookups.
        hdrs = {k.lower(): v for k, v in headers.items()}
        return status, body, hdrs

    # convenience wrappers
    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, data, **kw):
        return self.request("POST", path, data, **kw)

    def put(self, path, data, **kw):
        return self.request("PUT", path, data, **kw)

    def delete(self, path, **kw):
        return self.request("DELETE", path, **kw)

    def post_raw(self, path, raw_bytes, content_type="application/json"):
        """Send raw bytes (for invalid-JSON tests)."""
        url = f"{self.base_url}{path}"
        req = urllib.request.Request(url, data=raw_bytes, method="POST")
        req.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return self._parse(resp.status, resp.read(), resp.headers)
        except urllib.error.HTTPError as e:
            return self._parse(e.code, e.read(), e.headers)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uid():
    """Short unique dataset id (alphanumeric + hyphen)."""
    return f"t-{uuid.uuid4().hex[:8]}"


def _create_dataset(client, dataset_id=None, name=None):
    """Create a dataset and return its id (asserts 201)."""
    did = dataset_id or _uid()
    status, body, _ = client.post("/datasets", {"id": did, "name": name or f"DS {did}"})
    assert status == 201, f"create_dataset failed ({status}): {body}"
    return did


def _create_patient(client, dataset_id, family="Doe", given="John", gender="male"):
    """POST a Patient, return (status, body, headers)."""
    return client.post(f"/{dataset_id}/Patient", {
        "resourceType": "Patient",
        "name": [{"family": family, "given": [given]}],
        "gender": gender,
    })


# ---------------------------------------------------------------------------
# Module-scoped fixture: one FHIR server for all tests in this file
# ---------------------------------------------------------------------------

_FHIR_PARAMS = [(pool, mode) for pool in POOL_SIZES for mode in DB_MODES]
_FHIR_IDS = [f"pool={pool}-{mode}" for pool, mode in _FHIR_PARAMS]


@pytest.fixture(scope="module", params=_FHIR_PARAMS, ids=_FHIR_IDS)
def fhir(request):
    """Start the FHIR extension with a given pool size and DB mode, yield an FhirClient."""
    import tempfile, shutil

    pool_size, db_mode = request.param
    os.environ["FHIR_POOL_SIZE"] = str(pool_size)
    os.environ["FHIR_USE_HOST_DB"] = "true" if db_mode == "host" else "false"

    gp, fp, pp = alloc_ports()
    node = Node([FHIR_EXT], gp, fp, pp)

    fhir_db_dir = None
    fhir_port = _free_port()

    if db_mode == "standalone":
        # Standalone mode: FHIR server creates its own DuckDB file
        fhir_db_dir = tempfile.mkdtemp(
            dir=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tmp", "fhir-test-dbs"),
        )
        fhir_db_path = os.path.join(fhir_db_dir, "fhir.db")
        result = node.execute(
            f"SELECT trex_fhir_start('127.0.0.1', {fhir_port}, 'fhir', '{fhir_db_path}')"
        )
    else:
        # Host mode: FHIR server uses the host DuckDB connection (catalog = 'fhir')
        result = node.execute(
            f"SELECT trex_fhir_start('127.0.0.1', {fhir_port}, 'fhir')"
        )

    assert len(result) == 1 and "Started" in result[0][0], f"trex_fhir_start: {result}"

    client = FhirClient(f"http://127.0.0.1:{fhir_port}")
    client.pool_size = pool_size  # expose for test introspection
    client.db_mode = db_mode

    # Poll /health until server is ready (definition loading can take seconds)
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            s, _, _ = client.get("/health")
            if s == 200:
                break
        except Exception:
            pass
        time.sleep(0.5)
    else:
        node.close()
        if fhir_db_dir:
            shutil.rmtree(fhir_db_dir, ignore_errors=True)
        pytest.fail(f"FHIR server (pool={pool_size}, {db_mode}) did not become healthy within 30 s")

    yield client

    try:
        node.execute(f"SELECT trex_fhir_stop('127.0.0.1', {fhir_port})")
    except Exception:
        pass
    node.close()
    if fhir_db_dir:
        shutil.rmtree(fhir_db_dir, ignore_errors=True)


# ===================================================================
# HEALTH
# ===================================================================

def test_health_check(fhir):
    """GET /health returns 200 with status=healthy."""
    status, body, _ = fhir.get("/health")
    assert status == 200
    assert body["status"] == "healthy"
    assert body["database"] == "connected"


def test_metrics_prometheus_format(fhir):
    """GET /metrics returns Prometheus text exposition."""
    status, body, hdrs = fhir.get("/metrics")
    assert status == 200
    assert "text/plain" in hdrs.get("content-type", "")
    assert "fhir_requests_total" in body
    assert "fhir_errors_total" in body


# ===================================================================
# DATASETS
# ===================================================================

def test_create_dataset(fhir):
    did = _uid()
    status, body, _ = fhir.post("/datasets", {"id": did, "name": "Create Test"})
    assert status == 201
    assert body["id"] == did
    assert body["status"] == "active"
    assert body["resource_count"] > 0


def test_list_datasets_includes_new(fhir):
    did = _create_dataset(fhir)
    status, body, _ = fhir.get("/datasets")
    assert status == 200
    assert isinstance(body, list)
    assert did in [d["id"] for d in body]


def test_get_dataset(fhir):
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/datasets/{did}")
    assert status == 200
    assert body["id"] == did


def test_delete_dataset(fhir):
    did = _create_dataset(fhir)
    status, _, _ = fhir.delete(f"/datasets/{did}")
    assert status == 204
    # confirm gone
    status, _, _ = fhir.get(f"/datasets/{did}")
    assert status == 404


def test_create_dataset_invalid_id(fhir):
    status, body, _ = fhir.post("/datasets", {"id": "has spaces!", "name": "Bad"})
    assert status == 400


def test_create_dataset_duplicate(fhir):
    did = _create_dataset(fhir)
    status, _, _ = fhir.post("/datasets", {"id": did, "name": "Dup"})
    assert status in (400, 409)


def test_get_dataset_not_found(fhir):
    status, body, _ = fhir.get("/datasets/nonexistent-ds-xyz")
    assert status == 404
    assert body["resourceType"] == "OperationOutcome"


def test_delete_dataset_not_found(fhir):
    status, _, _ = fhir.delete("/datasets/nonexistent-ds-xyz")
    assert status == 404


# ===================================================================
# RESOURCE CRUD
# ===================================================================

def test_create_patient(fhir):
    did = _create_dataset(fhir)
    status, body, hdrs = _create_patient(fhir, did)
    assert status == 201
    assert body["resourceType"] == "Patient"
    assert "id" in body
    assert body["meta"]["versionId"] == "1"
    assert "location" in hdrs
    assert "etag" in hdrs


def test_read_patient(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]

    status, body, hdrs = fhir.get(f"/{did}/Patient/{pid}")
    assert status == 200
    assert body["id"] == pid
    assert body["resourceType"] == "Patient"


def test_update_patient(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]

    status, body, _ = fhir.put(f"/{did}/Patient/{pid}", {
        "resourceType": "Patient",
        "id": pid,
        "name": [{"family": "Smith", "given": ["Jane"]}],
        "gender": "female",
    })
    assert status == 200
    assert body["meta"]["versionId"] == "2"
    assert body["name"][0]["family"] == "Smith"


def test_delete_patient(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]

    status, _, _ = fhir.delete(f"/{did}/Patient/{pid}")
    assert status == 204


def test_read_deleted_patient_returns_410(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]
    fhir.delete(f"/{did}/Patient/{pid}")

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}")
    assert status == 410
    assert body["resourceType"] == "OperationOutcome"


def test_upsert_via_put(fhir):
    did = _create_dataset(fhir)
    new_id = str(uuid.uuid4())
    status, body, _ = fhir.put(f"/{did}/Patient/{new_id}", {
        "resourceType": "Patient",
        "id": new_id,
        "name": [{"family": "Upsert"}],
    })
    assert status == 201
    assert body["id"] == new_id


def test_create_wrong_resource_type(fhir):
    """POST Observation body to Patient endpoint -> 400."""
    did = _create_dataset(fhir)
    status, _, _ = fhir.post(f"/{did}/Patient", {
        "resourceType": "Observation",
        "code": {"text": "wrong"},
    })
    assert status == 400


def test_read_nonexistent_resource(fhir):
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/Patient/does-not-exist")
    assert status == 404


# ===================================================================
# SEARCH
# ===================================================================

def test_search_empty(fhir):
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/Patient")
    assert status == 200
    assert body["resourceType"] == "Bundle"
    assert body["type"] == "searchset"
    assert body["total"] == 0
    assert body["entry"] == []


def test_search_returns_resources(fhir):
    did = _create_dataset(fhir)
    _create_patient(fhir, did, family="Alpha")
    _create_patient(fhir, did, family="Beta")

    status, body, _ = fhir.get(f"/{did}/Patient")
    assert status == 200
    assert body["total"] == 2
    assert len(body["entry"]) == 2


def test_search_count(fhir):
    did = _create_dataset(fhir)
    for i in range(3):
        _create_patient(fhir, did, family=f"Page{i}")

    status, body, _ = fhir.get(f"/{did}/Patient?_count=2")
    assert status == 200
    assert len(body["entry"]) == 2
    assert body["total"] == 3
    links = {l["relation"]: l["url"] for l in body["link"]}
    assert "next" in links


def test_search_offset(fhir):
    did = _create_dataset(fhir)
    for i in range(3):
        _create_patient(fhir, did, family=f"Off{i}")

    status, body, _ = fhir.get(f"/{did}/Patient?_count=2&_offset=2")
    assert status == 200
    assert len(body["entry"]) == 1
    links = {l["relation"]: l["url"] for l in body["link"]}
    assert "previous" in links


def test_search_by_gender(fhir):
    """Token search parameter on a simple code field."""
    did = _create_dataset(fhir)
    _create_patient(fhir, did, family="A", gender="male")
    _create_patient(fhir, did, family="B", gender="female")
    _create_patient(fhir, did, family="C", gender="male")

    status, body, _ = fhir.get(f"/{did}/Patient?gender=female")
    assert status == 200
    assert body["total"] == 1
    assert body["entry"][0]["resource"]["gender"] == "female"


def test_search_by_family_name(fhir):
    """String search parameter on an array-nested field (Patient.name.family)."""
    did = _create_dataset(fhir)
    _create_patient(fhir, did, family="Smith")
    _create_patient(fhir, did, family="Jones")
    _create_patient(fhir, did, family="Smithson")  # prefix match

    status, body, _ = fhir.get(f"/{did}/Patient?family=smith")
    assert status == 200
    # Default string search is prefix + case-insensitive, so "Smith" and "Smithson" match.
    families = [e["resource"]["name"][0]["family"] for e in body["entry"]]
    assert "Smith" in families
    assert "Smithson" in families
    assert "Jones" not in families


def test_search_excludes_deleted(fhir):
    did = _create_dataset(fhir)
    _, p1, _ = _create_patient(fhir, did, family="Keep")
    _, p2, _ = _create_patient(fhir, did, family="Remove")
    fhir.delete(f"/{did}/Patient/{p2['id']}")

    status, body, _ = fhir.get(f"/{did}/Patient")
    assert status == 200
    assert body["total"] == 1
    assert body["entry"][0]["resource"]["name"][0]["family"] == "Keep"


# ===================================================================
# BUNDLES
# ===================================================================

def _make_bundle(btype, entries):
    return {"resourceType": "Bundle", "type": btype, "entry": entries}


def _entry(resource_type, resource, method="POST", full_url=None):
    e = {"request": {"method": method, "url": resource_type}, "resource": resource}
    if full_url:
        e["fullUrl"] = full_url
    return e


def test_transaction_bundle(fhir):
    did = _create_dataset(fhir)
    bundle = _make_bundle("transaction", [
        _entry("Patient", {"resourceType": "Patient", "name": [{"family": "TxA"}]}),
        _entry("Patient", {"resourceType": "Patient", "name": [{"family": "TxB"}]}),
    ])
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200
    assert body["type"] == "transaction-response"
    assert len(body["entry"]) == 2
    assert "201" in body["entry"][0]["response"]["status"]


def test_batch_bundle(fhir):
    did = _create_dataset(fhir)
    bundle = _make_bundle("batch", [
        _entry("Patient", {"resourceType": "Patient", "name": [{"family": "BtA"}]}),
        _entry("Patient", {"resourceType": "Patient", "name": [{"family": "BtB"}]}),
    ])
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200
    assert body["type"] == "batch-response"
    assert len(body["entry"]) == 2


def test_transaction_reference_resolution(fhir):
    did = _create_dataset(fhir)
    patient_urn = f"urn:uuid:{uuid.uuid4()}"
    bundle = _make_bundle("transaction", [
        _entry("Patient", {
            "resourceType": "Patient",
            "name": [{"family": "RefTest"}],
        }, full_url=patient_urn),
        _entry("Observation", {
            "resourceType": "Observation",
            "status": "final",
            "code": {"text": "test"},
            "subject": {"reference": patient_urn},
        }),
    ])
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200
    assert len(body["entry"]) == 2
    assert "201" in body["entry"][0]["response"]["status"]
    assert "201" in body["entry"][1]["response"]["status"]

    # Extract IDs from response location (format: "/{dataset}/Patient/{id}")
    pat_location = body["entry"][0]["response"]["location"]
    obs_location = body["entry"][1]["response"]["location"]
    pat_id = pat_location.split("/")[3]  # ['', did, 'Patient', id]
    obs_id = obs_location.split("/")[3]  # ['', did, 'Observation', id]

    # Verify Patient is persisted and retrievable
    status, patient, _ = fhir.get(f"/{did}/Patient/{pat_id}")
    assert status == 200, f"GET Patient/{pat_id} failed ({status}): {patient}"
    assert patient["name"][0]["family"] == "RefTest"

    # Verify Observation is persisted and urn:uuid reference was resolved
    status, obs, _ = fhir.get(f"/{did}/Observation/{obs_id}")
    assert status == 200, f"GET Observation/{obs_id} failed ({status}): {obs}"
    assert obs["subject"]["reference"] == f"Patient/{pat_id}", (
        f"urn:uuid reference not resolved: got {obs['subject']['reference']}"
    )


def test_batch_partial_failure(fhir):
    """Good Patient + bad ZZZFake in a batch -> first succeeds, second fails."""
    did = _create_dataset(fhir)
    bundle = _make_bundle("batch", [
        _entry("Patient", {"resourceType": "Patient", "name": [{"family": "Good"}]}),
        _entry("ZZZFake", {"resourceType": "ZZZFake"}),
    ])
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200
    assert body["type"] == "batch-response"
    assert "201" in body["entry"][0]["response"]["status"]
    assert "400" in body["entry"][1]["response"]["status"]


def test_bundle_unsupported_type(fhir):
    did = _create_dataset(fhir)
    status, body, _ = fhir.post(f"/{did}", _make_bundle("document", []))
    assert status == 400


def test_bundle_not_a_bundle(fhir):
    did = _create_dataset(fhir)
    status, body, _ = fhir.post(f"/{did}", {"resourceType": "Patient"})
    assert status == 400


def test_transaction_put_resources_reachable_via_get(fhir):
    """PUT entries in a transaction bundle must be retrievable via GET by their request URL ID."""
    did = _create_dataset(fhir)
    bundle = _make_bundle("transaction", [
        {
            "resource": {"resourceType": "Patient", "name": [{"family": "BundlePut"}]},
            "request": {"method": "PUT", "url": "Patient/bp-pat-001"},
        },
        {
            "resource": {
                "resourceType": "Observation",
                "status": "final",
                "code": {"text": "test"},
                "subject": {"reference": "Patient/bp-pat-001"},
            },
            "request": {"method": "PUT", "url": "Observation/bp-obs-001"},
        },
    ])
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200, f"transaction failed: {body}"
    assert len(body["entry"]) == 2
    # First PUT of a new resource should be 201 Created
    assert "201" in body["entry"][0]["response"]["status"]
    assert "201" in body["entry"][1]["response"]["status"]

    # GET each resource by the ID from request.url
    status, patient, _ = fhir.get(f"/{did}/Patient/bp-pat-001")
    assert status == 200, f"GET Patient/bp-pat-001 failed ({status}): {patient}"
    assert patient["id"] == "bp-pat-001"
    assert patient["name"][0]["family"] == "BundlePut"
    assert patient["meta"]["versionId"] == "1"

    status, obs, _ = fhir.get(f"/{did}/Observation/bp-obs-001")
    assert status == 200, f"GET Observation/bp-obs-001 failed ({status}): {obs}"
    assert obs["id"] == "bp-obs-001"
    assert obs["subject"]["reference"] == "Patient/bp-pat-001"

    # PUT the patient again via bundle — should increment version
    bundle2 = _make_bundle("transaction", [
        {
            "resource": {"resourceType": "Patient", "name": [{"family": "BundlePutV2"}]},
            "request": {"method": "PUT", "url": "Patient/bp-pat-001"},
        },
    ])
    status, body2, _ = fhir.post(f"/{did}", bundle2)
    assert status == 200, f"second transaction failed: {body2}"
    assert "200" in body2["entry"][0]["response"]["status"]
    assert '"2"' in body2["entry"][0]["response"]["etag"]

    # Verify version incremented
    status, patient2, _ = fhir.get(f"/{did}/Patient/bp-pat-001")
    assert status == 200
    assert patient2["meta"]["versionId"] == "2"
    assert patient2["name"][0]["family"] == "BundlePutV2"

    # Verify history has version 1
    status, hist, _ = fhir.get(f"/{did}/Patient/bp-pat-001/_history")
    assert status == 200
    assert hist["total"] == 2


def test_transaction_put_conditional_url_reachable_via_get(fhir):
    """PUT entries with conditional URLs (Patient?identifier=xxx) use resource.id for storage."""
    did = _create_dataset(fhir)
    patient_id = "79dbcd3d-eb5f-4f3d-b7e1-7a73b77f26e7"
    obs_id = "019b02f3-fea0-c489-b20d-a4904a80e613"
    bundle = _make_bundle("transaction", [
        {
            "resource": {
                "resourceType": "Patient",
                "id": patient_id,
                "name": [{"use": "anonymous", "given": [patient_id]}],
            },
            "request": {
                "method": "PUT",
                "url": f"Patient?identifier={patient_id}",
            },
        },
        {
            "resource": {
                "resourceType": "Observation",
                "id": obs_id,
                "status": "final",
                "code": {"text": "test"},
                "subject": {"reference": f"Patient/{patient_id}"},
            },
            "request": {
                "method": "PUT",
                "url": f"Observation?identifier={obs_id}",
            },
        },
    ])
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200, f"transaction failed: {body}"
    assert len(body["entry"]) == 2
    # First PUT of new resources should be 201 Created
    assert "201" in body["entry"][0]["response"]["status"]
    assert "201" in body["entry"][1]["response"]["status"]

    # GET each resource by resource.id (since conditional URLs fall back to it)
    status, patient, _ = fhir.get(f"/{did}/Patient/{patient_id}")
    assert status == 200, f"GET Patient/{patient_id} failed ({status}): {patient}"
    assert patient["id"] == patient_id

    status, obs, _ = fhir.get(f"/{did}/Observation/{obs_id}")
    assert status == 200, f"GET Observation/{obs_id} failed ({status}): {obs}"
    assert obs["id"] == obs_id
    assert obs["subject"]["reference"] == f"Patient/{patient_id}"


def test_transaction_put_nested_bundle_resource(fhir):
    """PUT entries containing nested Bundle-type resources (document bundles)."""
    did = _create_dataset(fhir)
    bundle = _make_bundle("transaction", [
        {
            "resource": {
                "resourceType": "Patient",
                "id": "pat-nested-test",
                "name": [{"family": "Nested"}],
            },
            "request": {"method": "PUT", "url": "Patient/pat-nested-test"},
        },
        {
            "resource": {
                "resourceType": "ResearchSubject",
                "id": "rs-001",
                "status": "active",
                "individual": {"reference": "Patient/pat-nested-test"},
            },
            "request": {
                "method": "PUT",
                "url": "ResearchSubject?identifier=rs-001",
            },
        },
        {
            "resource": {
                "resourceType": "Observation",
                "id": "obs-score-001",
                "status": "final",
                "code": {"coding": [{"system": "http://example.com", "code": "score"}]},
                "subject": {"reference": "Patient/pat-nested-test"},
                "valueQuantity": {"value": 29},
            },
            "request": {
                "method": "PUT",
                "url": "Observation?identifier=obs-score-001",
            },
        },
        {
            "resource": {
                "resourceType": "QuestionnaireResponse",
                "id": "qr-001",
                "status": "completed",
                "subject": {"reference": "Patient/pat-nested-test"},
                "authored": "2025-12-07T11:58:43Z",
                "item": [{"linkId": "q1", "text": "Q1", "answer": [{"valueDate": "2025-12-09"}]}],
            },
            "request": {
                "method": "PUT",
                "url": "QuestionnaireResponse?identifier=qr-001",
            },
        },
        {
            "resource": {
                "id": "doc-bundle-001",
                "resourceType": "Bundle",
                "type": "document",
                "timestamp": "2025-12-09T11:51:43.522Z",
                "entry": [
                    {
                        "fullUrl": "urn:uuid:comp-1",
                        "resource": {
                            "resourceType": "Composition",
                            "status": "final",
                            "type": {"coding": [{"system": "http://loinc.org", "code": "51855-5"}]},
                            "subject": {"reference": "Patient/pat-nested-test"},
                            "date": "2025-12-09T11:51:43.522Z",
                            "author": [{"display": "unknown"}],
                            "title": "Test recording",
                        },
                    },
                ],
            },
            "request": {
                "method": "PUT",
                "url": "Bundle?identifier=doc-bundle-001",
            },
        },
        {
            "resource": {
                "id": "comm-001",
                "resourceType": "Communication",
                "status": "completed",
                "subject": {"reference": "Patient/pat-nested-test"},
                "sent": "2025-12-07T08:00:00Z",
                "payload": [{"contentAttachment": {"contentType": "text/plain", "data": "dGVzdA=="}}],
            },
            "request": {
                "method": "PUT",
                "url": "Communication?identifier=comm-001",
            },
        },
    ])
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200, f"transaction failed ({status}): {body}"
    assert len(body["entry"]) == 6
    # All should succeed
    for i, entry in enumerate(body["entry"]):
        resp_status = entry["response"]["status"]
        assert "200" in resp_status or "201" in resp_status, (
            f"entry {i} failed: {resp_status}"
        )

    # Verify key resources are GET-reachable
    status, pat, _ = fhir.get(f"/{did}/Patient/pat-nested-test")
    assert status == 200, f"GET Patient failed ({status}): {pat}"

    status, obs, _ = fhir.get(f"/{did}/Observation/obs-score-001")
    assert status == 200, f"GET Observation failed ({status}): {obs}"


def test_transaction_delete_via_bundle(fhir):
    """DELETE entry in a transaction bundle uses the ID from request.url."""
    did = _create_dataset(fhir)
    # First create a resource via PUT bundle
    bundle = _make_bundle("transaction", [
        {
            "resource": {"resourceType": "Patient", "name": [{"family": "ToDelete"}]},
            "request": {"method": "PUT", "url": "Patient/bp-del-001"},
        },
    ])
    status, _, _ = fhir.post(f"/{did}", bundle)
    assert status == 200

    # Verify it exists
    status, _, _ = fhir.get(f"/{did}/Patient/bp-del-001")
    assert status == 200

    # Delete via bundle
    del_bundle = _make_bundle("transaction", [
        {
            "resource": {"resourceType": "Patient"},
            "request": {"method": "DELETE", "url": "Patient/bp-del-001"},
        },
    ])
    status, body, _ = fhir.post(f"/{did}", del_bundle)
    assert status == 200
    assert "204" in body["entry"][0]["response"]["status"]

    # Verify it's gone
    status, _, _ = fhir.get(f"/{did}/Patient/bp-del-001")
    assert status == 410


def test_transaction_delete_via_bundle_history(fhir):
    """DELETE via bundle must write history so the create+delete lifecycle is tracked."""
    did = _create_dataset(fhir)
    # 1. Create a Patient via PUT bundle
    bundle = _make_bundle("transaction", [
        {
            "resource": {"resourceType": "Patient", "name": [{"family": "HistDel"}]},
            "request": {"method": "PUT", "url": "Patient/hist-del-001"},
        },
    ])
    status, _, _ = fhir.post(f"/{did}", bundle)
    assert status == 200

    # 2. Delete via bundle
    del_bundle = _make_bundle("transaction", [
        {
            "resource": {"resourceType": "Patient"},
            "request": {"method": "DELETE", "url": "Patient/hist-del-001"},
        },
    ])
    status, body, _ = fhir.post(f"/{did}", del_bundle)
    assert status == 200
    assert "204" in body["entry"][0]["response"]["status"]

    # 3. History must have entries for both the create and delete
    status, hist, _ = fhir.get(f"/{did}/Patient/hist-del-001/_history")
    assert status == 200
    assert hist["total"] >= 2, (
        f"Expected at least 2 history entries (create + delete), got {hist['total']}"
    )
    methods = [e["request"]["method"] for e in hist["entry"]]
    assert "DELETE" in methods, f"DELETE not found in history methods: {methods}"


def test_large_bundle_all_resources_ingested(fhir):
    """Load curl-bundle.json (19 entries, 6 resource types) and verify every resource is persisted."""
    bundle_path = os.path.join(os.path.dirname(__file__), "fixtures", "transaction-bundle-19.json")
    with open(bundle_path) as f:
        bundle = json.load(f)

    did = _create_dataset(fhir)
    status, body, _ = fhir.post(f"/{did}", bundle)
    assert status == 200, f"transaction failed ({status}): {body}"
    assert body["type"] == "transaction-response"
    assert len(body["entry"]) == len(bundle["entry"])

    # All entries should succeed (201 Created or 200 OK for upserts)
    for i, entry in enumerate(body["entry"]):
        resp_status = entry["response"]["status"]
        assert "200" in resp_status or "201" in resp_status, (
            f"entry {i} ({bundle['entry'][i]['resource']['resourceType']}) "
            f"failed: {resp_status}"
        )

    # Build expected resource map: {resourceType: [id, ...]}
    from collections import defaultdict
    expected = defaultdict(list)
    for e in bundle["entry"]:
        rt = e["resource"]["resourceType"]
        rid = e["resource"].get("id")
        if rid:
            expected[rt].append(rid)

    # Build a lookup of posted resources for content verification
    posted = {}
    for e in bundle["entry"]:
        r = e["resource"]
        posted[(r["resourceType"], r.get("id"))] = r

    # GET each resource individually to verify it was persisted with correct content
    for resource_type, ids in expected.items():
        for rid in ids:
            status, res, _ = fhir.get(f"/{did}/{resource_type}/{rid}")
            assert status == 200, (
                f"GET {resource_type}/{rid} failed ({status}): {res}"
            )
            assert res["resourceType"] == resource_type
            assert res["id"] == rid

            # Verify key fields from the original posted resource are preserved
            original = posted.get((resource_type, rid))
            if original:
                for key in ("status", "name", "gender", "code", "subject"):
                    if key in original:
                        assert res.get(key) == original[key], (
                            f"{resource_type}/{rid} field '{key}' mismatch: "
                            f"expected {original[key]}, got {res.get(key)}"
                        )

    # Verify search counts match for each resource type
    for resource_type, ids in expected.items():
        status, search_body, _ = fhir.get(f"/{did}/{resource_type}?_count=100")
        assert status == 200, (
            f"Search {resource_type} failed ({status}): {search_body}"
        )
        assert search_body["total"] >= len(ids), (
            f"{resource_type}: expected at least {len(ids)}, "
            f"got {search_body['total']}"
        )


# ===================================================================
# HISTORY
# ===================================================================

def test_history_after_update(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did, family="V1")
    pid = created["id"]

    fhir.put(f"/{did}/Patient/{pid}", {
        "resourceType": "Patient", "id": pid,
        "name": [{"family": "V2"}],
    })

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}/_history")
    assert status == 200
    assert body["resourceType"] == "Bundle"
    assert body["type"] == "history"
    assert body["total"] == 2  # current v2 + history v1


def test_history_after_delete(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did, family="DelHist")
    pid = created["id"]
    fhir.delete(f"/{did}/Patient/{pid}")

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}/_history")
    assert status == 200
    assert body["total"] >= 2
    assert body["entry"][0]["request"]["method"] == "DELETE"


def test_read_specific_version(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did, family="VerA")
    pid = created["id"]

    fhir.put(f"/{did}/Patient/{pid}", {
        "resourceType": "Patient", "id": pid,
        "name": [{"family": "VerB"}],
    })

    # version 1 should still have the original name
    status, body, _ = fhir.get(f"/{did}/Patient/{pid}/_history/1")
    assert status == 200
    assert body["name"][0]["family"] == "VerA"


def test_read_nonexistent_version(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did, family="NoVer")
    pid = created["id"]

    status, _, _ = fhir.get(f"/{did}/Patient/{pid}/_history/999")
    assert status == 404


# ===================================================================
# METADATA
# ===================================================================

def test_capability_statement(fhir):
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/metadata")
    assert status == 200
    assert body["resourceType"] == "CapabilityStatement"
    assert body["fhirVersion"] == "4.0.1"
    assert "json" in body["format"]


def test_capability_has_patient(fhir):
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
    status, _, _ = fhir.get("/nonexistent-ds-xyz/metadata")
    assert status == 404


# ===================================================================
# ERROR CASES
# ===================================================================

def test_404_operation_outcome(fhir):
    did = _create_dataset(fhir)
    status, body, _ = fhir.get(f"/{did}/Patient/does-not-exist")
    assert status == 404
    assert body["resourceType"] == "OperationOutcome"
    assert body["issue"][0]["severity"] == "error"
    assert body["issue"][0]["code"] == "not-found"


def test_400_operation_outcome(fhir):
    """Missing resourceType triggers validation -> 400 OperationOutcome."""
    did = _create_dataset(fhir)
    status, body, _ = fhir.post(f"/{did}/Patient", {"no_rt": True})
    assert status == 400
    assert body["resourceType"] == "OperationOutcome"


def test_410_operation_outcome(fhir):
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]
    fhir.delete(f"/{did}/Patient/{pid}")

    status, body, _ = fhir.get(f"/{did}/Patient/{pid}")
    assert status == 410
    assert body["resourceType"] == "OperationOutcome"
    assert body["issue"][0]["code"] == "deleted"


def test_invalid_json_returns_error(fhir):
    did = _create_dataset(fhir)
    status, _, _ = fhir.post_raw(f"/{did}/Patient", b"not valid json{{{")
    assert status in (400, 422)


def test_fhir_content_type(fhir):
    """FHIR dataset-scoped endpoints return application/fhir+json."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]
    _, _, hdrs = fhir.get(f"/{did}/Patient/{pid}")
    ct = hdrs.get("content-type", "")
    assert "fhir+json" in ct


def test_health_content_type(fhir):
    """Health endpoint returns plain application/json (not fhir+json)."""
    _, _, hdrs = fhir.get("/health")
    ct = hdrs.get("content-type", "")
    assert "application/json" in ct
    assert "fhir" not in ct


def test_version_conflict(fhir):
    """If-Match with stale version -> 409 Conflict."""
    did = _create_dataset(fhir)
    _, created, _ = _create_patient(fhir, did)
    pid = created["id"]

    status, _, _ = fhir.put(
        f"/{did}/Patient/{pid}",
        {"resourceType": "Patient", "id": pid, "name": [{"family": "Conflict"}]},
        headers={"If-Match": 'W/"999"'},
    )
    assert status == 409


# ===================================================================
# $IMPORT (NDJSON)
# ===================================================================

def test_import_ndjson_mixed_types(fhir):
    """POST NDJSON with Patient + Observation, verify success counts and GET."""
    did = _create_dataset(fhir)
    patient_id = str(uuid.uuid4())
    obs_id = str(uuid.uuid4())
    ndjson = "\n".join([
        json.dumps({"resourceType": "Patient", "id": patient_id, "name": [{"family": "Import"}], "gender": "female"}),
        json.dumps({"resourceType": "Observation", "id": obs_id, "status": "final", "code": {"text": "bp"}, "subject": {"reference": f"Patient/{patient_id}"}}),
    ])
    status, body, _ = fhir.post_raw(f"/{did}/$import", ndjson.encode("utf-8"), content_type="application/x-ndjson")
    assert status == 200, f"$import failed ({status}): {body}"
    assert body["outcome"] == "complete"
    assert body["total"]["success"] == 2
    assert body["total"]["errors"] == 0
    assert body["success"]["Patient"] == 1
    assert body["success"]["Observation"] == 1

    # Verify resources are retrievable
    status, patient, _ = fhir.get(f"/{did}/Patient/{patient_id}")
    assert status == 200, f"GET Patient failed ({status}): {patient}"
    assert patient["id"] == patient_id
    assert patient["name"][0]["family"] == "Import"

    status, obs, _ = fhir.get(f"/{did}/Observation/{obs_id}")
    assert status == 200, f"GET Observation failed ({status}): {obs}"
    assert obs["id"] == obs_id


def test_import_ndjson_error_handling(fhir):
    """NDJSON with bad lines: invalid JSON, missing resourceType, unknown type."""
    did = _create_dataset(fhir)
    ndjson = "\n".join([
        json.dumps({"resourceType": "Patient", "id": "good-1", "name": [{"family": "Good"}]}),
        "not valid json{{{",
        json.dumps({"id": "no-rt"}),
        json.dumps({"resourceType": "ZZZFake", "id": "fake-1"}),
        json.dumps({"resourceType": "Patient", "id": "good-2", "name": [{"family": "Also Good"}]}),
    ])
    status, body, _ = fhir.post_raw(f"/{did}/$import", ndjson.encode("utf-8"), content_type="application/x-ndjson")
    assert status == 200, f"$import failed ({status}): {body}"
    assert body["outcome"] == "complete"
    assert body["total"]["success"] == 2
    assert body["total"]["errors"] == 3
    assert body["success"]["Patient"] == 2
    assert body["errors"]["_parse"] == 2  # invalid JSON + missing resourceType
    assert body["errors"]["ZZZFake"] == 1
    assert len(body["errorDetails"]) == 3

    # Verify the good resources exist
    status, _, _ = fhir.get(f"/{did}/Patient/good-1")
    assert status == 200
    status, _, _ = fhir.get(f"/{did}/Patient/good-2")
    assert status == 200


def test_import_ndjson_generates_id(fhir):
    """Resources without id get a generated UUID."""
    did = _create_dataset(fhir)
    ndjson = json.dumps({"resourceType": "Patient", "name": [{"family": "NoId"}]})
    status, body, _ = fhir.post_raw(f"/{did}/$import", ndjson.encode("utf-8"), content_type="application/x-ndjson")
    assert status == 200
    assert body["total"]["success"] == 1

    # Search for the patient to verify it was stored
    status, search, _ = fhir.get(f"/{did}/Patient?family=NoId")
    assert status == 200
    assert search["total"] == 1


def test_import_ndjson_upsert(fhir):
    """Importing the same resource twice should upsert (not duplicate)."""
    did = _create_dataset(fhir)
    pid = str(uuid.uuid4())
    ndjson = json.dumps({"resourceType": "Patient", "id": pid, "name": [{"family": "First"}]})

    status, _, _ = fhir.post_raw(f"/{did}/$import", ndjson.encode("utf-8"), content_type="application/x-ndjson")
    assert status == 200

    # Import again with updated name
    ndjson2 = json.dumps({"resourceType": "Patient", "id": pid, "name": [{"family": "Second"}]})
    status, body, _ = fhir.post_raw(f"/{did}/$import", ndjson2.encode("utf-8"), content_type="application/x-ndjson")
    assert status == 200
    assert body["total"]["success"] == 1

    # Verify latest version has versionId 2
    status, patient, _ = fhir.get(f"/{did}/Patient/{pid}")
    assert status == 200
    assert patient["name"][0]["family"] == "Second"
    assert patient["meta"]["versionId"] == "2", f"expected versionId 2, got {patient['meta']['versionId']}"

    # Verify history contains version 1
    status, hist, _ = fhir.get(f"/{did}/Patient/{pid}/_history")
    assert status == 200
    assert hist["total"] == 2, f"expected 2 history entries, got {hist['total']}"
    # Find the version 1 entry in history
    v1_entries = [e for e in hist["entry"] if e["resource"]["meta"]["versionId"] == "1"]
    assert len(v1_entries) == 1, "version 1 should be in history"
    assert v1_entries[0]["resource"]["name"][0]["family"] == "First"


def test_import_ndjson_nonexistent_dataset(fhir):
    """$import to a non-existent dataset returns 404."""
    ndjson = json.dumps({"resourceType": "Patient", "id": "x", "name": [{"family": "X"}]})
    status, body, _ = fhir.post_raw("/nonexistent-ds-xyz/$import", ndjson.encode("utf-8"), content_type="application/x-ndjson")
    assert status == 404
    assert body["resourceType"] == "OperationOutcome"


def test_import_ndjson_invalid_id(fhir):
    """Resources with invalid FHIR ids are rejected per-line."""
    did = _create_dataset(fhir)
    ndjson = "\n".join([
        json.dumps({"resourceType": "Patient", "id": "valid-id", "name": [{"family": "OK"}]}),
        json.dumps({"resourceType": "Patient", "id": "bad;id!", "name": [{"family": "Bad"}]}),
    ])
    status, body, _ = fhir.post_raw(f"/{did}/$import", ndjson.encode("utf-8"), content_type="application/x-ndjson")
    assert status == 200
    assert body["total"]["success"] == 1
    assert body["total"]["errors"] == 1
    assert len(body["errorDetails"]) == 1
    assert "invalid" in body["errorDetails"][0]["error"].lower()
