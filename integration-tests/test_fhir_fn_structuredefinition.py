"""Integration tests for the StructureDefinition HTTP endpoints on fhir-fn.

These tests exercise the two new registry-only routes added in Milestone 0:

  GET /{dataset}/StructureDefinition        → list all resource types
  GET /{dataset}/StructureDefinition/{type} → fetch one parsed definition

No DB connection is required server-side for these routes; a dataset id is
still required in the path to satisfy the router, but the handler does not
validate that the dataset actually exists in the database.

Environment variables (same as test_fhir_fn.py):

  FHIR_FN_BASE_URL  — defaults to http://127.0.0.1:8001/plugins/trex/fhir
  FHIR_FN_APIKEY    — service-role API key; skip entire module when absent

Run:
    FHIR_FN_BASE_URL=http://... FHIR_FN_APIKEY=<key> pytest \\
        integration-tests/test_fhir_fn_structuredefinition.py -v
"""

import os
import time
import uuid

import pytest

# ---------------------------------------------------------------------------
# Re-use FhirClient from the main fhir-fn test module (or inline fallback).
# ---------------------------------------------------------------------------

try:
    from test_fhir_fn import FhirClient  # type: ignore
except ImportError:
    import json as _json
    import urllib.request
    import urllib.error

    class FhirClient:  # type: ignore[no-redef]
        """Minimal HTTP client for FHIR API testing (stdlib only), with apikey auth."""

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _uid() -> str:
    """Short unique dataset id safe for FHIR dataset names."""
    return f"t-{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Module-scoped fixture (mirrors test_fhir_fn.py)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def fhir():
    """Resolve env vars, poll /health, and yield an authenticated FhirClient.

    Skips the entire module when ``FHIR_FN_APIKEY`` is not set so the suite is
    safe to include in CI without breaking builds that don't have a running runtime.
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


# ---------------------------------------------------------------------------
# StructureDefinition list
# ---------------------------------------------------------------------------

def test_structure_definition_list_returns_200(fhir):
    """GET /{dataset}/StructureDefinition returns 200."""
    ds = _uid()
    status, body, _ = fhir.get(f"/{ds}/StructureDefinition")
    assert status == 200, f"expected 200, got {status}: {body}"


def test_structure_definition_list_contains_patient(fhir):
    """GET /{dataset}/StructureDefinition returns 'Patient' in resourceTypes."""
    ds = _uid()
    status, body, _ = fhir.get(f"/{ds}/StructureDefinition")
    assert status == 200, f"expected 200, got {status}: {body}"
    assert isinstance(body.get("resourceTypes"), list), f"missing resourceTypes array: {body}"
    assert "Patient" in body["resourceTypes"], (
        f"'Patient' not found in resourceTypes: {body['resourceTypes'][:10]}"
    )


# ---------------------------------------------------------------------------
# StructureDefinition read
# ---------------------------------------------------------------------------

def test_structure_definition_read_patient_returns_200(fhir):
    """GET /{dataset}/StructureDefinition/Patient returns 200."""
    ds = _uid()
    status, body, _ = fhir.get(f"/{ds}/StructureDefinition/Patient")
    assert status == 200, f"expected 200, got {status}: {body}"


def test_structure_definition_read_patient_resource_type(fhir):
    """GET /{dataset}/StructureDefinition/Patient body has resourceType == 'Patient'."""
    ds = _uid()
    status, body, _ = fhir.get(f"/{ds}/StructureDefinition/Patient")
    assert status == 200, f"expected 200, got {status}: {body}"
    assert body.get("resourceType") == "Patient", (
        f"expected resourceType='Patient', got: {body.get('resourceType')}"
    )


def test_structure_definition_read_patient_has_gender_element(fhir):
    """GET /{dataset}/StructureDefinition/Patient body has an element named 'gender'."""
    ds = _uid()
    status, body, _ = fhir.get(f"/{ds}/StructureDefinition/Patient")
    assert status == 200, f"expected 200, got {status}: {body}"
    elements = body.get("elements", [])
    names = [e.get("name") for e in elements]
    assert "gender" in names, f"'gender' element not found; element names: {names}"


# ---------------------------------------------------------------------------
# StructureDefinition read — not found
# ---------------------------------------------------------------------------

def test_structure_definition_read_unknown_type_returns_404(fhir):
    """GET /{dataset}/StructureDefinition/NotAType returns 404."""
    ds = _uid()
    status, body, _ = fhir.get(f"/{ds}/StructureDefinition/NotAType")
    assert status == 404, f"expected 404, got {status}: {body}"
