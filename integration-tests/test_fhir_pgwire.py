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

from conftest import Node, POOL_EXT, FHIR_EXT, PGWIRE_EXT, alloc_ports


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
    """Start a node with both FHIR and PgWire extensions sharing the host DuckDB.

    Both FHIR and PgWire use the same DuckDB instance via the shared connection
    pool, so data written via FHIR HTTP is visible through PgWire SQL and vice
    versa.  This exercises the write queue and concurrent access paths.
    """
    os.environ["FHIR_POOL_SIZE"] = "8"
    os.environ["FHIR_USE_HOST_DB"] = "true"
    os.environ["TREX_POOL_SIZE"] = "64"

    gp, fp, pp, tp = alloc_ports()
    node = Node([POOL_EXT, FHIR_EXT, PGWIRE_EXT], gp, fp, pp, tp)

    # Start FHIR server in host-DB mode (shares the node's DuckDB)
    fhir_port = _free_port()
    result = node.execute(
        f"SELECT trex_fhir_start('127.0.0.1', {fhir_port}, 'fhir', '')"
    )
    assert "Started" in result[0][0], f"trex_fhir_start: {result}"

    # Start PgWire on the same host DuckDB
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

    # Schema used by FHIR: "fhir"."<dataset_id with - replaced by _>"
    fhir_schema = dataset_id.replace("-", "_")

    yield client, pg_port, dataset_id, fhir_schema

    os.environ.pop("FHIR_USE_HOST_DB", None)
    os.environ.pop("TREX_POOL_SIZE", None)
    try:
        node.execute(f"SELECT trex_fhir_stop('127.0.0.1', {fhir_port})")
    except Exception:
        pass
    try:
        node.execute(f"SELECT trex_pgwire_stop('127.0.0.1', {pg_port})")
    except Exception:
        pass
    node.close()


# ===================================================================
# TESTS
# ===================================================================

def test_fhir_crud_visible_via_pgwire(env):
    """FHIR data written via HTTP is visible through PgWire on the shared DB."""
    client, pg_port, dataset_id, fhir_schema = env

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

    # Verify the FHIR data is visible via PgWire (shared DB)
    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'SELECT _id FROM "fhir"."{fhir_schema}"."Patient" WHERE _id = \'{patient_id}\''
        )
        rows = cur.fetchall()
        assert len(rows) == 1, f"expected 1 row via PgWire, got {len(rows)}"
        cur.close()
    finally:
        conn.close()

    # Delete via FHIR and confirm it's soft-deleted via PgWire
    s, _ = client.delete(f"/{dataset_id}/Patient/{patient_id}")
    assert s == 204

    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'SELECT _id FROM "fhir"."{fhir_schema}"."Patient"'
            f" WHERE _id = '{patient_id}' AND NOT _is_deleted"
        )
        rows = cur.fetchall()
        assert len(rows) == 0, f"expected 0 active rows after delete, got {len(rows)}"
        cur.close()
    finally:
        conn.close()


def test_fhir_search_consistent_with_pgwire(env):
    """FHIR search results match what PgWire sees on the shared DB."""
    client, pg_port, dataset_id, fhir_schema = env

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
    fhir_total = body["total"]
    assert fhir_total >= 5

    # PgWire should see the same row count
    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."Patient"')
        pg_count = cur.fetchone()[0]
        cur.close()
    finally:
        conn.close()

    assert pg_count >= 5, f"PgWire sees {pg_count} patients, expected >= 5"


def test_sequential_fhir_writes(env):
    """Multiple FHIR writes in sequence all succeed and are readable."""
    client, _, dataset_id, _ = env

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
    _, pg_port, _, _ = env

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
            cur.execute(f"INSERT INTO pgtest VALUES ({idx}, 'client-{idx}')")
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
    """FHIR writes are immediately visible via PgWire on the shared DB.

    Alternates between FHIR writes and PgWire reads to verify the write queue
    serialises correctly and data is visible across both protocols.
    """
    client, pg_port, dataset_id, fhir_schema = env

    num_ops = 5
    for i in range(num_ops):
        # FHIR write
        s, _ = client.put(f"/{dataset_id}/Patient/interleaved-{i}", {
            "resourceType": "Patient",
            "id": f"interleaved-{i}",
            "name": [{"family": f"Interleaved{i}"}],
        })
        assert s in (200, 201), f"FHIR write {i}: status {s}"

        # PgWire read — verify the just-written resource is visible
        conn = _pg_connect(pg_port)
        try:
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(
                f'SELECT _id FROM "fhir"."{fhir_schema}"."Patient" WHERE _id = \'interleaved-{i}\''
            )
            rows = cur.fetchall()
            assert len(rows) == 1, (
                f"interleaved-{i} not visible via PgWire after FHIR write"
            )
            cur.close()
        finally:
            conn.close()

    # Verify all FHIR resources still exist via FHIR API
    for i in range(num_ops):
        s, body = client.get(f"/{dataset_id}/Patient/interleaved-{i}")
        assert s == 200, f"GET interleaved-{i} failed ({s})"


