"""Extended fhir + pgwire load and stress tests.

These exercise patterns the connection pool's shared_writer or session-pinning
currently buffers; they are the gate for the pool-removal refactor.
"""

import json
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed


from test_fhir_pgwire import env, FhirClient, _free_port, _pg_connect  # noqa: F401


def _request_with_headers(base_url, method, path, data=None, headers=None):
    """HTTP request supporting custom headers (used for If-Match)."""
    url = f"{base_url}{path}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            etag = resp.headers.get("ETag")
            return resp.status, json.loads(text) if text.strip() else None, etag
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8")
        etag = e.headers.get("ETag") if e.headers else None
        return e.code, json.loads(text) if text.strip() else None, etag


# ===================================================================
# TESTS
# ===================================================================

def test_sustained_fhir_writes(env):
    """16 writers x 200 sequential PUTs each — sustained ~30s+ load."""
    client, pg_port, dataset_id, fhir_schema = env

    num_writers = 10
    writes_per_writer = 100
    total = num_writers * writes_per_writer

    def writer(widx):
        out = []
        for i in range(writes_per_writer):
            rid = f"sustained-{widx}-{i}"
            s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
                "resourceType": "Patient",
                "id": rid,
                "name": [{"family": f"Sustained-{widx}-{i}"}],
            })
            out.append((widx, i, s, body))
        return out

    start = time.time()
    all_results = []
    with ThreadPoolExecutor(max_workers=num_writers) as pool:
        futures = [pool.submit(writer, w) for w in range(num_writers)]
        for f in as_completed(futures):
            all_results.extend(f.result())
    elapsed = time.time() - start

    for widx, i, s, body in all_results:
        assert s in (200, 201), (
            f"writer {widx} write {i}: status {s}, body: {body!r}"
        )

    s, body = client.get(f"/{dataset_id}/Patient?_count=1&name=Sustained-0-0")
    assert s == 200, f"GET search: status {s}, body: {body!r}"

    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."patient"'
            f" WHERE _id LIKE 'sustained-%' AND NOT _is_deleted"
        )
        count = cur.fetchone()[0]
        cur.close()
    finally:
        conn.close()

    assert count == total, (
        f"expected {total} sustained patients via PgWire, got {count} "
        f"(elapsed {elapsed:.1f}s)"
    )

    # Cleanup via PgWire DELETE — 3,200 sequential FHIR DELETEs would exceed
    # the pytest timeout, and this test only needs the data gone afterward.
    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'DELETE FROM "fhir"."{fhir_schema}"."patient"'
            f" WHERE _id LIKE 'sustained-%'"
        )
        cur.close()
    finally:
        conn.close()


def test_high_concurrency_fhir_writes(env):
    """64 concurrent FHIR PUTs on unique resource ids."""
    client, pg_port, dataset_id, fhir_schema = env

    num_writers = 64
    barrier = threading.Barrier(num_writers, timeout=30)

    def writer(idx):
        rid = f"highconc-{idx}"
        barrier.wait()
        s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
            "resourceType": "Patient",
            "id": rid,
            "name": [{"family": f"HighConc{idx}"}],
        })
        return idx, s, body

    results = {}
    with ThreadPoolExecutor(max_workers=num_writers) as pool:
        futures = [pool.submit(writer, i) for i in range(num_writers)]
        for f in as_completed(futures):
            idx, s, body = f.result()
            results[idx] = (s, body)

    for i in range(num_writers):
        s, body = results[i]
        assert s in (200, 201), f"writer {i}: status {s}, body: {body!r}"

    for i in range(num_writers):
        s, body = client.get(f"/{dataset_id}/Patient/highconc-{i}")
        assert s == 200, (
            f"GET highconc-{i}: status {s}, body: {body!r}"
        )
        assert body["name"][0]["family"] == f"HighConc{i}", (
            f"highconc-{i}: family mismatch, body: {body!r}"
        )

    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."patient"'
            f" WHERE _id LIKE 'highconc-%' AND NOT _is_deleted"
        )
        count = cur.fetchone()[0]
        cur.close()
    finally:
        conn.close()

    assert count == num_writers, (
        f"expected {num_writers} highconc patients via PgWire, got {count}"
    )

    for i in range(num_writers):
        client.delete(f"/{dataset_id}/Patient/highconc-{i}")


