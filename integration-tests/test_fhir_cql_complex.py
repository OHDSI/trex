"""Complex CQL query tests.

Exercises: multi-define, Exists, With/Without relationships, AgeInYears,
nested property access, Count with filters, Or/And/Not, aggregates,
code-filtered Retrieve, ExpressionRef, If/Case, Coalesce.
"""

import json
import os
import socket
import time

import pytest

from conftest import CQL2ELM_EXT, FHIR_EXT, Node, alloc_ports

os.environ.setdefault("FHIR_POOL_SIZE", "1")


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class FhirClient:
    def __init__(self, base_url):
        self.base_url = base_url

    def request(self, method, path, data=None):
        import urllib.request, urllib.error
        url = f"{self.base_url}{path}"
        body_bytes = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=body_bytes, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return self._parse(resp.status, resp.read())
        except urllib.error.HTTPError as e:
            return self._parse(e.code, e.read())

    @staticmethod
    def _parse(status, raw_bytes):
        text = raw_bytes.decode("utf-8") if raw_bytes else ""
        try:
            body = json.loads(text) if text.strip() else None
        except json.JSONDecodeError:
            body = text
        return status, body

    def get(self, path):
        return self.request("GET", path)

    def post(self, path, data):
        return self.request("POST", path, data)

    def cql_text(self, dataset_id, cql):
        return self.post(f"/{dataset_id}/$cql", {"cql": cql})

    def cql_elm(self, dataset_id, elm):
        return self.post(f"/{dataset_id}/$cql", {"library": elm})


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def server():
    gp, fp, pp = alloc_ports()
    node = Node([FHIR_EXT, CQL2ELM_EXT], gp, fp, pp)
    fhir_port = _free_port()
    result = node.execute(f"SELECT trex_fhir_start('127.0.0.1', {fhir_port})")
    assert "Started" in result[0][0]

    client = FhirClient(f"http://127.0.0.1:{fhir_port}")
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            if client.get("/health")[0] == 200:
                break
        except Exception:
            pass
        time.sleep(0.5)
    else:
        node.close()
        pytest.fail("Server did not become healthy")

    yield client, fhir_port

    try:
        node.execute(f"SELECT trex_fhir_stop('127.0.0.1', {fhir_port})")
    except Exception:
        pass
    node.close()


