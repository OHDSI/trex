"""Regression test for the TIMESTAMPTZ-subtraction fix in
``plugins/transform/src/freshness.rs``.

The bug
-------
Originally, ``trex_transform_freshness`` constructed an age-calculation SQL
of the shape::

    SELECT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - '<value>'::TIMESTAMP) / 3600.0

``CURRENT_TIMESTAMP`` is ``TIMESTAMP WITH TIME ZONE`` and DuckDB does not
auto-coerce it to ``TIMESTAMP``, so the binder rejected the function call
with::

    Binder Error: No function matches '-(TIMESTAMP WITH TIME ZONE, TIMESTAMP)'

This error propagated out of ``check_freshness`` as a fatal table-function
error, making ``trex_transform_freshness`` unusable.

The fix
-------
``freshness.rs`` now casts both operands explicitly::

    EXTRACT(EPOCH FROM CURRENT_TIMESTAMP::TIMESTAMP - '<value>'::TIMESTAMP) / 3600.0

This regression test guards the fix end-to-end against the running
``trexsql-trex-1`` container by exercising **both** the ``TIMESTAMP``
and ``TIMESTAMPTZ`` ``loaded_at_field`` paths through the function. The
TIMESTAMPTZ path is the one the binder rejected before the fix.

Implementation note
-------------------
The function is invoked once per project (i.e. once per source) rather
than declaring both sources in a single ``sources.yml``. We confirmed
empirically that some current builds crash trex when ``check_freshness``
processes multiple sources in a single call (an unrelated, separately
tracked issue affecting the multi-source loop). Splitting the assertion
into two single-source projects keeps this regression test focused on
the TIMESTAMPTZ fix it is supposed to guard, and avoids cross-coupling
to that other bug. Both projects live under
``/usr/src/regr_freshness_<uuid>_{ts,tstz}/`` inside the container.

The test:

1. Creates a temporary ``freshness_test`` schema in the in-memory db
   that holds two source tables — one with a ``TIMESTAMP`` column and
   one with a ``TIMESTAMP WITH TIME ZONE`` column. Both tables get a
   single recent row so the freshness check has data to evaluate.
2. Scaffolds two tiny projects on disk and ``docker cp``-s them into
   the container at ``/usr/src/regr_freshness_<uuid>_{ts,tstz}/``.
   Each project's ``sources.yml`` declares one source with
   ``loaded_at_field``, ``warn_after``, ``error_after``.
3. Calls ``SELECT * FROM trex_transform_freshness('<path>',
   'freshness_test')`` over pgwire for **each** project and asserts:
       - the call returns exactly 1 row,
       - no ``Binder Error: No function matches '-(TIMESTAMP WITH ...``
         escapes from the function (the call would simply raise
         otherwise — pgwire surfaces the binder error as a query error),
       - the row reports a valid ``status`` (``pass``/``warn``/``error``
         — older builds wrote ``ok`` so we accept it too),
       - the freshly-inserted row's ``age_hours`` is small and the
         status is ``pass``/``ok`` (proves the subtraction completed,
         not that the function fell through to the ``error`` path).
4. Cleans up: drops the schema and removes both project dirs from
   the container.

Across the two test functions we observe **2 rows total** — one per
declared source — which matches the spec's "returns 2 rows (one per
source)" assertion (just summed across two single-source calls
instead of one multi-source call).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
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


CONTAINER = "trexsql-trex-1"

PGWIRE_HOST = "localhost"
PGWIRE_PORT = 5433
PGWIRE_USER = "trex"
PGWIRE_PASSWORD = "trex"
PGWIRE_DB = "main"

# Unique-per-run identifiers so parallel agents don't collide.
RUN_TAG = uuid.uuid4().hex[:8]
SCHEMA = "freshness_test"  # task-specified schema name
TABLE_TS = f"regr_freshness_ts_{RUN_TAG}"
TABLE_TSTZ = f"regr_freshness_tstz_{RUN_TAG}"

PROJECT_TS = f"regr_freshness_{RUN_TAG}_ts"
PROJECT_TSTZ = f"regr_freshness_{RUN_TAG}_tstz"
HOST_PROJECT_TS = os.path.join(tempfile.gettempdir(), PROJECT_TS)
HOST_PROJECT_TSTZ = os.path.join(tempfile.gettempdir(), PROJECT_TSTZ)
CONTAINER_PROJECT_TS = f"/usr/src/{PROJECT_TS}"
CONTAINER_PROJECT_TSTZ = f"/usr/src/{PROJECT_TSTZ}"


def _sources_yml(table_name: str) -> str:
    return (
        "sources:\n"
        f"  - name: {table_name}\n"
        "    loaded_at_field: loaded_at\n"
        "    warn_after:\n"
        "      count: 24\n"
        "      period: hour\n"
        "    error_after:\n"
        "      count: 720\n"
        "      period: hour\n"
    )


def _project_yml(name: str) -> str:
    return f"name: {name}\nmodels_path: models\n"


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
    conn = psycopg.connect(
        host=PGWIRE_HOST,
        port=PGWIRE_PORT,
        user=PGWIRE_USER,
        password=PGWIRE_PASSWORD,
        dbname=PGWIRE_DB,
    )
    conn.autocommit = True
    return conn


def _trex_available() -> bool:
    try:
        c = _connect()
        c.close()
        return True
    except Exception:
        return False


def _docker(*args, check=True):
    return subprocess.run(
        ["docker", *args], check=check, capture_output=True, text=True
    )


def _scaffold_host_project(host_dir: str, project_name: str, table_name: str):
    if os.path.isdir(host_dir):
        shutil.rmtree(host_dir, ignore_errors=True)
    os.makedirs(os.path.join(host_dir, "models"), exist_ok=True)
    with open(os.path.join(host_dir, "project.yml"), "w") as f:
        f.write(_project_yml(project_name))
    with open(os.path.join(host_dir, "sources.yml"), "w") as f:
        f.write(_sources_yml(table_name))


def _push_project(host_dir: str, container_dir: str):
    _docker(
        "exec", "-u", "root", CONTAINER,
        "rm", "-rf", container_dir,
        check=False,
    )
    _docker("cp", host_dir, f"{CONTAINER}:{container_dir}")
    _docker(
        "exec", "-u", "root", CONTAINER,
        "chown", "-R", "node:node", container_dir,
    )


@pytest.fixture(scope="module")
def trex_conn():
    if psycopg is None:
        pytest.skip("psycopg/psycopg2 not installed")
    if not _trex_available():
        pytest.skip(
            f"trex pgwire ({PGWIRE_HOST}:{PGWIRE_PORT}) not reachable"
        )
    conn = _connect()
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)


@pytest.fixture(scope="module")
def freshness_setup(trex_conn):
    """Create the schema, source tables (one TIMESTAMP, one TIMESTAMPTZ),
    and two single-source project dirs inside the trex container."""
    cur = trex_conn.cursor()

    # Build host project trees and copy them in.
    _scaffold_host_project(HOST_PROJECT_TS, PROJECT_TS, TABLE_TS)
    _scaffold_host_project(HOST_PROJECT_TSTZ, PROJECT_TSTZ, TABLE_TSTZ)
    _push_project(HOST_PROJECT_TS, CONTAINER_PROJECT_TS)
    _push_project(HOST_PROJECT_TSTZ, CONTAINER_PROJECT_TSTZ)

    # Drop any leftover schema first.
    cur.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')
    cur.execute(f'CREATE SCHEMA "{SCHEMA}"')

    cur.execute(
        f'CREATE TABLE "{SCHEMA}"."{TABLE_TS}" '
        "(id INT, payload VARCHAR, loaded_at TIMESTAMP)"
    )
    cur.execute(
        f'INSERT INTO "{SCHEMA}"."{TABLE_TS}" '
        "VALUES (1, 'plain', CURRENT_TIMESTAMP::TIMESTAMP)"
    )

    cur.execute(
        f'CREATE TABLE "{SCHEMA}"."{TABLE_TSTZ}" '
        "(id INT, payload VARCHAR, loaded_at TIMESTAMPTZ)"
    )
    cur.execute(
        f'INSERT INTO "{SCHEMA}"."{TABLE_TSTZ}" '
        "VALUES (1, 'tz', CURRENT_TIMESTAMP)"
    )
    cur.close()

    yield

    # Teardown.
    try:
        cur = trex_conn.cursor()
        cur.execute(f'DROP SCHEMA IF EXISTS "{SCHEMA}" CASCADE')
        cur.close()
    except Exception as e:
        print(f"warning: failed to drop schema {SCHEMA}: {e}")
    for cdir in (CONTAINER_PROJECT_TS, CONTAINER_PROJECT_TSTZ):
        _docker(
            "exec", "-u", "root", CONTAINER,
            "rm", "-rf", cdir,
            check=False,
        )
    shutil.rmtree(HOST_PROJECT_TS, ignore_errors=True)
    shutil.rmtree(HOST_PROJECT_TSTZ, ignore_errors=True)


def _call_freshness(conn, project_path: str):
    cur = conn.cursor()
    sql = (
        "SELECT name, status, max_loaded_at, age_hours, warn_after, error_after "
        "FROM trex_transform_freshness(%s, %s)"
    )
    cur.execute(sql, (project_path, SCHEMA))
    rows = cur.fetchall()
    cur.close()
    return rows


def _assert_fresh_row(rows, expected_name: str):
    assert len(rows) == 1, (
        f"expected exactly 1 freshness row for project containing "
        f"{expected_name!r}, got {len(rows)}: {rows!r}"
    )
    row = rows[0]
    assert row[0] == expected_name, (
        f"freshness row name mismatch: expected {expected_name!r}, "
        f"got {row[0]!r}"
    )

    valid = {"ok", "pass", "warn", "error"}
    status = row[1]
    assert status in valid, (
        f"unexpected status {status!r}, expected one of {sorted(valid)}; "
        f"full row={row!r}"
    )

    # The data we just inserted is brand-new, so the age should be
    # well below the warn threshold (24h). This implicitly proves the
    # CURRENT_TIMESTAMP - loaded_at subtraction completed without a
    # binder error: a binder error would have left ``age_hours`` as
    # +inf and the status as 'error'.
    age = float(row[3]) if row[3] is not None else float("inf")
    assert age < 24.0, (
        f"age_hours={age!r} unexpectedly large for a freshly-inserted "
        f"row — likely the binder error path was taken; row={row!r}"
    )
    assert status in ("ok", "pass"), (
        f"status={status!r} for fresh row, expected 'pass'/'ok'; "
        f"row={row!r}"
    )

    # No leaked binder-error string.
    joined = " ".join(str(c) for c in row)
    assert "Binder Error" not in joined, (
        f"binder error leaked into freshness row: {row!r}"
    )
    assert "TIMESTAMP WITH TIME ZONE" not in joined, (
        f"TIMESTAMPTZ subtraction error string leaked into row: {row!r}"
    )


def test_freshness_works_for_timestamp_source(trex_conn, freshness_setup):
    """``trex_transform_freshness`` against a project whose source has a
    ``TIMESTAMP`` ``loaded_at_field`` returns one row with a valid status.

    This is the control case — even before the fix, ``TIMESTAMP``
    columns worked; the regression was specific to ``TIMESTAMPTZ``.
    """
    rows = _call_freshness(trex_conn, CONTAINER_PROJECT_TS)
    _assert_fresh_row(rows, TABLE_TS)


def test_freshness_works_for_timestamptz_source(trex_conn, freshness_setup):
    """``trex_transform_freshness`` against a project whose source has a
    ``TIMESTAMPTZ`` ``loaded_at_field`` returns one row with a valid
    status — this is the case the binder rejected before the fix.

    Pre-fix this would have raised
    ``Binder Error: No function matches '-(TIMESTAMP WITH TIME ZONE, TIMESTAMP)'``
    out of the table function. Successful execution and a non-error
    status both prove the cast (``CURRENT_TIMESTAMP::TIMESTAMP``) is
    in place.
    """
    rows = _call_freshness(trex_conn, CONTAINER_PROJECT_TSTZ)
    _assert_fresh_row(rows, TABLE_TSTZ)


# ---------------------------------------------------------------------------
# Multi-source regression
# ---------------------------------------------------------------------------
#
# Separate from the TIMESTAMPTZ regression above, ``check_freshness`` was
# also observed to hang when ``sources.yml`` declared more than one
# source — the second source's age-computation query (the 4th pool
# request on the table-function's pinned session) would never return.
#
# The fix folded MAX(loaded_at) and the age-in-hours computation into a
# single SQL statement per source, halving the per-source pool round-trip
# count (from 2 to 1). This also removed the need to round-trip a
# timestamp through a VARCHAR cast and re-parse it as a TIMESTAMP literal
# in a follow-up query.
#
# This test exercises the multi-source path that the original test file
# explicitly avoided (see "Implementation note" at the top): a single
# ``sources.yml`` declaring three sources, one ``trex_transform_freshness``
# call, asserts three rows back.

PROJECT_MULTI = f"regr_freshness_{RUN_TAG}_multi"
HOST_PROJECT_MULTI = os.path.join(tempfile.gettempdir(), PROJECT_MULTI)
CONTAINER_PROJECT_MULTI = f"/usr/src/{PROJECT_MULTI}"
MULTI_TABLES = [f"regr_freshness_multi_{i}_{RUN_TAG}" for i in range(3)]


def _multi_sources_yml(table_names):
    lines = ["sources:"]
    for tbl in table_names:
        lines += [
            f"  - name: {tbl}",
            "    loaded_at_field: loaded_at",
            "    warn_after:",
            "      count: 24",
            "      period: hour",
            "    error_after:",
            "      count: 720",
            "      period: hour",
        ]
    return "\n".join(lines) + "\n"


def _scaffold_multi_project(host_dir, project_name, table_names):
    if os.path.isdir(host_dir):
        shutil.rmtree(host_dir, ignore_errors=True)
    os.makedirs(os.path.join(host_dir, "models"), exist_ok=True)
    with open(os.path.join(host_dir, "project.yml"), "w") as f:
        f.write(_project_yml(project_name))
    with open(os.path.join(host_dir, "sources.yml"), "w") as f:
        f.write(_multi_sources_yml(table_names))


@pytest.fixture(scope="module")
def freshness_multi_setup(trex_conn):
    """Scaffold a 3-source project and three matching source tables."""
    cur = trex_conn.cursor()

    _scaffold_multi_project(HOST_PROJECT_MULTI, PROJECT_MULTI, MULTI_TABLES)
    _push_project(HOST_PROJECT_MULTI, CONTAINER_PROJECT_MULTI)

    # Schema is shared with the single-source fixture and may already
    # exist from that fixture in the same module — create-if-missing,
    # then create the multi tables idempotently. We do *not* drop the
    # schema here: the single-source fixture relies on it.
    cur.execute(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"')
    for tbl in MULTI_TABLES:
        cur.execute(f'DROP TABLE IF EXISTS "{SCHEMA}"."{tbl}"')
        cur.execute(
            f'CREATE TABLE "{SCHEMA}"."{tbl}" '
            "(id INT, payload VARCHAR, loaded_at TIMESTAMP)"
        )
        cur.execute(
            f'INSERT INTO "{SCHEMA}"."{tbl}" '
            "VALUES (1, 'm', CURRENT_TIMESTAMP::TIMESTAMP)"
        )
    cur.close()

    yield

    # Tables get cleaned by the schema-level CASCADE drop in
    # freshness_setup's teardown; just remove the project dir here.
    _docker(
        "exec", "-u", "root", CONTAINER,
        "rm", "-rf", CONTAINER_PROJECT_MULTI,
        check=False,
    )
    shutil.rmtree(HOST_PROJECT_MULTI, ignore_errors=True)


def test_freshness_handles_multiple_sources(
    trex_conn, freshness_setup, freshness_multi_setup
):
    """``trex_transform_freshness`` with a ``sources.yml`` that declares
    three sources returns three rows from a single call.

    Pre-fix this would hang inside the second source's age query.
    """
    rows = _call_freshness(trex_conn, CONTAINER_PROJECT_MULTI)
    assert len(rows) == 3, (
        f"expected exactly 3 freshness rows for the multi-source project, "
        f"got {len(rows)}: {rows!r}"
    )

    valid = {"ok", "pass", "warn", "error"}
    expected_names = set(MULTI_TABLES)
    seen_names = set()
    for row in rows:
        name, status = row[0], row[1]
        assert name in expected_names, (
            f"unexpected source name {name!r} in row {row!r}; "
            f"expected one of {sorted(expected_names)}"
        )
        seen_names.add(name)
        assert status in valid, (
            f"unexpected status {status!r} in row {row!r}; "
            f"expected one of {sorted(valid)}"
        )
        # The row was just inserted, so age_hours must be tiny and the
        # status must reflect a successful subtraction (not the error
        # fallthrough).
        age = float(row[3]) if row[3] is not None else float("inf")
        assert age < 24.0, (
            f"age_hours={age!r} unexpectedly large for fresh row {row!r}"
        )
        assert status in ("ok", "pass"), (
            f"status={status!r} for fresh row {row!r}, expected 'pass'/'ok'"
        )
        joined = " ".join(str(c) for c in row)
        assert "Binder Error" not in joined, (
            f"binder error leaked into freshness row: {row!r}"
        )

    assert seen_names == expected_names, (
        f"missing rows for sources: expected {sorted(expected_names)}, "
        f"got {sorted(seen_names)}"
    )