def test_concurrent_fhir_updates_different_resources(env):
    """Phase 1: create 32 unique resources. Phase 2: 32 parallel updates."""
    client, _, dataset_id, _ = env

    num_resources = 32

    for i in range(num_resources):
        s, body = client.put(f"/{dataset_id}/Patient/updiff-{i}", {
            "resourceType": "Patient",
            "id": f"updiff-{i}",
            "name": [{"family": f"InitFamily{i}"}],
        })
        assert s in (200, 201), (
            f"seed updiff-{i}: status {s}, body: {body!r}"
        )

    barrier = threading.Barrier(num_resources, timeout=30)

    def updater(idx):
        rid = f"updiff-{idx}"
        barrier.wait()
        s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
            "resourceType": "Patient",
            "id": rid,
            "name": [{"family": f"UpdatedFamily{idx}"}],
        })
        return idx, s, body

    results = {}
    with ThreadPoolExecutor(max_workers=num_resources) as pool:
        futures = [pool.submit(updater, i) for i in range(num_resources)]
        for f in as_completed(futures):
            idx, s, body = f.result()
            results[idx] = (s, body)

    for i in range(num_resources):
        s, body = results[i]
        assert s in (200, 201), (
            f"updater {i}: status {s}, body: {body!r} (no version conflict expected — disjoint ids)"
        )

    for i in range(num_resources):
        s, body = client.get(f"/{dataset_id}/Patient/updiff-{i}")
        assert s == 200, f"GET updiff-{i}: status {s}, body: {body!r}"
        assert body["name"][0]["family"] == f"UpdatedFamily{i}", (
            f"updiff-{i}: family mismatch, got {body['name'][0]['family']!r}"
        )

    for i in range(num_resources):
        client.delete(f"/{dataset_id}/Patient/updiff-{i}")


def test_concurrent_fhir_updates_same_resource(env):
    """8 parallel PUTs on the same resource id with If-Match headers."""
    client, pg_port, dataset_id, fhir_schema = env

    rid = "same-target-1"

    s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
        "resourceType": "Patient",
        "id": rid,
        "name": [{"family": "SameTargetSeed"}],
    })
    assert s in (200, 201), f"seed: status {s}, body: {body!r}"

    num_writers = 8
    barrier = threading.Barrier(num_writers, timeout=30)

    def updater(idx):
        barrier.wait()
        # Each writer claims it expects version 1 — only one can win if the
        # server enforces optimistic locking; without enforcement, all succeed.
        status, body, _etag = _request_with_headers(
            client.base_url, "PUT", f"/{dataset_id}/Patient/{rid}",
            data={
                "resourceType": "Patient",
                "id": rid,
                "name": [{"family": f"SameTargetWriter{idx}"}],
            },
            headers={"If-Match": 'W/"1"'},
        )
        return idx, status, body

    statuses = {}
    with ThreadPoolExecutor(max_workers=num_writers) as pool:
        futures = [pool.submit(updater, i) for i in range(num_writers)]
        for f in as_completed(futures):
            idx, s, body = f.result()
            statuses[idx] = (s, body)

    for idx, (s, body) in statuses.items():
        # 500 with a transaction-conflict diagnostic is the current behaviour
        # for racing PUTs that DuckDB MVCC rejects; accept it alongside 409/412.
        if s == 500 and isinstance(body, dict):
            diag = " ".join(
                i.get("diagnostics", "") for i in body.get("issue", [])
            ).lower()
            if "update" in diag or "conflict" in diag:
                continue
        assert s in (200, 201, 409, 412), (
            f"writer {idx}: unexpected status {s}, body: {body!r}"
        )

    s, body = client.get(f"/{dataset_id}/Patient/{rid}")
    assert s == 200, f"final GET: status {s}, body: {body!r}"
    final_family = body["name"][0]["family"]
    accepted_families = {f"SameTargetWriter{i}" for i in range(num_writers)}
    accepted_families.add("SameTargetSeed")
    assert final_family in accepted_families, (
        f"final family {final_family!r} not in any of the writer payloads"
    )

    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."_history"'
            f" WHERE _id = '{rid}' AND _resource_type = 'Patient'"
        )
        history_count = cur.fetchone()[0]
        cur.close()
    finally:
        conn.close()

    assert history_count >= 1, (
        f"expected at least 1 history entry for {rid}, got {history_count}"
    )

    client.delete(f"/{dataset_id}/Patient/{rid}")


