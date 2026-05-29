"""Full-lifecycle ETL test: copy_and_cdc covers snapshot + streaming.

Existing regression tests cover copy_only and CDC-shutdown corner cases. This
test fills the snapshot-then-streaming gap: start a pipeline in copy_and_cdc
mode, verify snapshot rows arrive, then INSERT new rows in the source and
verify they stream through to the destination.

Assumes trexsql-trex-1 is running on port 5433.
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

SOURCE_CONTAINER = f"etl-lifecycle-{uuid.uuid4().hex[:8]}"
SOURCE_NETWORK = "trexsql_default"
SOURCE_USER = "replicator"
SOURCE_PASSWORD = "replpass"
SOURCE_DB = "postgres"
SOURCE_TABLE = "lifecycle_sample"
SOURCE_PUB = "lifecycle_pub"
SNAPSHOT_ROW_COUNT = 5
STREAM_ROW_COUNT = 3

PIPELINE_NAME = f"life_{uuid.uuid4().hex[:8]}"


def _docker(*args, check=True, capture=True):
    return subprocess.run(
        ["docker", *args],
        check=check,
        capture_output=capture,
        text=True,
    )


def _trex_exec(sql):
    """Execute SQL against the trex pgwire endpoint and return list-of-tuples."""
    if psycopg is None:
        pytest.skip("psycopg/psycopg2 not installed")
    conn = psycopg.connect(
        host=PGWIRE_HOST, port=PGWIRE_PORT, user=PGWIRE_USER,
        password=PGWIRE_PASSWORD, dbname=PGWIRE_DB,
        connect_timeout=5,
    )
    try:
        if PSYCOPG_VERSION == 3:
            conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
            try:
                return cur.fetchall()
            except psycopg.ProgrammingError:
                return []
    finally:
        if PSYCOPG_VERSION == 2 and not getattr(conn, "autocommit", False):
            try:
                conn.commit()
            except Exception as e:
                logger.debug("ignoring %s: %s", type(e).__name__, e)
        conn.close()


def _wait_for_state(name, target_states, timeout_s=60.0, interval_s=0.5):
    """Poll trex_etl_status() until pipeline state is in target_states or timeout."""
    deadline = time.monotonic() + timeout_s
    last_state = None
    while time.monotonic() < deadline:
        rows = _trex_exec(
            f"SELECT name, state FROM trex_etl_status() WHERE name = '{name}'"
        )
        if rows:
            last_state = rows[0][1]
            if last_state in target_states:
                return last_state
        time.sleep(interval_s)
    raise AssertionError(
        f"Pipeline '{name}' did not reach {target_states} within {timeout_s}s "
        f"(last state: {last_state!r})"
    )


def _wait_for_rows(name, min_rows, timeout_s=60.0, interval_s=0.5):
    deadline = time.monotonic() + timeout_s
    last = 0
    while time.monotonic() < deadline:
        rows = _trex_exec(
            f"SELECT rows_replicated FROM trex_etl_status() WHERE name = '{name}'"
        )
        if rows:
            raw = rows[0][0]
            # rows_replicated is exposed as VARCHAR — coerce, treating NULL/empty as 0.
            last = int(raw) if raw not in (None, "") else 0
            if last >= min_rows:
                return last
        time.sleep(interval_s)
    raise AssertionError(
        f"Pipeline '{name}' rows_replicated stayed at {last} (< {min_rows}) "
        f"after {timeout_s}s"
    )


def _check_trex_running():
    res = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        capture_output=True, text=True, check=False,
    )
    names = res.stdout.split()
    return "trexsql-trex-1" in names


def _setup_source():
    """Create a postgres:16 container with logical replication, seed table, publication."""
    _docker("run", "-d",
        "--name", SOURCE_CONTAINER,
        "--network", SOURCE_NETWORK,
        "-e", "POSTGRES_PASSWORD=postgres",
        "postgres:16",
        "postgres",
        "-c", "wal_level=logical",
        "-c", "max_wal_senders=4",
        "-c", "max_replication_slots=4",
    )
    # Wait for postgres to accept connections.
    for _ in range(30):
        r = _docker("exec", SOURCE_CONTAINER, "pg_isready", "-U", "postgres",
                    check=False, capture=True)
        if r.returncode == 0:
            break
        time.sleep(0.5)
    else:
        raise RuntimeError("source postgres never became ready")

    def psql(sql):
        return _docker("exec", SOURCE_CONTAINER, "psql", "-U", "postgres",
                       "-d", SOURCE_DB, "-c", sql)

    psql(f"CREATE ROLE {SOURCE_USER} WITH LOGIN REPLICATION PASSWORD '{SOURCE_PASSWORD}'")
    psql(f"CREATE TABLE {SOURCE_TABLE} (id INTEGER PRIMARY KEY, val TEXT)")
    psql(f"GRANT ALL ON {SOURCE_TABLE} TO {SOURCE_USER}")
    psql(f"GRANT ALL ON SCHEMA public TO {SOURCE_USER}")
    for i in range(1, SNAPSHOT_ROW_COUNT + 1):
        psql(f"INSERT INTO {SOURCE_TABLE} VALUES ({i}, 'snap_{i}')")
    psql(f"CREATE PUBLICATION {SOURCE_PUB} FOR TABLE {SOURCE_TABLE}")


def _teardown_source():
    _docker("rm", "-f", SOURCE_CONTAINER, check=False, capture=True)
    # Drop replicated table in trex (best-effort).
    try:
        _trex_exec(f'DROP TABLE IF EXISTS "public"."{SOURCE_TABLE}"')
    except Exception as e:
        logger.debug("ignoring %s: %s", type(e).__name__, e)


@pytest.fixture(scope="module")
def trex_available():
    if not _check_trex_running():
        pytest.skip("trexsql-trex-1 container is not running")


def test_etl_full_lifecycle_copy_and_cdc(trex_available):
    """Start copy_and_cdc pipeline, verify snapshot + streaming, stop cleanly."""
    _setup_source()
    try:
        conn_str = (
            f"host={SOURCE_CONTAINER} port=5432 dbname={SOURCE_DB} "
            f"user={SOURCE_USER} password={SOURCE_PASSWORD} "
            f"publication={SOURCE_PUB}"
        )
        _trex_exec(
            f"SELECT trex_etl_start('{PIPELINE_NAME}', '{conn_str}', "
            f"'copy_and_cdc', 100, 1000, 1000, 3)"
        )

        # Pipeline must move past 'starting' within 60s.
        _wait_for_state(PIPELINE_NAME, {"snapshotting", "streaming"}, timeout_s=60)

        # Snapshot rows must arrive.
        _wait_for_rows(PIPELINE_NAME, SNAPSHOT_ROW_COUNT, timeout_s=60)

        # Eventually reach streaming.
        _wait_for_state(PIPELINE_NAME, {"streaming"}, timeout_s=60)

        # Insert additional rows post-snapshot; they must stream through.
        def psql_source(sql):
            return _docker("exec", SOURCE_CONTAINER, "psql", "-U", "postgres",
                           "-d", SOURCE_DB, "-c", sql)
        for i in range(SNAPSHOT_ROW_COUNT + 1, SNAPSHOT_ROW_COUNT + STREAM_ROW_COUNT + 1):
            psql_source(f"INSERT INTO {SOURCE_TABLE} VALUES ({i}, 'cdc_{i}')")

        total = SNAPSHOT_ROW_COUNT + STREAM_ROW_COUNT
        _wait_for_rows(PIPELINE_NAME, total, timeout_s=60)

        # Verify destination has all rows. Allow a short retry because
        # rows_replicated may be incremented slightly before the destination
        # row is visible to a SELECT.
        deadline = time.monotonic() + 10.0
        last_count = None
        while time.monotonic() < deadline:
            rows = _trex_exec(f'SELECT count(*) FROM "public"."{SOURCE_TABLE}"')
            last_count = rows[0][0]
            if last_count == total:
                break
            time.sleep(0.5)
        assert last_count == total, (
            f"destination row count: expected {total}, got {last_count}"
        )

        # Stop cleanly.
        _trex_exec(f"SELECT trex_etl_stop('{PIPELINE_NAME}')")
        status = _trex_exec(
            f"SELECT name FROM trex_etl_status() WHERE name = '{PIPELINE_NAME}'"
        )
        assert status == [], f"pipeline still listed after stop: {status}"
    finally:
        # Best-effort stop in case the test failed before reaching the stop call.
        try:
            _trex_exec(f"SELECT trex_etl_stop('{PIPELINE_NAME}')")
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)
        _teardown_source()
