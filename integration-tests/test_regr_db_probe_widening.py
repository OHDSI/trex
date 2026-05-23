"""Regression test for the duckdb_table_provider probe widening (Fix 4).

Failure mode (pre-fix):
  ``DuckDBTableProvider::resolve_schema`` only ran its "probe the actual
  Arrow schema" rescue when the declared static-mapping type was
  ``Timestamp(_,_)``. That dodged the original ``UTC`` vs ``Etc/UTC``
  postgres_scanner crash but left every other static-vs-actual divergence
  exposed: a ``Time64`` unit mismatch, a ``Decimal128`` precision/scale
  mismatch, or any future Interval kind drift would re-enter the same
  schema-vs-batches mismatch path and SIGTERM the engine. Reading a
  federated PG table with these column types crashed trex.

Fix:
  ``plugins/db/src/duckdb_table_provider.rs`` now overrides ANY column
  whose probe data_type differs from the static mapping, not only
  Timestamps. Nullability is still taken from PRAGMA because LIMIT 0
  always reports nullable=true across the federation boundary.

Test plan:
  - Connect to the trex compose-network postgres (testdb).
  - Create a table with TIMESTAMPTZ + TIME + NUMERIC(p,s) columns.
  - From trex pgwire, ATTACH the same PG via the docker-network alias.
  - SELECT each column individually, then SELECT *. The pre-fix engine
    would terminate the connection on the TIME / NUMERIC scan; the test
    asserts that each query returns a row and the connection is still
    live afterwards (a sentinel ``SELECT 1`` round-trip).
  - Cleanup: DETACH and DROP TABLE.

Skipped automatically if either trex pgwire or the source PG container
is not reachable.
"""

from __future__ import annotations

import os
import subprocess
import uuid

import pytest
import logging

logger = logging.getLogger(__name__)

try:
    import psycopg
    PSYCOPG_VERSION = 3
except ImportError:  # pragma: no cover
    try:
        import psycopg2 as psycopg
        PSYCOPG_VERSION = 2
    except ImportError:
        psycopg = None
        PSYCOPG_VERSION = None


PGWIRE_HOST = os.environ.get("TREX_PGWIRE_HOST", "localhost")
PGWIRE_PORT = int(os.environ.get("TREX_PGWIRE_PORT", "5433"))
PGWIRE_USER = "postgres"
PGWIRE_PASSWORD = "postgres"
PGWIRE_DB = "postgres"

SOURCE_CONTAINER = "trexsql-postgres"
SOURCE_PG_USER = "postgres"
SOURCE_PG_PASSWORD = "mypass"
SOURCE_PG_DB = "testdb"
SOURCE_PG_HOST_INSIDE = "trexsql-postgres"
SOURCE_PG_PORT_INSIDE = 5432

RUN_TAG = uuid.uuid4().hex[:8]
SOURCE_TABLE = f"regr_probe_{RUN_TAG}"
ATTACH_ALIAS = f"regr_pg_probe_{RUN_TAG}"


def _docker(*args, check=True):
    return subprocess.run(
        ["docker", *args],
        check=check,
        capture_output=True,
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


def _connect():
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
    if psycopg is None:
        return False
    try:
        c = _connect()
        c.close()
        return True
    except Exception:
        return False


def _source_pg_available() -> bool:
    try:
        proc = _docker("exec", SOURCE_CONTAINER, "pg_isready",
                       "-U", SOURCE_PG_USER, "-d", SOURCE_PG_DB,
                       check=False)
        return proc.returncode == 0
    except Exception:
        return False


def _query_all(conn, sql: str):
    cur = conn.cursor()
    cur.execute(sql)
    try:
        rows = cur.fetchall()
    except Exception:
        rows = []
    cur.close()
    return rows


@pytest.fixture(scope="module")
def source_table():
    if psycopg is None:
        pytest.skip("psycopg/psycopg2 not installed")
    if not _source_pg_available():
        pytest.skip(f"source pg ({SOURCE_CONTAINER}) not reachable")

    _exec_in_source(f"DROP TABLE IF EXISTS public.{SOURCE_TABLE};")
    _exec_in_source(
        f"CREATE TABLE public.{SOURCE_TABLE} ("
        f"  id SERIAL PRIMARY KEY,"
        f"  placed_at TIMESTAMPTZ NOT NULL,"
        f"  open_at TIME NOT NULL,"
        f"  amount NUMERIC(18,4) NOT NULL,"
        f"  label TEXT"
        f");"
    )
    _exec_in_source(
        f"INSERT INTO public.{SOURCE_TABLE} "
        f"  (placed_at, open_at, amount, label) VALUES "
        f"  ('2026-01-15 10:30:00+00', '08:30:00', 1234.5678, 'one'),"
        f"  ('2026-02-20 12:45:30+00', '14:00:00', 9876.0001, 'two'),"
        f"  ('2026-03-25 13:00:00+00', '23:59:59', 0.0001,    'three');"
    )

    try:
        yield SOURCE_TABLE
    finally:
        _exec_in_source(f"DROP TABLE IF EXISTS public.{SOURCE_TABLE};")


@pytest.mark.skipif(not _trex_pgwire_available(),
                    reason="trex pgwire not reachable")
def test_federated_probe_widening_handles_time_and_numeric(source_table):
    """TIME and NUMERIC columns over federated PG must not crash trex.

    The pre-fix probe rescue was Timestamp-only, so any divergence on
    Time64 or Decimal128 between the static mapping and what
    postgres_scanner actually emits would crash the engine. This test
    drives queries on each affected column individually plus a SELECT *
    and a sentinel round-trip.
    """
    conn = _connect()
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

        # 1. TIME column on its own.
        time_rows = _query_all(
            conn,
            f"SELECT open_at FROM {ATTACH_ALIAS}.public.{source_table} LIMIT 5",
        )
        assert len(time_rows) >= 1, "no rows returned for TIME-only scan"
        assert all(r[0] is not None for r in time_rows), \
            f"unexpected NULL TIME values: {time_rows!r}"

        # 2. NUMERIC(p,s) column on its own.
        num_rows = _query_all(
            conn,
            f"SELECT amount FROM {ATTACH_ALIAS}.public.{source_table} LIMIT 5",
        )
        assert len(num_rows) >= 1, "no rows returned for NUMERIC-only scan"
        assert all(r[0] is not None for r in num_rows), \
            f"unexpected NULL NUMERIC values: {num_rows!r}"

        # 3. SELECT * exercises every column in one batch — the original
        #    crash class.
        all_rows = _query_all(
            conn,
            f"SELECT * FROM {ATTACH_ALIAS}.public.{source_table} LIMIT 5",
        )
        assert len(all_rows) >= 1, "no rows returned for SELECT *"

        # 4. The connection must still be alive — a silent trex restart
        #    between statements would manifest as a dropped connection.
        cur = conn.cursor()
        cur.execute("SELECT 1")
        sentinel = cur.fetchall()
        cur.close()
        assert sentinel and sentinel[0][0] == 1, \
            "pgwire connection went away after federated TIME/NUMERIC scan"
    finally:
        try:
            cur = conn.cursor()
            cur.execute(f"DETACH {ATTACH_ALIAS}")
            cur.close()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)
        conn.close()