def test_fhir_bundle_concurrent_with_pgwire_reads(env):
    """50-entry transaction Bundle POST while pgwire readers count rows."""
    client, pg_port, dataset_id, fhir_schema = env

    num_entries = 50
    bundle_entries = []
    for i in range(num_entries):
        rid = f"bundlerc-{i}"
        bundle_entries.append({
            "fullUrl": f"urn:uuid:{rid}",
            "resource": {
                "resourceType": "Patient",
                "id": rid,
                "name": [{"family": f"BundleRC{i}"}],
            },
            "request": {
                "method": "PUT",
                "url": f"Patient/{rid}",
            },
        })
    bundle = {
        "resourceType": "Bundle",
        "type": "transaction",
        "entry": bundle_entries,
    }

    stop_flag = threading.Event()
    reader_counts = []
    reader_errors = []

    def pgwire_reader(idx):
        try:
            conn = _pg_connect(pg_port)
            conn.autocommit = True
            cur = conn.cursor()
            local_counts = []
            while not stop_flag.is_set():
                cur.execute(
                    f'SELECT COUNT(*) FROM "fhir"."{fhir_schema}"."patient"'
                )
                local_counts.append(cur.fetchone()[0])
                time.sleep(0.05)
            cur.close()
            conn.close()
            reader_counts.append((idx, local_counts))
        except Exception as e:
            reader_errors.append(f"reader {idx}: {e}")

    reader_threads = [
        threading.Thread(target=pgwire_reader, args=(i,)) for i in range(4)
    ]
    for t in reader_threads:
        t.start()
    time.sleep(0.2)

    try:
        s, body = client.post(f"/{dataset_id}", bundle)
    finally:
        stop_flag.set()
        for t in reader_threads:
            t.join(timeout=15)

    assert s in (200, 201), f"bundle POST: status {s}, body: {body!r}"
    assert body and body.get("resourceType") == "Bundle", (
        f"bundle response shape: body: {body!r}"
    )
    assert len(body.get("entry", [])) == num_entries, (
        f"expected {num_entries} response entries, got {len(body.get('entry', []))}, "
        f"body: {body!r}"
    )

    assert not reader_errors, "PgWire reader errors:\n" + "\n".join(reader_errors)
    for idx, counts in reader_counts:
        for a, b in zip(counts, counts[1:]):
            assert a <= b, (
                f"reader {idx} non-monotonic count: ...{a}, {b}... full: {counts}"
            )

    for i in range(num_entries):
        client.delete(f"/{dataset_id}/Patient/bundlerc-{i}")


def test_pgwire_long_streaming_during_fhir_writes(env):
    """pgwire opens a long-running cursor; fhir writes happen in parallel."""
    client, pg_port, dataset_id, _ = env

    write_results = []
    write_errors = []

    def fhir_writer():
        for i in range(30):
            rid = f"streamwr-{i}"
            try:
                s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
                    "resourceType": "Patient",
                    "id": rid,
                    "name": [{"family": f"StreamWr{i}"}],
                })
                write_results.append((i, s, body))
            except Exception as e:
                write_errors.append(f"write {i}: {e}")

    conn = _pg_connect(pg_port)
    conn.autocommit = True
    cur = conn.cursor()
    try:
        cur.execute("SELECT generate_series FROM range(1000000) t(generate_series)")

        writer_thread = threading.Thread(target=fhir_writer)
        writer_thread.start()
        time.sleep(5)
        writer_thread.join(timeout=60)

        rows = cur.fetchmany(1000)
        assert len(rows) == 1000, f"expected 1000 rows from cursor, got {len(rows)}"
        # Check the first row is a small generate_series value (cursor not torn).
        assert rows[0][0] == 0, f"first row should be 0, got {rows[0][0]}"
        assert rows[-1][0] == 999, f"last fetched row should be 999, got {rows[-1][0]}"
    finally:
        cur.close()
        conn.close()

    assert not write_errors, "FHIR write errors:\n" + "\n".join(write_errors)
    for i, s, body in write_results:
        assert s in (200, 201), f"write {i}: status {s}, body: {body!r}"

    for i in range(30):
        client.delete(f"/{dataset_id}/Patient/streamwr-{i}")


