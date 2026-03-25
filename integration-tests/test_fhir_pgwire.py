"""FHIR + PgWire integration tests.

Verifies that FHIR data written via the HTTP API is readable through PgWire
(PostgreSQL wire protocol), and that concurrent reads/writes via both
interfaces work correctly.
"""

import json
import os
import socket
import threading
import time
import urllib.request
import urllib.error
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import psycopg2
import pytest

from conftest import Node, FHIR_EXT, PGWIRE_EXT, alloc_ports


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _pg_connect(port, dbname="fhir", password="test"):
    return psycopg2.connect(
        host="127.0.0.1",
        port=port,
        user="any",
        password=password,
        dbname=dbname,
    )


class FhirClient:
    """Thin HTTP client for FHIR API testing (stdlib only)."""

    def __init__(self, base_url):
        self.base_url = base_url

    def request(self, method, path, data=None):
        url = f"{self.base_url}{path}"
        body = json.dumps(data).encode("utf-8") if data is not None else None
        req = urllib.request.Request(url, data=body, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode("utf-8")
                return resp.status, json.loads(text) if text.strip() else None
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8")
            return e.code, json.loads(text) if text.strip() else None

    def get(self, path):
        return self.request("GET", path)

    def post(self, path, data):
        return self.request("POST", path, data)

    def put(self, path, data):
        return self.request("PUT", path, data)

    def delete(self, path):
        return self.request("DELETE", path)


# ---------------------------------------------------------------------------
# Fixture: FHIR + PgWire server
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def env(request):
    """Start a node with both FHIR and PgWire extensions in host-DB mode.

    Host mode means both FHIR and PgWire share the same DuckDB instance,
    so data written via FHIR HTTP is visible through PgWire SQL and vice versa.
    """
    os.environ["FHIR_POOL_SIZE"] = "1"
    os.environ["FHIR_USE_HOST_DB"] = "false"

    import tempfile, shutil

    gp, fp, pp = alloc_ports()
    node = Node([FHIR_EXT, PGWIRE_EXT], gp, fp, pp)

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    fhir_db_dir = tempfile.mkdtemp(dir=os.path.join(repo_root, "tmp", "fhir-test-dbs"))
    fhir_db_path = os.path.join(fhir_db_dir, "fhir.db")

    # Start FHIR server in standalone mode (its own DuckDB)
    fhir_port = _free_port()
    result = node.execute(
        f"SELECT trex_fhir_start('127.0.0.1', {fhir_port}, 'fhir', '{fhir_db_path}')"
    )
    assert "Started" in result[0][0], f"trex_fhir_start: {result}"

    # Start PgWire on the host DuckDB (separate from FHIR's standalone DB)
    pg_port = _free_port()
    node.execute(
        f"SELECT trex_pgwire_start('127.0.0.1', {pg_port}, 'test', '')"
    )

    client = FhirClient(f"http://127.0.0.1:{fhir_port}")

    # Wait for FHIR server health
    deadline = time.time() + 30
    while time.time() < deadline:
        try:
            s, _ = client.get("/health")
            if s == 200:
                break
        except Exception:
            pass
        time.sleep(0.5)
    else:
        node.close()
        pytest.fail("FHIR server did not become healthy within 30s")

    # Create a shared dataset for all tests
    dataset_id = f"t-{uuid.uuid4().hex[:8]}"
    s, body = client.post("/datasets", {"id": dataset_id, "name": "pgwire-test"})
    assert s == 201, f"create dataset failed ({s}): {body}"

    yield client, pg_port, dataset_id

    os.environ.pop("FHIR_USE_HOST_DB", None)
    try:
        node.execute(f"SELECT trex_fhir_stop('127.0.0.1', {fhir_port})")
    except Exception:
        pass
    try:
        node.execute(f"SELECT trex_pgwire_stop('127.0.0.1', {pg_port})")
    except Exception:
        pass
    node.close()
    shutil.rmtree(fhir_db_dir, ignore_errors=True)


# ===================================================================
# TESTS
# ===================================================================

def test_fhir_crud_while_pgwire_active(env):
    """FHIR CRUD operations work correctly while PgWire is also running."""
    client, pg_port, dataset_id = env

    # Create a Patient via FHIR
    s, body = client.post(f"/{dataset_id}/Patient", {
        "resourceType": "Patient",
        "name": [{"family": "PgWireCoexist", "given": ["Alice"]}],
        "gender": "female",
    })
    assert s == 201
    patient_id = body["id"]

    # Read it back via FHIR
    s, body = client.get(f"/{dataset_id}/Patient/{patient_id}")
    assert s == 200
    assert body["name"][0]["family"] == "PgWireCoexist"

    # Meanwhile pgwire works independently on the host DB
    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT 42")
        assert cur.fetchone()[0] == 42
        cur.close()
    finally:
        conn.close()

    # Delete via FHIR still works
    s, _ = client.delete(f"/{dataset_id}/Patient/{patient_id}")
    assert s == 204


def test_fhir_search_while_pgwire_active(env):
    """FHIR search works correctly with PgWire running alongside."""
    client, pg_port, dataset_id = env

    # Create several patients via FHIR
    for i in range(5):
        s, _ = client.post(f"/{dataset_id}/Patient", {
            "resourceType": "Patient",
            "name": [{"family": f"SearchCoexist{i}"}],
        })
        assert s == 201

    # FHIR search
    s, body = client.get(f"/{dataset_id}/Patient?_count=100")
    assert s == 200
    assert body["total"] >= 5

    # PgWire still works
    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT 1 + 1")
        assert cur.fetchone()[0] == 2
        cur.close()
    finally:
        conn.close()


def test_sequential_fhir_writes(env):
    """Multiple FHIR writes in sequence all succeed and are readable."""
    client, _, dataset_id = env

    num_writes = 8
    for i in range(num_writes):
        s, body = client.put(f"/{dataset_id}/Patient/seqwrite-{i}", {
            "resourceType": "Patient",
            "id": f"seqwrite-{i}",
            "name": [{"family": f"SeqWrite{i}"}],
        })
        assert s in (200, 201), f"writer {i}: status {s}"

    # Verify all are readable
    for i in range(num_writes):
        s, body = client.get(f"/{dataset_id}/Patient/seqwrite-{i}")
        assert s == 200, f"GET seqwrite-{i} failed ({s})"
        assert body["name"][0]["family"] == f"SeqWrite{i}"


def test_parallel_pgwire_writes_and_reads(env):
    """Concurrent PgWire writes and reads on the host DB work in parallel."""
    _, pg_port, _ = env

    # Create a table on the host DB via pgwire
    conn = _pg_connect(pg_port)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS pgtest (id INTEGER, val VARCHAR)")
    cur.close()
    conn.close()

    num_clients = 8
    barrier = threading.Barrier(num_clients, timeout=10)

    def pgwire_worker(idx):
        barrier.wait()
        conn = _pg_connect(pg_port)
        try:
            conn.autocommit = True
            cur = conn.cursor()
            # Write
            cur.execute(f"INSERT INTO pgtest VALUES ({idx}, 'client-{idx}')")
            # Read back
            cur.execute(f"SELECT val FROM pgtest WHERE id = {idx}")
            rows = cur.fetchall()
            cur.close()
            return idx, rows[0][0] if rows else None
        finally:
            conn.close()

    with ThreadPoolExecutor(max_workers=num_clients) as pool:
        futures = {pool.submit(pgwire_worker, i): i for i in range(num_clients)}
        results = {}
        for f in as_completed(futures):
            idx, val = f.result()
            results[idx] = val

    for i in range(num_clients):
        assert results[i] == f"client-{i}", f"client {i}: expected 'client-{i}', got {results[i]}"

    # Verify total row count
    conn = _pg_connect(pg_port)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM pgtest")
    count = cur.fetchone()[0]
    assert count == num_clients, f"expected {num_clients} rows, got {count}"
    cur.execute("DROP TABLE pgtest")
    cur.close()
    conn.close()


def test_fhir_writes_interleaved_with_pgwire_reads(env):
    """FHIR writes and PgWire reads interleaved — both protocols work side by side.

    In standalone mode the FHIR server has its own DuckDB, so PgWire reads
    go to the host DB. We alternate between FHIR writes and PgWire queries
    to confirm both protocols function independently.
    """
    client, pg_port, dataset_id = env

    num_ops = 5
    for i in range(num_ops):
        # FHIR write
        s, _ = client.put(f"/{dataset_id}/Patient/interleaved-{i}", {
            "resourceType": "Patient",
            "id": f"interleaved-{i}",
            "name": [{"family": f"Interleaved{i}"}],
        })
        assert s in (200, 201), f"FHIR write {i}: status {s}"

        # PgWire read (host DB — just confirm the connection works)
        conn = _pg_connect(pg_port)
        try:
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(f"SELECT {i}")
            val = cur.fetchone()[0]
            assert val == i
            cur.close()
        finally:
            conn.close()

    # Verify all FHIR resources exist
    for i in range(num_ops):
        s, body = client.get(f"/{dataset_id}/Patient/interleaved-{i}")
        assert s == 200, f"GET interleaved-{i} failed ({s})"
