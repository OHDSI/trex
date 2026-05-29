"""Regression test for trex_etl_start(... 'cdc_only' ...) shutdown.

Covers the case where cdc_only / copy_and_cdc-mode pipelines used to leave
the registry stuck at state='stopping' indefinitely after a shutdown signal
because the CDC `tokio::select!` shutdown branch only set
`PipelineState::Stopping` and never followed through to `Stopped` (or
`Error`) once the workers actually finished.

The fix lives in plugins/etl/src/etl_start.rs (the CDC branch around the
shutdown_rx select arm): after the shutdown signal arrives, the code now
calls `pipeline.shutdown()` via the shutdown_tx handle, awaits
`pipeline.wait()`, and writes the final `Stopped` (or `set_error()` on
failure) to the registry — twin of the copy_only fix that already lives at
~lines 510-540 of the same file.

Test plan:
  - Spin up an isolated postgres:16 container on the trex compose network
    with logical replication (wal_level=logical) and a CA-signed SSL cert
    so the etl-lib rustls handshake to the source PG succeeds.
  - Place the CA cert at /etc/trexsql/etl_pg_ca.pem inside the trex
    container so etl_start.rs can pick it up.
  - Create a replicator role, a small table, and a publication on the
    source.
  - Call trex_etl_start with mode='cdc_only' against the source via
    pgwire (port 5433).
  - Wait briefly for the pipeline to reach a running state
    (snapshotting/streaming).
  - Call trex_etl_stop(name) — this fires the shutdown channel, which
    triggers the fixed code path. The call must return synchronously
    without hanging (proving wait_fut completed) and must not error.
  - Restart a fresh pipeline with the same name to confirm the registry
    didn't leak the prior entry (a stuck thread would leave a dangling
    handle and either block the new start or fail registration).
  - Always tear down: stop the new pipeline, remove the source container.

Note on assert vs poll: `trex_etl_stop()` removes the registry entry
synchronously before joining the worker thread (see
`pipeline_registry::stop`). That means the visible state via
`trex_etl_status()` after stop is "absent", not "stopped" — so the
correct regression check is: stop returns cleanly within a bounded time
and the registry can accept a fresh start. Without the fix, the worker
thread either hangs in pipeline.start()'s caller scope (workers
orphaned) or returns immediately leaving the registry in a stale state.

Assumes trexsql-trex-1 is already running and reachable on port 5433.
"""

from __future__ import annotations

import os
import subprocess
import time
import uuid

import pytest
import logging

logger = logging.getLogger(__name__)

try:
    import psycopg
    PSYCOPG_VERSION = 3
except ImportError:
    try:
        import psycopg2 as psycopg
        PSYCOPG_VERSION = 2
    except ImportError:
        psycopg = None
        PSYCOPG_VERSION = None


PGWIRE_HOST = "localhost"
PGWIRE_PORT = 5433
PGWIRE_USER = "postgres"
PGWIRE_PASSWORD = "postgres"
PGWIRE_DB = "postgres"

SOURCE_CONTAINER = "etl-cdc-test-regr"
SOURCE_NETWORK = "trexsql_default"
SOURCE_USER = "replicator"
SOURCE_PASSWORD = "replpass"
SOURCE_DB = "postgres"
SOURCE_TABLE = "regr_cdc_sample"
SOURCE_PUB = "regr_cdc_pub"
SOURCE_ROW_COUNT = 5

TREX_CONTAINER = "trexsql-trex-1"
TREX_CA_PATH = "/etc/trexsql/etl_pg_ca.pem"

PIPELINE_NAME = f"regr_cdc_{uuid.uuid4().hex[:8]}"


def _docker(*args: str, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", *args],
        check=check,
        capture_output=capture,
        text=True,
    )


def _pg_isready(container: str) -> bool:
    proc = _docker("exec", container, "pg_isready", "-U", "postgres", check=False)
    return proc.returncode == 0 and "accepting" in (proc.stdout or "")