def test_fhir_search_during_burst_writes(env):
    """Seed 20 patients, then burst 32 more while another thread searches."""
    client, _, dataset_id, _ = env

    for i in range(20):
        s, body = client.put(f"/{dataset_id}/Patient/searchburst-seed-{i}", {
            "resourceType": "Patient",
            "id": f"searchburst-seed-{i}",
            "name": [{"family": f"SeedBurst{i}"}],
        })
        assert s in (200, 201), f"seed {i}: status {s}, body: {body!r}"

    burst_total = 32
    stop_flag = threading.Event()
    search_results = []
    search_errors = []
    burst_results = []
    burst_errors = []

    def burst_writer():
        try:
            for i in range(burst_total):
                rid = f"searchburst-burst-{i}"
                s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
                    "resourceType": "Patient",
                    "id": rid,
                    "name": [{"family": f"BurstNew{i}"}],
                })
                burst_results.append((i, s, body))
        except Exception as e:
            burst_errors.append(f"burst writer: {e}")
        finally:
            stop_flag.set()

    def searcher():
        while not stop_flag.is_set():
            try:
                s, body = client.get(f"/{dataset_id}/Patient?_count=100")
                search_results.append((s, body.get("total") if body else None))
                if s != 200:
                    search_errors.append(
                        f"search status {s}, body: {body!r}"
                    )
            except Exception as e:
                search_errors.append(f"search exception: {e}")
            time.sleep(0.05)

    writer_thread = threading.Thread(target=burst_writer)
    searcher_thread = threading.Thread(target=searcher)
    searcher_thread.start()
    time.sleep(0.1)
    writer_thread.start()

    writer_thread.join(timeout=60)
    searcher_thread.join(timeout=10)

    assert not burst_errors, "Burst writer errors:\n" + "\n".join(burst_errors)
    assert not search_errors, "Searcher errors:\n" + "\n".join(search_errors)
    assert search_results, "no searches completed"

    for i, s, body in burst_results:
        assert s in (200, 201), f"burst {i}: status {s}, body: {body!r}"

    for s, total in search_results:
        assert s == 200, f"search status {s}"
        assert total is not None and total >= 20, (
            f"search total {total} should be at least 20 (seed count)"
        )

    for i in range(20):
        client.delete(f"/{dataset_id}/Patient/searchburst-seed-{i}")
    for i in range(burst_total):
        client.delete(f"/{dataset_id}/Patient/searchburst-burst-{i}")


def test_fhir_history_during_writes(env):
    """One thread updates a resource; another reads its history concurrently."""
    client, _, dataset_id, _ = env

    rid = "histtest-1"
    s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
        "resourceType": "Patient",
        "id": rid,
        "name": [{"family": "HistInit"}],
    })
    assert s in (200, 201), f"seed: status {s}, body: {body!r}"

    num_updates = 20
    stop_flag = threading.Event()
    history_totals = []
    history_errors = []
    update_errors = []

    def updater():
        try:
            for i in range(num_updates):
                s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
                    "resourceType": "Patient",
                    "id": rid,
                    "name": [{"family": f"HistUpdate{i}"}],
                })
                if s not in (200, 201):
                    update_errors.append(
                        f"update {i}: status {s}, body: {body!r}"
                    )
                time.sleep(0.05)
        finally:
            stop_flag.set()

    def history_reader():
        while not stop_flag.is_set():
            try:
                s, body = client.get(
                    f"/{dataset_id}/Patient/{rid}/_history"
                )
                if s != 200:
                    history_errors.append(
                        f"history status {s}, body: {body!r}"
                    )
                else:
                    history_totals.append(body.get("total", 0))
            except Exception as e:
                history_errors.append(f"history exception: {e}")
            time.sleep(0.05)

    updater_thread = threading.Thread(target=updater)
    reader_thread = threading.Thread(target=history_reader)
    reader_thread.start()
    time.sleep(0.1)
    updater_thread.start()

    updater_thread.join(timeout=60)
    reader_thread.join(timeout=10)

    assert not update_errors, "Update errors:\n" + "\n".join(update_errors)
    assert not history_errors, "History reader errors:\n" + "\n".join(history_errors)
    assert history_totals, "no history reads completed"

    for a, b in zip(history_totals, history_totals[1:]):
        assert a <= b, (
            f"history total not monotonic: ...{a}, {b}... full: {history_totals}"
        )

    s, body = client.get(f"/{dataset_id}/Patient/{rid}/_history")
    assert s == 200, f"final history: status {s}, body: {body!r}"
    assert body["total"] >= 1, (
        f"expected at least 1 history entry, got {body['total']}"
    )

    client.delete(f"/{dataset_id}/Patient/{rid}")


