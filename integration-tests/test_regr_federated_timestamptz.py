"""Regression test for federated PostgreSQL TIMESTAMPTZ scans.

Reading any TIMESTAMPTZ column across an ATTACH ... TYPE postgres boundary
used to crash the trex engine (SIGTERM, signal 15) before the rows ever
reached the pgwire client.

Even a tightly scoped ``SELECT placed_at FROM pg.public.dttest LIMIT 1``
was enough to terminate the process. A ``::TIMESTAMP`` cast on the trex
side did not help because the cast happens after the scan; only a
``::TEXT`` push-down (which makes postgres return VARCHAR before it
crosses the trex boundary) was a viable workaround.

Investigation traced this to a schema declaration mismatch between
``plugins/db/src/duckdb_table_provider.rs`` and the actual Arrow output
of duckdb's postgres_scanner extension. trex declared the column as
``Timestamp(Microsecond, Some("UTC"))`` while postgres_scanner emits the
session timezone string (e.g. ``Etc/UTC``). Any subsequent operation
that relied on the declared schema saw a buffer typed differently from
its declaration and aborted.

The fix declares TIMESTAMPTZ as ``Timestamp(Microsecond, None)`` in the
static mapping and lets ``probe_actual_arrow_schema`` re-attach the real
timezone string at registration time.

Test plan:
  - Connect to the trex compose-network postgres (testdb).
  - Create a TIMESTAMPTZ table with a few representative rows.
  - From trex pgwire, run ATTACH ... TYPE postgres against the same PG
    via the compose-network host alias.
  - Issue queries that previously crashed the engine:
      * SELECT col FROM pg.public.regr_tstz LIMIT 5
      * SELECT * FROM pg.public.regr_tstz LIMIT 5
      * SELECT DATE_TRUNC('hour', col) FROM pg.public.regr_tstz LIMIT 5
  - Assert each query returns rows without losing the connection.
  - Cleanup: DETACH the federation alias and drop the source table.

Assumes trexsql-trex-1 and trexsql-postgres are already running.
"""

from __future__ import annotations

import subprocess
import uuid

import pytest

try:
    import psycopg
    PSYCOPG_VERSION = 3
except ImportError:  # pragma: no cover - depends on host env
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

# These match docker-compose.yml; the trex container reaches the
# metadata pg via the docker-network alias trexsql-postgres:5432.
SOURCE_CONTAINER = "trexsql-postgres"
SOURCE_PG_USER = "postgres"
SOURCE_PG_PASSWORD = "mypass"
SOURCE_PG_DB = "testdb"
SOURCE_PG_HOST_INSIDE = "trexsql-postgres"
SOURCE_PG_PORT_INSIDE = 5432

# Unique to avoid clashes with concurrent runs of the same suite.
RUN_TAG = uuid.uuid4().hex[:8]
SOURCE_TABLE = f"regr_tstz_{RUN_TAG}"
ATTACH_ALIAS = f"regr_pg_tstz_{RUN_TAG}"


def _docker(*args: str, check: bool = True, capture: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", *args],
        check=check,
        capture_output=capture,
        text=True,
    )


def _exec_in_source(sql: str) -> None:
    _docker(
        "exec",
        SOURCE_CONTAINER,
        "psql",
        "-U", SOURCE_PG_USER,
        "-d", SOURCE_PG_DB,
        "-c", sql,
    )


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


def _trex_pgwire_available() -> bool:
    try:
        conn = _connect_pgwire()
        conn.close()
        return True
    except Exception:
        return False


def _source_pg_available() -> bool:
    try:
        proc = _docker(
            "exec", SOURCE_CONTAINER,
            "pg_isready", "-U", SOURCE_PG_USER, "-d", SOURCE_PG_DB,
            check=False,
        )
        return proc.returncode == 0
    except Exception:
        return False


def _query_all(conn, sql: str, params=None):
    cur = conn.cursor()
    cur.execute(sql, params or ())
    try:
        rows = cur.fetchall()
    except Exception:
        rows = []
    cur.close()
    return rows