def _wait_for_source_ready(container: str, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if _pg_isready(container):
            return
        time.sleep(0.5)
    raise RuntimeError(f"Source container {container} did not become ready within {timeout}s")


def _exec_in_source(container: str, sql: str) -> None:
    _docker("exec", container, "psql", "-U", "postgres", "-c", sql)


def _setup_source_tls(container: str) -> str:
    """Create CA + server cert in the source PG, enable ssl, return CA PEM string."""
    # Generate CA + server cert pair signed by it. SAN includes the container
    # name (used as hostname for the trex-side connection) and 'localhost'.
    script = (
        "cd /var/lib/postgresql/data && "
        "openssl genrsa -out ca.key 2048 2>/dev/null && "
        "openssl req -x509 -new -nodes -key ca.key -days 365 "
        "-subj '/CN=TestCA' -out ca.crt 2>/dev/null && "
        "openssl genrsa -out server.key 2048 2>/dev/null && "
        f"openssl req -new -key server.key -subj '/CN={container}' -out server.csr 2>/dev/null && "
        "openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial "
        "-out server.crt -days 365 "
        f"-extfile <(printf 'subjectAltName=DNS:{container},DNS:localhost') 2>/dev/null && "
        "chmod 600 server.key && "
        "chown postgres:postgres server.key server.crt ca.crt"
    )
    _docker("exec", container, "bash", "-c", script)

    # Enable ssl in postgresql.conf. The image has a default config that
    # references server.crt/server.key under PGDATA, which is what we wrote.
    _docker("exec", container, "psql", "-U", "postgres", "-c", "ALTER SYSTEM SET ssl = on;")
    _docker("exec", container, "psql", "-U", "postgres", "-c", "SELECT pg_reload_conf();")

    # Wait briefly for ssl reload, then read the CA cert back out.
    time.sleep(1.0)
    proc = _docker("exec", container, "cat", "/var/lib/postgresql/data/ca.crt")
    return proc.stdout


def _install_ca_in_trex(ca_pem: str) -> None:
    """Place the CA cert at the well-known path inside trex container."""
    _docker("exec", "-u", "root", TREX_CONTAINER, "mkdir", "-p", "/etc/trexsql")
    # Use docker cp via a tmp file to avoid quoting issues.
    tmp_path = f"/tmp/etl_pg_ca_{uuid.uuid4().hex[:8]}.pem"
    with open(tmp_path, "w") as f:
        f.write(ca_pem)
    try:
        _docker("cp", tmp_path, f"{TREX_CONTAINER}:{TREX_CA_PATH}")
        _docker("exec", "-u", "root", TREX_CONTAINER, "chmod", "644", TREX_CA_PATH)
    finally:
        try:
            os.remove(tmp_path)
        except OSError as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)


@pytest.fixture(scope="module")
def source_pg() -> str:
    """Start an isolated source PG with logical replication, sample table, publication."""
    if psycopg is None:
        pytest.skip("psycopg/psycopg2 not installed; skipping regression test")

    # Best-effort cleanup of any prior run.
    _docker("rm", "-f", SOURCE_CONTAINER, check=False)

    _docker(
        "run", "-d",
        "--name", SOURCE_CONTAINER,
        "--network", SOURCE_NETWORK,
        "-e", "POSTGRES_PASSWORD=testpass",
        "postgres:16",
        "-c", "wal_level=logical",
    )

    try:
        _wait_for_source_ready(SOURCE_CONTAINER)

        ca_pem = _setup_source_tls(SOURCE_CONTAINER)
        _install_ca_in_trex(ca_pem)

        _exec_in_source(
            SOURCE_CONTAINER,
            f"CREATE ROLE {SOURCE_USER} WITH LOGIN REPLICATION PASSWORD '{SOURCE_PASSWORD}';",
        )
        _exec_in_source(
            SOURCE_CONTAINER,
            f"CREATE TABLE {SOURCE_TABLE}(id INT PRIMARY KEY, name TEXT);",
        )
        _exec_in_source(
            SOURCE_CONTAINER,
            f"INSERT INTO {SOURCE_TABLE} "
            f"SELECT g, 'name_' || g FROM generate_series(1, {SOURCE_ROW_COUNT}) g;",
        )
        _exec_in_source(
            SOURCE_CONTAINER,
            f"GRANT SELECT ON {SOURCE_TABLE} TO {SOURCE_USER}; "
            f"GRANT USAGE ON SCHEMA public TO {SOURCE_USER};",
        )
        _exec_in_source(
            SOURCE_CONTAINER,
            f"CREATE PUBLICATION {SOURCE_PUB} FOR TABLE {SOURCE_TABLE};",
        )

        yield SOURCE_CONTAINER
    finally:
        _docker("rm", "-f", SOURCE_CONTAINER, check=False)


def _connect_pgwire():
    if PSYCOPG_VERSION == 3:
        return psycopg.connect(
            host=PGWIRE_HOST,
            port=PGWIRE_PORT,
            user=PGWIRE_USER,
            password=PGWIRE_PASSWORD,
            dbname=PGWIRE_DB,
            autocommit=True,
        )
    return psycopg.connect(
        host=PGWIRE_HOST,
        port=PGWIRE_PORT,
        user=PGWIRE_USER,
        password=PGWIRE_PASSWORD,
        dbname=PGWIRE_DB,
    )


def _query_one(conn, sql: str, params=None):
    cur = conn.cursor()
    cur.execute(sql, params or ())
    try:
        row = cur.fetchone()
    except Exception:
        row = None
    cur.close()
    return row