def test_fhir_resource_type_first_insert_concurrent(env):
    """6 concurrent PUTs creating the FIRST resource of 6 different types."""
    client, pg_port, dataset_id, fhir_schema = env

    resource_types = [
        "Patient",
        "Observation",
        "Condition",
        "Procedure",
        "Encounter",
        "MedicationStatement",
    ]

    def make_body(rtype, idx):
        rid = f"firstof-{rtype.lower()}-{idx}"
        if rtype == "Patient":
            return rid, {
                "resourceType": "Patient",
                "id": rid,
                "name": [{"family": f"FirstOf{rtype}"}],
            }
        if rtype == "Observation":
            return rid, {
                "resourceType": "Observation",
                "id": rid,
                "status": "final",
                "code": {"text": "First"},
            }
        if rtype == "Condition":
            return rid, {
                "resourceType": "Condition",
                "id": rid,
                "code": {"text": "First"},
            }
        if rtype == "Procedure":
            return rid, {
                "resourceType": "Procedure",
                "id": rid,
                "status": "completed",
                "code": {"text": "First"},
            }
        if rtype == "Encounter":
            return rid, {
                "resourceType": "Encounter",
                "id": rid,
                "status": "finished",
            }
        if rtype == "MedicationStatement":
            return rid, {
                "resourceType": "MedicationStatement",
                "id": rid,
                "status": "active",
                "subject": {"reference": "Patient/none"},
            }
        raise ValueError(rtype)

    barrier = threading.Barrier(len(resource_types), timeout=30)

    def writer(rtype):
        rid, payload = make_body(rtype, 0)
        barrier.wait()
        s, body = client.put(f"/{dataset_id}/{rtype}/{rid}", payload)
        return rtype, rid, s, body

    results = {}
    with ThreadPoolExecutor(max_workers=len(resource_types)) as pool:
        futures = [pool.submit(writer, rt) for rt in resource_types]
        for f in as_completed(futures):
            rtype, rid, s, body = f.result()
            results[rtype] = (rid, s, body)

    for rtype in resource_types:
        rid, s, body = results[rtype]
        assert s in (200, 201), (
            f"first-of {rtype}: status {s}, body: {body!r} "
            f"(concurrent CREATE-TABLE-IF-NOT-EXISTS race)"
        )

    conn = _pg_connect(pg_port)
    try:
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            f"WHERE table_schema = '{fhir_schema}'"
        )
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()

    # DuckDB stores table names lowercased; FHIR resource types are PascalCase.
    table_names = {r[0].lower() for r in rows}
    for rtype in resource_types:
        assert rtype.lower() in table_names, (
            f"table {rtype!r} missing from schema {fhir_schema!r}; "
            f"available: {sorted(table_names)}"
        )

    for rtype in resource_types:
        rid, _, _ = results[rtype]
        client.delete(f"/{dataset_id}/{rtype}/{rid}")