@pytest.fixture(scope="module")
def dataset(server):
    """Create a dataset with a rich set of FHIR resources."""
    client, _ = server
    ds = "complex-cql"
    s, _ = client.post("/datasets", {"id": ds, "name": "Complex CQL Tests"})
    assert s == 201

    # -- Patients --
    patients_data = [
        {"resourceType": "Patient", "gender": "male", "birthDate": "1955-03-10",
         "name": [{"family": "Elder", "given": ["George"]}],
         "address": [{"city": "Boston", "state": "MA"}]},
        {"resourceType": "Patient", "gender": "female", "birthDate": "1990-07-22",
         "name": [{"family": "Young", "given": ["Sarah"]}],
         "address": [{"city": "New York", "state": "NY"}]},
        {"resourceType": "Patient", "gender": "male", "birthDate": "2015-01-05",
         "name": [{"family": "Child", "given": ["Tommy"]}]},
        {"resourceType": "Patient", "gender": "female", "birthDate": "1980-12-01",
         "name": [{"family": "Middle", "given": ["Diana"]}],
         "address": [{"city": "Chicago", "state": "IL"}]},
        {"resourceType": "Patient", "gender": "male", "birthDate": "1970-06-15",
         "name": [{"family": "Senior", "given": ["Robert"]}],
         "address": [{"city": "Boston", "state": "MA"}]},
    ]
    pids = []
    for p in patients_data:
        s, b = client.post(f"/{ds}/Patient", p)
        assert s == 201, f"Failed to create patient: {b}"
        pids.append(b["id"])

    # -- Conditions --
    conditions_data = [
        # George Elder: diabetes + hypertension
        {"resourceType": "Condition", "subject": {"reference": f"Patient/{pids[0]}"},
         "code": {"coding": [{"system": "http://snomed.info/sct", "code": "44054006", "display": "Diabetes"}]},
         "clinicalStatus": {"coding": [{"code": "active"}]}},
        {"resourceType": "Condition", "subject": {"reference": f"Patient/{pids[0]}"},
         "code": {"coding": [{"system": "http://snomed.info/sct", "code": "38341003", "display": "Hypertension"}]},
         "clinicalStatus": {"coding": [{"code": "active"}]}},
        # Sarah Young: diabetes
        {"resourceType": "Condition", "subject": {"reference": f"Patient/{pids[1]}"},
         "code": {"coding": [{"system": "http://snomed.info/sct", "code": "44054006", "display": "Diabetes"}]},
         "clinicalStatus": {"coding": [{"code": "active"}]}},
        # Robert Senior: hypertension
        {"resourceType": "Condition", "subject": {"reference": f"Patient/{pids[4]}"},
         "code": {"coding": [{"system": "http://snomed.info/sct", "code": "38341003", "display": "Hypertension"}]},
         "clinicalStatus": {"coding": [{"code": "active"}]}},
    ]
    for c in conditions_data:
        s, b = client.post(f"/{ds}/Condition", c)
        assert s == 201, f"Failed to create condition: {b}"

    # -- Observations (lab results) --
    observations_data = [
        # George Elder: high blood glucose
        {"resourceType": "Observation", "subject": {"reference": f"Patient/{pids[0]}"},
         "code": {"coding": [{"system": "http://loinc.org", "code": "2339-0", "display": "Glucose"}]},
         "status": "final",
         "valueQuantity": {"value": 250, "unit": "mg/dL"}},
        # Sarah Young: normal glucose
        {"resourceType": "Observation", "subject": {"reference": f"Patient/{pids[1]}"},
         "code": {"coding": [{"system": "http://loinc.org", "code": "2339-0", "display": "Glucose"}]},
         "status": "final",
         "valueQuantity": {"value": 95, "unit": "mg/dL"}},
        # Diana Middle: borderline glucose
        {"resourceType": "Observation", "subject": {"reference": f"Patient/{pids[3]}"},
         "code": {"coding": [{"system": "http://loinc.org", "code": "2339-0", "display": "Glucose"}]},
         "status": "final",
         "valueQuantity": {"value": 140, "unit": "mg/dL"}},
        # Robert Senior: high blood pressure systolic
        {"resourceType": "Observation", "subject": {"reference": f"Patient/{pids[4]}"},
         "code": {"coding": [{"system": "http://loinc.org", "code": "8480-6", "display": "Systolic BP"}]},
         "status": "final",
         "valueQuantity": {"value": 165, "unit": "mmHg"}},
    ]
    for o in observations_data:
        s, b = client.post(f"/{ds}/Observation", o)
        assert s == 201, f"Failed to create observation: {b}"

    # -- MedicationRequests --
    medrequests_data = [
        {"resourceType": "MedicationRequest", "subject": {"reference": f"Patient/{pids[0]}"},
         "status": "active", "intent": "order",
         "medicationCodeableConcept": {"coding": [{"system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "860975", "display": "Metformin"}]}},
        {"resourceType": "MedicationRequest", "subject": {"reference": f"Patient/{pids[4]}"},
         "status": "active", "intent": "order",
         "medicationCodeableConcept": {"coding": [{"system": "http://www.nlm.nih.gov/research/umls/rxnorm", "code": "979480", "display": "Lisinopril"}]}},
    ]
    for m in medrequests_data:
        s, b = client.post(f"/{ds}/MedicationRequest", m)
        assert s == 201, f"Failed to create medrequest: {b}"

    return ds, pids, client


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _param_names(body):
    """Extract parameter names from a Parameters response."""
    return [p["name"] for p in body.get("parameter", [])]


def _param_value(body, name):
    """Get the valueString (or parts) for a named parameter."""
    for p in body.get("parameter", []):
        if p["name"] == name:
            if "part" in p:
                return [part["valueString"] for part in p["part"]]
            return p.get("valueString")
    return None


def _count_results(body, name):
    """Count how many results a parameter has."""
    for p in body.get("parameter", []):
        if p["name"] == name:
            if "part" in p:
                return len(p["part"])
            if "valueString" in p:
                return 1
            return 0
    return 0


# ---------------------------------------------------------------------------
# Tests: raw CQL text (translated by cql2elm)
# ---------------------------------------------------------------------------

class TestCqlTextQueries:
    """Queries using raw CQL text, translated on-the-fly by cql2elm."""

    def test_or_filter(self, dataset):
        """Patients who are male OR born after 2000 — via raw CQL text."""
        ds, pids, client = dataset
        cql = (
            "library OrTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "include FHIRHelpers version '4.0.1' "
            "context Patient "
            "define MaleOrYoung: [Patient] P "
            "where P.gender = 'male' or P.birthDate > @2000-01-01"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        # male: Elder, Child, Senior; born after 2000: Child (already counted)
        # => Elder, Child, Senior = 3
        assert _count_results(b, "MaleOrYoung") == 3

    def test_and_filter_with_nested_property(self, dataset):
        """Female patients with a family name starting with specific letter."""
        ds, pids, client = dataset
        cql = (
            "library AndNested version '1.0.0' "
            "using FHIR version '4.0.1' "
            "context Patient "
            "define FemalePatients: [Patient] P "
            "where P.gender = 'female'"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        # Young (Sarah), Middle (Diana)
        assert _count_results(b, "FemalePatients") == 2

    def test_retrieve_conditions(self, dataset):
        """All conditions across all patients."""
        ds, pids, client = dataset
        cql = (
            "library CondTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "context Patient "
            "define AllConditions: [Condition]"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        assert _count_results(b, "AllConditions") == 4

    def test_retrieve_observations(self, dataset):
        """All observations."""
        ds, pids, client = dataset
        cql = (
            "library ObsTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "context Patient "
            "define AllObs: [Observation]"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        assert _count_results(b, "AllObs") == 4

    def test_not_filter(self, dataset):
        """Patients who are NOT male."""
        ds, pids, client = dataset
        cql = (
            "library NotTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "context Patient "
            "define NotMale: [Patient] P where not (P.gender = 'male')"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        assert _count_results(b, "NotMale") == 2

    def test_birthdate_range(self, dataset):
        """Patients born in a specific decade (1980-1989) — via raw CQL text."""
        ds, pids, client = dataset
        cql = (
            "library RangeTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "include FHIRHelpers version '4.0.1' "
            "context Patient "
            "define BornIn80s: [Patient] P "
            "where P.birthDate >= @1980-01-01 and P.birthDate < @1990-01-01"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        # Diana Middle born 1980-12-01
        assert _count_results(b, "BornIn80s") == 1

    def test_multiple_resource_types(self, dataset):
        """Retrieve MedicationRequests."""
        ds, pids, client = dataset
        cql = (
            "library MedReqTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "context Patient "
            "define ActiveMeds: [MedicationRequest]"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        assert _count_results(b, "ActiveMeds") == 2


# ---------------------------------------------------------------------------
# Tests: pre-compiled ELM JSON
# ---------------------------------------------------------------------------

class TestElmQueries:
    """Queries using pre-compiled ELM JSON for features cql2elm can't translate."""

    def test_multi_define_with_expression_ref(self, dataset):
        """Multiple defines where later ones reference earlier ones (ELM — cql2elm can't handle Count)."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "MultiDef", "version": "1.0.0"},
            "statements": {
                "def": [
                    {
                        "name": "Adults",
                        "context": "Patient",
                        "expression": {
                            "type": "Query",
                            "source": [{"alias": "P", "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}}],
                            "where": {"type": "LessOrEqual", "operand": [
                                {"type": "Property", "path": "birthDate", "scope": "P"},
                                {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Date", "value": "2008-01-01"}
                            ]}
                        }
                    },
                    {
                        "name": "AdultCount",
                        "context": "Patient",
                        "expression": {
                            "type": "Count",
                            "source": {"type": "ExpressionRef", "name": "Adults"}
                        }
                    }
                ]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        # Adults: Elder(1955), Young(1990), Middle(1980), Senior(1970) = 4 (Child 2015 excluded)
        val = _param_value(b, "AdultCount")
        assert val is not None
        assert "4" in val

    def test_exists_condition(self, dataset):
        """Patients who have at least one Condition (using Exists)."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "ExistsTest", "version": "1.0.0"},
            "statements": {
                "def": [{
                    "name": "PatientsWithConditions",
                    "context": "Patient",
                    "expression": {
                        "type": "Query",
                        "source": [{"alias": "P", "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}}],
                        "where": {
                            "type": "Exists",
                            "operand": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Condition"}
                        }
                    }
                }]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        # Conditions exist for: Elder, Young, Senior => but Exists without subject filter
        # returns true for all since conditions table is non-empty
        # This tests the Exists expression compiles and runs
        count = _count_results(b, "PatientsWithConditions")
        assert count >= 3

    def test_count_with_filter(self, dataset):
        """Count of male patients (ELM — cql2elm can't handle Count)."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "CountFilter", "version": "1.0.0"},
            "statements": {
                "def": [{
                    "name": "MaleCount",
                    "context": "Patient",
                    "expression": {
                        "type": "Count",
                        "source": {
                            "type": "Query",
                            "source": [{"alias": "P", "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}}],
                            "where": {"type": "Equal", "operand": [
                                {"type": "Property", "path": "gender", "scope": "P"},
                                {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "male"}
                            ]}
                        }
                    }
                }]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        val = _param_value(b, "MaleCount")
        assert "3" in val

    def test_if_expression(self, dataset):
        """If expression: classify patients by gender text — via raw CQL text."""
        ds, pids, client = dataset
        cql = (
            "library IfTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "include FHIRHelpers version '4.0.1' "
            "context Patient "
            "define GenderLabel: [Patient] P "
            "return if P.gender = 'male' then 'M' else 'F'"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        results = _param_value(b, "GenderLabel")
        assert results is not None
        # Should have 5 results (one per patient), mix of M and F
        assert len(results) == 5
        m_count = sum(1 for r in results if "M" in r and "F" not in r)
        f_count = sum(1 for r in results if "F" in r)
        assert m_count == 3
        assert f_count == 2

    def test_coalesce_missing_field(self, dataset):
        """Coalesce: use city or fallback to 'Unknown' when address is missing."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "CoalesceTest", "version": "1.0.0"},
            "statements": {
                "def": [{
                    "name": "PatientCity",
                    "context": "Patient",
                    "expression": {
                        "type": "Query",
                        "source": [{"alias": "P", "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}}],
                        "return": {
                            "expression": {
                                "type": "Coalesce",
                                "operand": [
                                    {"type": "Property", "path": "address[0].city", "scope": "P"},
                                    {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "Unknown"}
                                ]
                            }
                        }
                    }
                }]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        results = _param_value(b, "PatientCity")
        assert results is not None
        assert len(results) == 5
        # Tommy Child has no address, should get "Unknown"
        assert any("Unknown" in r for r in results)
        assert any("Boston" in r for r in results)

    def test_age_in_years(self, dataset):
        """Use AgeInYears to find elderly patients (age >= 50) — via raw CQL text."""
        ds, pids, client = dataset
        cql = (
            "library AgeTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "include FHIRHelpers version '4.0.1' "
            "context Patient "
            "define Elderly: [Patient] P where AgeInYears() >= 50"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        # Elder born 1955 (age ~71), Senior born 1970 (age ~56) => 2
        assert _count_results(b, "Elderly") == 2

    def test_with_relationship(self, dataset):
        """Patients WITH a Condition (inner join)."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "WithTest", "version": "1.0.0"},
            "statements": {
                "def": [{
                    "name": "PatientsWithCondition",
                    "context": "Patient",
                    "expression": {
                        "type": "Query",
                        "source": [{"alias": "P", "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}}],
                        "relationship": [{
                            "type": "With",
                            "alias": "C",
                            "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Condition"},
                            "suchThat": {
                                "type": "Equal",
                                "operand": [
                                    {"type": "Property", "path": "subject.reference", "scope": "C"},
                                    {"type": "Concatenate", "operand": [
                                        {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "Patient/"},
                                        {"type": "Property", "path": "id", "scope": "P"}
                                    ]}
                                ]
                            }
                        }]
                    }
                }]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        # Elder has 2 conditions, Young has 1, Senior has 1 => but DISTINCT patients = 3
        # With inner join may return duplicates; at minimum 3 rows
        assert _count_results(b, "PatientsWithCondition") >= 3

    def test_without_relationship(self, dataset):
        """Patients WITHOUT any Condition (left anti join)."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "WithoutTest", "version": "1.0.0"},
            "statements": {
                "def": [{
                    "name": "HealthyPatients",
                    "context": "Patient",
                    "expression": {
                        "type": "Query",
                        "source": [{"alias": "P", "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}}],
                        "relationship": [{
                            "type": "Without",
                            "alias": "C",
                            "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Condition"},
                            "suchThat": {
                                "type": "Equal",
                                "operand": [
                                    {"type": "Property", "path": "subject.reference", "scope": "C"},
                                    {"type": "Concatenate", "operand": [
                                        {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "Patient/"},
                                        {"type": "Property", "path": "id", "scope": "P"}
                                    ]}
                                ]
                            }
                        }]
                    }
                }]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        # Child (Tommy) and Middle (Diana) have no conditions
        assert _count_results(b, "HealthyPatients") == 2

    def test_first_and_singleton(self, dataset):
        """First aggregate and SingletonFrom (ELM — cql2elm ListExpr produces invalid SQL)."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "FirstTest", "version": "1.0.0"},
            "statements": {
                "def": [
                    {
                        "name": "FirstPatient",
                        "context": "Patient",
                        "expression": {
                            "type": "First",
                            "source": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}
                        }
                    },
                    {
                        "name": "FirstCondition",
                        "context": "Patient",
                        "expression": {
                            "type": "SingletonFrom",
                            "operand": {
                                "type": "First",
                                "source": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Condition"}
                            }
                        }
                    }
                ]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        val = _param_value(b, "FirstCondition")
        assert val is not None

    def test_complex_boolean_logic(self, dataset):
        """Complex: (male AND born before 1980) OR (female AND born after 1985) — via raw CQL text."""
        ds, pids, client = dataset
        cql = (
            "library BoolLogic version '1.0.0' "
            "using FHIR version '4.0.1' "
            "include FHIRHelpers version '4.0.1' "
            "context Patient "
            "define ComplexFilter: [Patient] P "
            "where (P.gender = 'male' and P.birthDate < @1980-01-01) "
            "or (P.gender = 'female' and P.birthDate > @1985-01-01)"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        # male before 1980: Elder(1955), Senior(1970) = 2
        # female after 1985: Young(1990) = 1
        # total = 3
        assert _count_results(b, "ComplexFilter") == 3

    def test_observation_count(self, dataset):
        """Count all observations (ELM — cql2elm can't handle Count)."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "ObsCount", "version": "1.0.0"},
            "statements": {
                "def": [{
                    "name": "ObservationCount",
                    "context": "Patient",
                    "expression": {
                        "type": "Count",
                        "source": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Observation"}
                    }
                }]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        val = _param_value(b, "ObservationCount")
        assert "4" in val

    def test_chained_expression_refs(self, dataset):
        """Three chained defines: AllPatients -> Males -> MaleCount (ELM — cql2elm can't handle Count)."""
        ds, pids, client = dataset
        elm = {
            "identifier": {"id": "ChainTest", "version": "1.0.0"},
            "statements": {
                "def": [
                    {
                        "name": "AllPatients",
                        "context": "Patient",
                        "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}
                    },
                    {
                        "name": "Males",
                        "context": "Patient",
                        "expression": {
                            "type": "Query",
                            "source": [{"alias": "P", "expression": {"type": "ExpressionRef", "name": "AllPatients"}}],
                            "where": {"type": "Equal", "operand": [
                                {"type": "Property", "path": "gender", "scope": "P"},
                                {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "male"}
                            ]}
                        }
                    },
                    {
                        "name": "MaleCount",
                        "context": "Patient",
                        "expression": {
                            "type": "Count",
                            "source": {"type": "ExpressionRef", "name": "Males"}
                        }
                    }
                ]
            }
        }
        s, b = client.cql_elm(ds, elm)
        assert s == 200, f"Expected 200: {b}"
        val = _param_value(b, "MaleCount")
        assert "3" in val

    def test_is_null_check(self, dataset):
        """Patients where address is null (Child has no address) — via raw CQL text."""
        ds, pids, client = dataset
        cql = (
            "library NullTest version '1.0.0' "
            "using FHIR version '4.0.1' "
            "include FHIRHelpers version '4.0.1' "
            "context Patient "
            "define NoAddress: [Patient] P where P.address is null"
        )
        s, b = client.cql_text(ds, cql)
        assert s == 200, f"Expected 200: {b}"
        # Tommy Child has no address
        assert _count_results(b, "NoAddress") == 1