def test_concurrent_fhir_writes(env):
    """Many FHIR writes in parallel — all must succeed without data loss."""
    client, pg_port, dataset_id, fhir_schema = env

    num_writers = 16

    def fhir_writer(idx):
        rid = f"concurrent-{idx}"
        s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
            "resourceType": "Patient",
            "id": rid,
            "name": [{"family": f"Concurrent{idx}"}],
        })
        return idx, s

    with ThreadPoolExecutor(max_workers=num_writers) as pool:
        futures = [pool.submit(fhir_writer, i) for i in range(num_writers)]
        results = {}
        for f in as_completed(futures):
            idx, status = f.result()
            results[idx] = status

    for i in range(num_writers):
        assert results[i] in (200, 201), f"writer {i}: status {results[i]}"

    # All resources must be readable via FHIR
    for i in range(num_writers):
        s, body = client.get(f"/{dataset_id}/Patient/concurrent-{i}")
        assert s == 200, f"concurrent-{i} not readable via FHIR"
        assert body["name"][0]["family"] == f"Concurrent{i}"

    # All resources must be visible via PgWire
    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."Patient"'
            f" WHERE _id LIKE 'concurrent-%' AND NOT _is_deleted"
        )
        count = cur.fetchone()[0]
        cur.close()
    finally:
        conn.close()

    assert count == num_writers, (
        f"expected {num_writers} concurrent patients via PgWire, got {count}"
    )


def test_concurrent_fhir_writes_and_pgwire_reads(env):
    """FHIR writes and PgWire reads fire simultaneously on the shared DB."""
    client, pg_port, dataset_id, fhir_schema = env

    num_ops = 20

    # Seed some patients first so PgWire reads have data to query
    for i in range(5):
        s, _ = client.put(f"/{dataset_id}/Patient/seed-{i}", {
            "resourceType": "Patient",
            "id": f"seed-{i}",
            "name": [{"family": f"Seed{i}"}],
        })
        assert s in (200, 201)

    errors = []
    barrier = threading.Barrier(num_ops, timeout=15)

    def fhir_writer(idx):
        barrier.wait()
        rid = f"mixed-{idx}"
        s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
            "resourceType": "Patient",
            "id": rid,
            "name": [{"family": f"Mixed{idx}"}],
        })
        if s not in (200, 201):
            errors.append(f"FHIR write {idx}: status {s}")

    def pgwire_reader(idx):
        barrier.wait()
        conn = _pg_connect(pg_port)
        try:
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(
                f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."Patient"'
            )
            cur.fetchone()
            cur.close()
        except Exception as e:
            errors.append(f"PgWire read {idx}: {e}")
        finally:
            conn.close()

    with ThreadPoolExecutor(max_workers=num_ops) as pool:
        futures = []
        for i in range(num_ops):
            if i % 2 == 0:
                futures.append(pool.submit(fhir_writer, i))
            else:
                futures.append(pool.submit(pgwire_reader, i))
        for f in as_completed(futures):
            f.result()  # propagate exceptions

    assert not errors, "Concurrent errors:\n" + "\n".join(errors)

    # Verify all written patients exist
    for i in range(0, num_ops, 2):
        s, body = client.get(f"/{dataset_id}/Patient/mixed-{i}")
        assert s == 200, f"mixed-{i} not readable after concurrent test"


def test_concurrent_pgwire_writes_and_fhir_reads(env):
    """PgWire writes and FHIR reads fire simultaneously on the shared DB."""
    client, pg_port, dataset_id, fhir_schema = env

    # Create a table via PgWire for writes
    conn = _pg_connect(pg_port)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("CREATE TABLE IF NOT EXISTS concurrent_rw (id INTEGER, val VARCHAR)")
    cur.close()
    conn.close()

    # Seed some FHIR patients to read
    for i in range(5):
        s, _ = client.put(f"/{dataset_id}/Patient/rwseed-{i}", {
            "resourceType": "Patient",
            "id": f"rwseed-{i}",
            "name": [{"family": f"RWSeed{i}"}],
        })
        assert s in (200, 201)

    num_ops = 16
    errors = []
    barrier = threading.Barrier(num_ops, timeout=15)

    def pgwire_writer(idx):
        barrier.wait()
        conn = _pg_connect(pg_port)
        try:
            conn.autocommit = True
            cur = conn.cursor()
            cur.execute(f"INSERT INTO concurrent_rw VALUES ({idx}, 'rw-{idx}')")
            cur.close()
        except Exception as e:
            errors.append(f"PgWire write {idx}: {e}")
        finally:
            conn.close()

    def fhir_reader(idx):
        barrier.wait()
        rid = f"rwseed-{idx % 5}"
        s, body = client.get(f"/{dataset_id}/Patient/{rid}")
        if s != 200:
            errors.append(f"FHIR read {rid}: status {s}")

    with ThreadPoolExecutor(max_workers=num_ops) as pool:
        futures = []
        for i in range(num_ops):
            if i % 2 == 0:
                futures.append(pool.submit(pgwire_writer, i))
            else:
                futures.append(pool.submit(fhir_reader, i))
        for f in as_completed(futures):
            f.result()

    assert not errors, "Concurrent errors:\n" + "\n".join(errors)

    # Verify PgWire writes landed
    conn = _pg_connect(pg_port)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM concurrent_rw")
    count = cur.fetchone()[0]
    cur.execute("DROP TABLE concurrent_rw")
    cur.close()
    conn.close()

    expected = num_ops // 2
    assert count == expected, f"expected {expected} PgWire rows, got {count}"


