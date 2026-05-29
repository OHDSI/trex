"""Regression test for trex_etl_start(... 'copy_only' ...).

Covers the case where copy_only-mode pipelines used to get stuck in
state='starting' with rows_replicated=0 because:

  1. The DuckDB postgres scanner forwards the connection string to
     libpq, which rejects ETL-specific keys ('publication', 'schema')
     with `invalid connection option`.
  2. The pipeline thread captured the error from ATTACH but returned
     it from the spawned closure without ever calling
     `set_error()`/`update_state(Stopped)` — the registry stayed at
     its last set state forever.

The fix lives in plugins/etl/src/etl_start.rs:
  - `strip_non_libpq_params()` strips publication=/schema= before ATTACH.
  - The closure result is matched after the session is destroyed and
    early-step failures call `set_error()` so the registry transitions
    out of 'starting'.

Test plan:
  - Spin up an isolated postgres:16 container on the trex compose
    network with logical replication enabled.
  - Create a replicator role, a small table with 10 rows, and a
    publication.
  - Call trex_etl_start with mode='copy_only' against this source
    via pgwire (port 5433).
  - Poll trex_etl_status until state != 'starting' (timeout 30s).
  - Assert state == 'stopped' and rows_replicated > 0.
  - Always tear down: stop and remove the source container; drop
    the replicated table from the trex DuckDB.

Assumes trexsql-trex-1 is already running and reachable on port 5433.
"""

from __future__ import annotations

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

SOURCE_CONTAINER = "etl-copy-test-regr"
SOURCE_NETWORK = "trexsql_default"
SOURCE_USER = "replicator"
SOURCE_PASSWORD = "replpass"
SOURCE_DB = "postgres"
SOURCE_TABLE = "regr_sample"
SOURCE_PUB = "regr_pub"
SOURCE_ROW_COUNT = 10

PIPELINE_NAME = f"regr_cp_{uuid.uuid4().hex[:8]}"


def _docker(*args: str, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", *args],
        check=check,
        capture_output=capture,
        text=True,
    )


def _pg_isready(container: str) -> bool:
    proc = _docker(
        "exec", container, "pg_isready", "-U", "postgres",
        check=False,
    )
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


@pytest.fixture(scope="module")
def source_pg() -> str:
    """Start an isolated source PG with logical replication, sample table, publication.

    Yields the container name. Tears down on exit even if the test fails.
    """
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


def test_etl_copy_only_completes_to_stopped(source_pg):
    """copy_only pipeline must reach state='stopped' with rows_replicated>0."""
    if not _trex_pgwire_available():
        pytest.skip("trex pgwire (localhost:5433) not reachable; start with docker compose up trex")

    conn = _connect_pgwire()
    try:
        connection_string = (
            f"host={SOURCE_CONTAINER} port=5432 "
            f"user={SOURCE_USER} password={SOURCE_PASSWORD} "
            f"dbname={SOURCE_DB} publication={SOURCE_PUB}"
        )

        start_sql = (
            "SELECT trex_etl_start(%s, %s, 'copy_only', 100, 1000, 1000, 3)"
        )
        if PSYCOPG_VERSION == 2:
            cur = conn.cursor()
            cur.execute(start_sql, (PIPELINE_NAME, connection_string))
            response = cur.fetchone()
            cur.close()
            if not getattr(conn, "autocommit", False):
                conn.commit()
        else:
            response = _query_one(conn, start_sql, (PIPELINE_NAME, connection_string))

        assert response is not None
        assert "started" in (response[0] or "").lower(), \
            f"unexpected trex_etl_start response: {response!r}"

        # Poll status until we leave 'starting'.
        status_sql = (
            "SELECT name, state, mode, rows_replicated, error "
            "FROM trex_etl_status() WHERE name = %s"
        )

        deadline = time.time() + 30.0
        last_row = None
        while time.time() < deadline:
            rows = _query_all(conn, status_sql, (PIPELINE_NAME,))
            if rows:
                last_row = rows[0]
                state = last_row[1]
                if state and state != "starting":
                    if state in ("stopped", "error"):
                        break
            time.sleep(0.5)

        assert last_row is not None, \
            "pipeline never appeared in trex_etl_status()"

        name, state, mode, rows_replicated, error = last_row
        assert state == "stopped", (
            f"expected state='stopped', got state={state!r} "
            f"(rows_replicated={rows_replicated}, error={error!r})"
        )
        assert mode == "copy_only", f"unexpected mode {mode!r}"
        # rows_replicated is exposed as VARCHAR — coerce.
        rows_int = int(rows_replicated) if rows_replicated not in (None, "") else 0
        assert rows_int >= SOURCE_ROW_COUNT, (
            f"expected rows_replicated >= {SOURCE_ROW_COUNT}, got {rows_int}"
        )
        assert error in (None, ""), f"unexpected error: {error!r}"
    finally:
        # Best-effort: stop the pipeline (may already be stopped) and drop
        # the replicated table so reruns are clean.
        try:
            cur = conn.cursor()
            cur.execute("SELECT trex_etl_stop(%s)", (PIPELINE_NAME,))
            cur.close()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)
        try:
            cur = conn.cursor()
            cur.execute(f"DROP TABLE IF EXISTS {SOURCE_TABLE}")
            cur.close()
            if not getattr(conn, "autocommit", False):
                conn.commit()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)
        conn.close()