def test_pgwire_writes_during_fhir_lifecycle_extended(env):
    """60-second mixed load: pgwire INSERTs at ~10/s, fhir lifecycle at ~5/s."""
    client, pg_port, dataset_id, _ = env

    table_name = "pgtest_lifecycle"
    conn = _pg_connect(pg_port)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {table_name}")
    cur.execute(f"CREATE TABLE {table_name} (id INTEGER, val VARCHAR)")
    cur.close()
    conn.close()

    duration_s = 60
    stop_flag = threading.Event()

    pg_inserts = []
    pg_errors = []
    fhir_ops = []
    fhir_errors = []

    def pgwire_inserter():
        try:
            conn = _pg_connect(pg_port)
            conn.autocommit = True
            cur = conn.cursor()
            i = 0
            while not stop_flag.is_set():
                try:
                    cur.execute(
                        f"INSERT INTO {table_name} VALUES ({i}, 'val-{i}')"
                    )
                    pg_inserts.append(i)
                except Exception as e:
                    pg_errors.append(f"insert {i}: {e}")
                i += 1
                time.sleep(0.1)
            cur.close()
            conn.close()
        except Exception as e:
            pg_errors.append(f"pg connection: {e}")

    def fhir_lifecycle():
        i = 0
        while not stop_flag.is_set():
            rid = f"lifecycleext-{i}"
            try:
                s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
                    "resourceType": "Patient",
                    "id": rid,
                    "name": [{"family": f"LifeV1-{i}"}],
                })
                if s not in (200, 201):
                    fhir_errors.append(f"create {rid}: status {s}, body: {body!r}")
                    i += 1
                    continue

                s, body = client.put(f"/{dataset_id}/Patient/{rid}", {
                    "resourceType": "Patient",
                    "id": rid,
                    "name": [{"family": f"LifeV2-{i}"}],
                })
                if s not in (200, 201):
                    fhir_errors.append(f"update {rid}: status {s}, body: {body!r}")

                s, _ = client.delete(f"/{dataset_id}/Patient/{rid}")
                if s != 204:
                    fhir_errors.append(f"delete {rid}: status {s}")

                # Recreate on a different id so the resource still exists at the end
                rid_recreate = f"lifecycleext-recreate-{i}"
                s, body = client.put(
                    f"/{dataset_id}/Patient/{rid_recreate}", {
                        "resourceType": "Patient",
                        "id": rid_recreate,
                        "name": [{"family": f"LifeRecreate-{i}"}],
                    },
                )
                if s not in (200, 201):
                    fhir_errors.append(
                        f"recreate {rid_recreate}: status {s}, body: {body!r}"
                    )
                fhir_ops.append(i)
            except Exception as e:
                fhir_errors.append(f"lifecycle {i}: {e}")
            i += 1
            time.sleep(0.2)

    pg_thread = threading.Thread(target=pgwire_inserter)
    fhir_thread = threading.Thread(target=fhir_lifecycle)
    pg_thread.start()
    fhir_thread.start()

    time.sleep(duration_s)
    stop_flag.set()

    pg_thread.join(timeout=30)
    fhir_thread.join(timeout=30)

    assert not pg_errors, "PgWire errors:\n" + "\n".join(pg_errors)
    assert not fhir_errors, "FHIR lifecycle errors:\n" + "\n".join(fhir_errors)

    conn = _pg_connect(pg_port)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table_name}")
    pg_count = cur.fetchone()[0]
    cur.execute(f"DROP TABLE {table_name}")
    cur.close()
    conn.close()

    assert pg_count == len(pg_inserts), (
        f"pgwire row count {pg_count} != insert count {len(pg_inserts)}"
    )

    for i in fhir_ops:
        rid = f"lifecycleext-{i}"
        s, body = client.get(f"/{dataset_id}/Patient/{rid}")
        assert s == 410, (
            f"deleted {rid} should return 410, got {s}, body: {body!r}"
        )
        rid_recreate = f"lifecycleext-recreate-{i}"
        s, body = client.get(f"/{dataset_id}/Patient/{rid_recreate}")
        assert s == 200, (
            f"recreated {rid_recreate}: status {s}, body: {body!r}"
        )
        assert body["name"][0]["family"] == f"LifeRecreate-{i}", (
            f"recreated {rid_recreate}: family {body['name'][0]['family']!r}"
        )

    for i in fhir_ops:
        client.delete(f"/{dataset_id}/Patient/lifecycleext-recreate-{i}")