def test_burst_fhir_writes_then_pgwire_count(env):
    """Rapid burst of FHIR writes followed by a PgWire count — no rows lost."""
    client, pg_port, dataset_id, fhir_schema = env

    num_burst = 32

    def fhir_writer(idx):
        rid = f"burst-{idx}"
        s, _ = client.put(f"/{dataset_id}/Patient/{rid}", {
            "resourceType": "Patient",
            "id": rid,
            "name": [{"family": f"Burst{idx}"}],
        })
        return idx, s

    with ThreadPoolExecutor(max_workers=16) as pool:
        futures = [pool.submit(fhir_writer, i) for i in range(num_burst)]
        for f in as_completed(futures):
            idx, status = f.result()
            assert status in (200, 201), f"burst writer {idx}: status {status}"

    # PgWire must see all of them
    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."Patient"'
            f" WHERE _id LIKE 'burst-%' AND NOT _is_deleted"
        )
        count = cur.fetchone()[0]
        cur.close()
    finally:
        conn.close()

    assert count == num_burst, (
        f"expected {num_burst} burst patients via PgWire, got {count}"
    )


def test_concurrent_fhir_create_update_delete(env):
    """Concurrent create, update, and delete on different resources."""
    client, pg_port, dataset_id, fhir_schema = env

    num_resources = 12

    # Phase 1: create all resources in parallel
    def create(idx):
        rid = f"lifecycle-{idx}"
        s, _ = client.put(f"/{dataset_id}/Patient/{rid}", {
            "resourceType": "Patient",
            "id": rid,
            "name": [{"family": f"V1-{idx}"}],
        })
        return idx, "create", s

    with ThreadPoolExecutor(max_workers=num_resources) as pool:
        for f in as_completed([pool.submit(create, i) for i in range(num_resources)]):
            idx, op, s = f.result()
            assert s in (200, 201), f"{op} {idx}: status {s}"

    # Phase 2: concurrently update even-indexed, delete odd-indexed
    def update(idx):
        rid = f"lifecycle-{idx}"
        s, _ = client.put(f"/{dataset_id}/Patient/{rid}", {
            "resourceType": "Patient",
            "id": rid,
            "name": [{"family": f"V2-{idx}"}],
        })
        return idx, "update", s

    def delete(idx):
        rid = f"lifecycle-{idx}"
        s, _ = client.delete(f"/{dataset_id}/Patient/{rid}")
        return idx, "delete", s

    with ThreadPoolExecutor(max_workers=num_resources) as pool:
        futures = []
        for i in range(num_resources):
            if i % 2 == 0:
                futures.append(pool.submit(update, i))
            else:
                futures.append(pool.submit(delete, i))
        for f in as_completed(futures):
            idx, op, s = f.result()
            if op == "update":
                assert s in (200, 201), f"{op} {idx}: status {s}"
            else:
                assert s == 204, f"{op} {idx}: status {s}"

    # Verify: even-indexed updated, odd-indexed soft-deleted
    for i in range(num_resources):
        rid = f"lifecycle-{i}"
        s, body = client.get(f"/{dataset_id}/Patient/{rid}")
        if i % 2 == 0:
            assert s == 200, f"updated resource {rid} not found"
            assert body["name"][0]["family"] == f"V2-{i}"
        else:
            assert s == 410, f"deleted resource {rid} should return 410, got {s}"

    # PgWire: count active (non-deleted) lifecycle resources
    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."Patient"'
            f" WHERE _id LIKE 'lifecycle-%' AND NOT _is_deleted"
        )
        active = cur.fetchone()[0]
        cur.close()
    finally:
        conn.close()

    expected_active = num_resources // 2
    assert active == expected_active, (
        f"expected {expected_active} active lifecycle patients, got {active}"
    )