@pytest.fixture(scope="module")
def source_table():
    """Create + populate the TIMESTAMPTZ source table; drop on teardown."""
    if psycopg is None:
        pytest.skip("psycopg/psycopg2 not installed; skipping regression test")
    if not _source_pg_available():
        pytest.skip(f"source pg ({SOURCE_CONTAINER}) not reachable")

    _exec_in_source(f"DROP TABLE IF EXISTS public.{SOURCE_TABLE};")
    _exec_in_source(
        f"CREATE TABLE public.{SOURCE_TABLE} ("
        f"  id SERIAL PRIMARY KEY,"
        f"  placed_at TIMESTAMPTZ NOT NULL,"
        f"  label TEXT"
        f");"
    )
    _exec_in_source(
        f"INSERT INTO public.{SOURCE_TABLE} (placed_at, label) VALUES "
        f"  ('2026-01-15 10:30:00+00', 'one'),"
        f"  ('2026-02-20 12:45:30+00', 'two'),"
        f"  ('2026-03-25 13:00:00+00', 'three'),"
        f"  ('2026-04-01 00:00:00+02', 'four_with_offset'),"
        f"  ('2026-05-06 23:59:59+00', 'five');"
    )

    try:
        yield SOURCE_TABLE
    finally:
        _exec_in_source(f"DROP TABLE IF EXISTS public.{SOURCE_TABLE};")


def test_federated_pg_timestamptz_does_not_crash_engine(source_table):
    """Reading TIMESTAMPTZ over ATTACH ... TYPE postgres must not SIGTERM trex.

    Failure mode (pre-fix): the trex container exits with code 0 / signal 15
    on the first batch of TIMESTAMPTZ data, the pgwire connection drops with
    'server closed the connection unexpectedly', and the next test in the
    file fails with 'Connection refused' because trex is still restarting.
    """
    if not _trex_pgwire_available():
        pytest.skip("trex pgwire (localhost:5433) not reachable")

    conn = _connect_pgwire()
    try:
        attach_sql = (
            f"ATTACH IF NOT EXISTS "
            f"'postgresql://{SOURCE_PG_USER}:{SOURCE_PG_PASSWORD}"
            f"@{SOURCE_PG_HOST_INSIDE}:{SOURCE_PG_PORT_INSIDE}/{SOURCE_PG_DB}' "
            f"AS {ATTACH_ALIAS} (TYPE postgres)"
        )
        cur = conn.cursor()
        cur.execute(attach_sql)
        cur.close()

        # 1. Single-column scan — the original repro.
        col_rows = _query_all(
            conn,
            f"SELECT placed_at FROM {ATTACH_ALIAS}.public.{source_table} LIMIT 5",
        )
        assert len(col_rows) >= 1, "no rows returned for single-column TIMESTAMPTZ scan"
        assert all(r[0] is not None for r in col_rows), \
            f"unexpected NULLs in placed_at column: {col_rows!r}"

        # 2. SELECT * — full row including the TIMESTAMPTZ column.
        all_rows = _query_all(
            conn,
            f"SELECT * FROM {ATTACH_ALIAS}.public.{source_table} LIMIT 5",
        )
        assert len(all_rows) >= 1, "no rows returned for SELECT * over federated PG"
        # Sanity: the placed_at value is the second column per the table DDL.
        assert all(r[1] is not None for r in all_rows), \
            f"unexpected NULL placed_at in SELECT * rows: {all_rows!r}"

        # 3. DATE_TRUNC pushed down through the federation boundary.
        trunc_rows = _query_all(
            conn,
            f"SELECT DATE_TRUNC('hour', placed_at) "
            f"FROM {ATTACH_ALIAS}.public.{source_table} LIMIT 5",
        )
        assert len(trunc_rows) >= 1, "no rows returned for DATE_TRUNC over federated TIMESTAMPTZ"
        assert all(r[0] is not None for r in trunc_rows), \
            f"unexpected NULLs from DATE_TRUNC: {trunc_rows!r}"

        # 4. The connection must still be live after the previously fatal
        # query path. A trivial round-trip catches the case where trex has
        # silently restarted between statements.
        sentinel = _query_all(conn, "SELECT 1")
        assert sentinel and sentinel[0][0] == 1, \
            "pgwire connection went away after federated TIMESTAMPTZ scan"
    finally:
        try:
            cur = conn.cursor()
            cur.execute(f"DETACH {ATTACH_ALIAS}")
            cur.close()
        except Exception:
            pass
        conn.close()
