#!/usr/bin/env python3
"""Manual test: start FHIR+CQL server, insert data, run CQL queries.

Usage:
    cd integration-tests
    ./venv/bin/python manual_test_fhir_cql.py
"""

import json
import os
import socket
import sys
import time
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from conftest import Node, FHIR_EXT, CQL2ELM_EXT, alloc_ports

os.environ.setdefault("FHIR_POOL_SIZE", "1")


def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def http(base_url, method, path, data=None):
    url = f"{base_url}{path}"
    body_bytes = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body_bytes, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            return resp.status, json.loads(text) if text.strip() else None
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8")
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            body = text
        return e.code, body


def main():
    gp, fp, pp = alloc_ports()
    fhir_port = free_port()
    base = f"http://127.0.0.1:{fhir_port}"

    # ── Start server with both extensions ──
    print(f"Starting FHIR+CQL server on port {fhir_port}...")
    node = Node([FHIR_EXT, CQL2ELM_EXT], gp, fp, pp)
    node.execute(f"SELECT trex_fhir_start('127.0.0.1', {fhir_port})")

    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            if http(base, "GET", "/health")[0] == 200:
                break
        except Exception:
            pass
        time.sleep(0.5)
    else:
        node.close()
        sys.exit("Server did not become healthy")

    print("Server ready.\n")

    # ── Create dataset ──
    ds = "demo"
    http(base, "POST", "/datasets", {"id": ds, "name": "Demo Dataset"})

    # ── Insert FHIR resources ──
    patients = [
        {"resourceType": "Patient", "gender": "male", "birthDate": "1990-01-15",
         "name": [{"family": "Adams", "given": ["John"]}]},
        {"resourceType": "Patient", "gender": "female", "birthDate": "2010-06-01",
         "name": [{"family": "Baker", "given": ["Jane"]}]},
        {"resourceType": "Patient", "gender": "male", "birthDate": "1975-03-20",
         "name": [{"family": "Clark", "given": ["Bob"]}]},
        {"resourceType": "Patient", "gender": "female", "birthDate": "1988-11-30",
         "name": [{"family": "Davis", "given": ["Alice"]}]},
    ]
    conditions = [
        {"resourceType": "Condition", "code": {"coding": [{"system": "http://snomed.info/sct", "code": "44054006", "display": "Diabetes"}]}, "clinicalStatus": {"coding": [{"code": "active"}]}},
        {"resourceType": "Condition", "code": {"coding": [{"system": "http://snomed.info/sct", "code": "38341003", "display": "Hypertension"}]}, "clinicalStatus": {"coding": [{"code": "active"}]}},
    ]

    print("Inserting patients...")
    patient_ids = []
    for p in patients:
        s, b = http(base, "POST", f"/{ds}/Patient", p)
        pid = b["id"]
        patient_ids.append(pid)
        print(f"  {p['name'][0]['given'][0]} {p['name'][0]['family']} => ok")

    # Link conditions to patients via subject reference
    print("\nInserting conditions...")
    conditions[0]["subject"] = {"reference": f"Patient/{patient_ids[0]}"}
    conditions[1]["subject"] = {"reference": f"Patient/{patient_ids[2]}"}
    for c in conditions:
        s, b = http(base, "POST", f"/{ds}/Condition", c)
        display = c["code"]["coding"][0]["display"]
        ref = c["subject"]["reference"]
        print(f"  {display} for {ref} => ok")

    # ── Run CQL queries ──
    print("\n" + "=" * 60)
    print("CQL QUERIES")
    print("=" * 60)

    # Query 1: raw CQL text — retrieve all patients
    cql1 = (
        "library Test1 version '1.0.0' "
        "using FHIR version '4.0.1' "
        "context Patient "
        "define AllPatients: [Patient]"
    )
    print("\n── Query 1: All Patients (raw CQL text) ──")
    print(f"CQL: {cql1}\n")
    s, b = http(base, "POST", f"/{ds}/$cql", {"cql": cql1})
    print(f"Status: {s}")
    print(f"Result entries: {len(b) if isinstance(b, list) else 'N/A'}")

    # Query 2: raw CQL text — filter male patients
    cql2 = (
        "library Test2 version '1.0.0' "
        "using FHIR version '4.0.1' "
        "context Patient "
        "define MalePatients: [Patient] P where P.gender = 'male'"
    )
    print("\n── Query 2: Male Patients (raw CQL text) ──")
    print(f"CQL: {cql2}\n")
    s, b = http(base, "POST", f"/{ds}/$cql", {"cql": cql2})
    print(f"Status: {s}")
    print(f"Result entries: {len(b) if isinstance(b, list) else 'N/A'}")

    # Query 3: patient count via pre-compiled ELM (Count is not supported by cql2elm translator)
    elm3 = {
        "identifier": {"id": "Test3", "version": "1.0.0"},
        "statements": {
            "def": [{
                "name": "PatientCount",
                "context": "Patient",
                "expression": {
                    "type": "Count",
                    "source": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}
                }
            }]
        }
    }
    print("\n── Query 3: Patient Count (ELM JSON) ──")
    print("ELM: define PatientCount: Count([Patient])\n")
    s, b = http(base, "POST", f"/{ds}/$cql", {"library": elm3})
    print(f"Status: {s}")
    print(f"Result: {b if isinstance(b, (int, float)) else type(b).__name__}")

    # Query 4: raw CQL text — retrieve all conditions
    cql4 = (
        "library Test4 version '1.0.0' "
        "using FHIR version '4.0.1' "
        "context Patient "
        "define AllConditions: [Condition]"
    )
    print("\n── Query 4: All Conditions (raw CQL text) ──")
    print(f"CQL: {cql4}\n")
    s, b = http(base, "POST", f"/{ds}/$cql", {"cql": cql4})
    print(f"Status: {s}")
    print(f"Result entries: {len(b) if isinstance(b, list) else 'N/A'}")

    # Query 5: pre-compiled ELM JSON — female patients born after 2000
    elm5 = {
        "identifier": {"id": "Test5", "version": "1.0.0"},
        "statements": {
            "def": [{
                "name": "YoungFemales",
                "context": "Patient",
                "expression": {
                    "type": "Query",
                    "source": [{"alias": "P", "expression": {"type": "Retrieve", "dataType": "{http://hl7.org/fhir}Patient"}}],
                    "where": {
                        "type": "And",
                        "operand": [
                            {"type": "Equal", "operand": [
                                {"type": "Property", "path": "gender", "scope": "P"},
                                {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}String", "value": "female"}
                            ]},
                            {"type": "GreaterOrEqual", "operand": [
                                {"type": "Property", "path": "birthDate", "scope": "P"},
                                {"type": "Literal", "valueType": "{urn:hl7-org:elm-types:r1}Date", "value": "2000-01-01"}
                            ]}
                        ]
                    }
                }
            }]
        }
    }
    print("\n── Query 5: Female Patients Born >= 2000 (ELM JSON) ──")
    print("ELM: define YoungFemales: [Patient] P where P.gender = 'female' and P.birthDate >= @2000-01-01\n")
    s, b = http(base, "POST", f"/{ds}/$cql", {"library": elm5})
    print(f"Status: {s}")
    print(f"Result entries: {len(b) if isinstance(b, list) else 'N/A'}")

    # ── Cleanup ──
    print("\n" + "=" * 60)
    try:
        node.execute(f"SELECT trex_fhir_stop('127.0.0.1', {fhir_port})")
    except Exception:
        pass
    node.close()
    print("Done.")


if __name__ == "__main__":
    main()