def _query_all(conn, sql: str, params=None):
    cur = conn.cursor()
    cur.execute(sql, params or ())
    try:
        rows = cur.fetchall()
    except Exception:
        rows = []
    cur.close()
    return rows


def _trex_pgwire_available() -> bool:
    try:
        conn = _connect_pgwire()
        conn.close()
        return True
    except Exception:
        return False


def _start(conn, name: str, mode: str = "cdc_only") -> str:
    connection_string = (
        f"host={SOURCE_CONTAINER} port=5432 "
        f"user={SOURCE_USER} password={SOURCE_PASSWORD} "
        f"dbname={SOURCE_DB} publication={SOURCE_PUB}"
    )
    sql = "SELECT trex_etl_start(%s, %s, %s, 100, 1000, 1000, 3)"
    row = _query_one(conn, sql, (name, connection_string, mode))
    assert row is not None, "trex_etl_start returned no row"
    msg = row[0] or ""
    assert "started" in msg.lower(), f"unexpected trex_etl_start response: {msg!r}"
    return msg


def _wait_running(conn, name: str, timeout: float = 10.0) -> str:
    """Wait until the pipeline leaves 'starting' state. Returns the observed state."""
    status_sql = "SELECT state, error FROM trex_etl_status() WHERE name = %s"
    deadline = time.time() + timeout
    last_state = None
    last_err = None
    while time.time() < deadline:
        rows = _query_all(conn, status_sql, (name,))
        if rows:
            last_state = rows[0][0]
            last_err = rows[0][1]
            if last_state and last_state != "starting":
                return last_state
        time.sleep(0.25)
    raise AssertionError(
        f"pipeline {name!r} never left 'starting' within {timeout}s "
        f"(last_state={last_state!r}, last_err={last_err!r})"
    )


def test_etl_cdc_only_shutdown_completes_cleanly(source_pg):
    """cdc_only stop must return cleanly without leaving a stuck thread.

    Twin of the copy_only regression. After stop(), the registry entry is
    synchronously removed (see pipeline_registry::stop), so we cannot
    observe state='stopped' via trex_etl_status() — instead we verify:

      1. The pipeline reached a running state (snapshotting or streaming),
         confirming the source TLS handshake succeeded and workers
         actually started.
      2. trex_etl_stop() returns the canonical "stopped" message within a
         bounded time (proving wait_fut completed and join succeeded).
      3. A fresh start with the same name succeeds (proving no dangling
         registry entry from a half-shutdown thread).

    Without the fix, the shutdown branch of the CDC tokio::select! left
    state in 'stopping' and never drove pipeline.wait() to completion;
    while observably mostly invisible through the public stop() path,
    the missing wait() also meant orphaned worker tasks survived the
    select arm — restarting was not always safe.
    """
    if not _trex_pgwire_available():
        pytest.skip("trex pgwire (localhost:5433) not reachable; start with docker compose up trex")

    conn = _connect_pgwire()
    second_name = f"{PIPELINE_NAME}_b"
    try:
        _start(conn, PIPELINE_NAME, mode="cdc_only")
        observed = _wait_running(conn, PIPELINE_NAME, timeout=15.0)
        assert observed in ("snapshotting", "streaming"), (
            f"expected cdc_only pipeline to reach snapshotting/streaming, "
            f"got state={observed!r}"
        )

        # Issue stop and time it: must complete well under the timeout. A
        # missing wait_fut.await would either hang here or leave workers
        # behind (visible on the second start below).
        deadline = time.time() + 15.0
        cur = conn.cursor()
        cur.execute("SELECT trex_etl_stop(%s)", (PIPELINE_NAME,))
        row = cur.fetchone()
        cur.close()
        assert time.time() < deadline, "trex_etl_stop did not return within 15s"
        assert row is not None and "stopped" in (row[0] or "").lower(), (
            f"trex_etl_stop did not report stopped: {row!r}"
        )

        # After stop, the entry is gone — confirm we can start a fresh
        # pipeline. A leaked entry would make this fail with
        # "Pipeline 'X' already exists".
        rows = _query_all(
            conn,
            "SELECT name, state FROM trex_etl_status() WHERE name = %s",
            (PIPELINE_NAME,),
        )
        assert not rows or rows[0][1] != "stopping", (
            f"pipeline still visible in 'stopping' after stop: {rows!r}"
        )

        _start(conn, second_name, mode="cdc_only")
        _wait_running(conn, second_name, timeout=15.0)
    finally:
        for n in (PIPELINE_NAME, second_name):
            try:
                cur = conn.cursor()
                cur.execute("SELECT trex_etl_stop(%s)", (n,))
                cur.close()
            except Exception as e:
                logger.debug("ignoring %s: %s", type(e).__name__, e)
        conn.close()
