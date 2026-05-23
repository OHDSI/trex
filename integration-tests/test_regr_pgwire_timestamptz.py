"""Regression test for pgwire TIMESTAMPTZ encoding.

A ``SELECT`` whose result includes a TIMESTAMPTZ column used to crash the
trex engine (SIGTERM, signal 15) before any row could be sent on the wire.
The reproduction was as small as ``SELECT NOW();`` over the pgwire port.

Root cause: arrow-pg's text encoder dispatches on the source Arrow type and
calls ``Tz::from_str`` on the field's timezone metadata. DuckDB emits its
TIMESTAMPTZ columns with an IANA tz string ("Etc/UTC") — but the build of
``arrow-array`` linked into the pgwire extension does not enable
``chrono-tz``, so its ``Tz::from_str`` only accepts fixed-offset strings
(``+00:00``). The parse error escalated to a process-level abort and the
trex runtime saw an external SIGTERM.

Fix: ``rebuild_record_batch_for_pg`` in ``plugins/pgwire/src/pgwire_server.rs``
now formats TIMESTAMPTZ columns to Utf8 directly from the underlying UTC
microsecond buffer (chrono parses i64 epoch values without touching any
timezone string). The pgwire field still advertises OID 1184 (TIMESTAMPTZ)
to the client; only the wire-format payload is text. The cast bypasses
arrow's generic ``cast`` path because that path itself calls
``Tz::from_str`` on the IANA name.

Test plan:
  - Connect to the running trex pgwire (localhost:5433).
  - For each scenario, assert the query returns rows AND the connection is
    still live afterwards (a trex SIGTERM would close the socket and the
    follow-up ``SELECT 1`` would fail with ``Connection refused``).
  - Scenarios cover:
      * the original repro: ``SELECT NOW();``
      * a single TIMESTAMPTZ column scan
      * ``SELECT *`` from a TIMESTAMPTZ-bearing table
      * mixed types in the projection (INT, TEXT, TIMESTAMP, DATE, TIMESTAMPTZ)
      * NULL TIMESTAMPTZ values
      * pre-epoch and far-future timestamps
      * non-UTC offset values (e.g. +05:30) which must be normalised to UTC

Assumes the docker-compose ``trexsql-trex-1`` container is reachable on
the host's ``localhost:5433``.
"""

from __future__ import annotations

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


PGWIRE_HOST = "localhost"
PGWIRE_PORT = 5433
PGWIRE_USER = "trex"
PGWIRE_PASSWORD = "trex"
PGWIRE_DB = "main"

RUN_TAG = uuid.uuid4().hex[:8]
TABLE = f"_regr_pgwire_tstz_{RUN_TAG}"


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


def _trex_available() -> bool:
    try:
        c = _connect()
        c.close()
        return True
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


def _assert_connection_live(conn) -> None:
    """A live pgwire connection means trex did not SIGTERM mid-query."""
    sentinel = _query_all(conn, "SELECT 1")
    assert sentinel and sentinel[0][0] == 1, \
        "pgwire connection dropped after TIMESTAMPTZ query — trex likely SIGTERM'd"


@pytest.fixture(scope="module")
def trex_conn():
    if psycopg is None:
        pytest.skip("psycopg/psycopg2 not installed")
    if not _trex_available():
        pytest.skip(f"trex pgwire ({PGWIRE_HOST}:{PGWIRE_PORT}) not reachable")
    conn = _connect()
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)


@pytest.fixture(scope="module")
def populated_table(trex_conn):
    """Create the test table once, populate, drop on teardown."""
    cur = trex_conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {TABLE}")
    cur.execute(
        f"CREATE TABLE {TABLE} ("
        f"  id INT,"
        f"  label VARCHAR,"
        f"  ts TIMESTAMPTZ,"
        f"  plain_ts TIMESTAMP,"
        f"  dt DATE"
        f")"
    )
    cur.execute(
        f"INSERT INTO {TABLE} VALUES "
        f"  (1, 'utc',           TIMESTAMPTZ '2026-01-01 00:00:00+00', "
        f"                       TIMESTAMP '2026-01-01 00:00:00', DATE '2026-01-01'),"
        f"  (2, 'india',         TIMESTAMPTZ '2026-01-01 12:00:00+05:30', "
        f"                       TIMESTAMP '2026-01-01 12:00:00', DATE '2026-01-01'),"
        f"  (3, 'null_tstz',     NULL, "
        f"                       TIMESTAMP '2026-01-01 12:00:00', DATE '2026-01-01'),"
        f"  (4, 'pre_epoch',     TIMESTAMPTZ '1900-01-01 00:00:00+00', "
        f"                       TIMESTAMP '1900-01-01 00:00:00', DATE '1900-01-01'),"
        f"  (5, 'far_future',    TIMESTAMPTZ '2200-12-31 23:59:59+00', "
        f"                       TIMESTAMP '2200-12-31 23:59:59', DATE '2200-12-31'),"
        f"  (6, 'just_pre_unix', TIMESTAMPTZ '1969-12-31 23:59:59+00', "
        f"                       TIMESTAMP '1969-12-31 23:59:59', DATE '1969-12-31')"
    )
    cur.close()
    try:
        yield TABLE
    finally:
        try:
            cur = trex_conn.cursor()
            cur.execute(f"DROP TABLE IF EXISTS {TABLE}")
            cur.close()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)


def test_pgwire_select_now_does_not_crash(trex_conn):
    """The original one-liner repro: ``SELECT NOW();`` returning TIMESTAMPTZ."""
    rows = _query_all(trex_conn, "SELECT NOW()")
    assert len(rows) == 1, f"NOW() should return exactly one row, got {rows!r}"
    assert rows[0][0] is not None, "NOW() returned NULL"
    _assert_connection_live(trex_conn)


def test_pgwire_smoke_now_date_literal(trex_conn):
    """Mixed projection: TIMESTAMPTZ, DATE-cast, and TIMESTAMPTZ literal."""
    rows = _query_all(
        trex_conn,
        "SELECT NOW(), NOW()::DATE, '2026-01-01 00:00:00+00'::TIMESTAMPTZ",
    )
    assert len(rows) == 1
    a, b, c = rows[0]
    assert a is not None and b is not None and c is not None, \
        f"unexpected NULLs in mixed projection: {rows!r}"
    _assert_connection_live(trex_conn)


def test_pgwire_select_single_tstz_column(trex_conn, populated_table):
    """Single-column TIMESTAMPTZ scan — the family of crashes in the bug report."""
    rows = _query_all(
        trex_conn,
        f"SELECT ts FROM {populated_table} WHERE ts IS NOT NULL ORDER BY id",
    )
    assert len(rows) >= 5, f"expected at least 5 non-null TIMESTAMPTZ rows, got {rows!r}"
    assert all(r[0] is not None for r in rows), \
        f"non-null TIMESTAMPTZ scan returned a NULL: {rows!r}"
    _assert_connection_live(trex_conn)


def test_pgwire_select_star_includes_tstz(trex_conn, populated_table):
    """``SELECT *`` from a table with a TIMESTAMPTZ column."""
    rows = _query_all(
        trex_conn,
        f"SELECT * FROM {populated_table} ORDER BY id",
    )
    assert len(rows) == 6, f"expected 6 rows from {populated_table}, got {rows!r}"
    # Schema is (id, label, ts, plain_ts, dt). All non-tstz columns must
    # always be populated; ts is NULL only on the row labelled 'null_tstz'.
    by_label = {r[1]: r for r in rows}
    assert by_label["null_tstz"][2] is None, \
        f"null_tstz row should have a NULL ts, got {by_label['null_tstz']!r}"
    for label, row in by_label.items():
        if label == "null_tstz":
            continue
        assert row[2] is not None, f"row {label!r} unexpectedly NULL: {row!r}"
    _assert_connection_live(trex_conn)


def test_pgwire_tstz_offset_is_normalised_to_utc(trex_conn, populated_table):
    """A TIMESTAMPTZ literal with a +05:30 offset must arrive at the same
    instant as its UTC counterpart (encoder converts to UTC on the wire).
    This guards against a regression where the encoder drops the tz and
    reports the local clock value instead.
    """
    rows = _query_all(
        trex_conn,
        f"SELECT ts FROM {populated_table} WHERE label = 'india'",
    )
    assert len(rows) == 1, f"expected exactly one 'india' row, got {rows!r}"
    val = rows[0][0]
    # Compare against the same instant expressed as UTC: 2026-01-01 12:00:00+05:30
    # is 2026-01-01 06:30:00+00:00.
    if hasattr(val, "isoformat"):
        as_str = val.isoformat()
    else:
        as_str = str(val)
    # Normalise either ' ' or 'T' between date and time before substring check.
    as_str_norm = as_str.replace("T", " ")
    expected_iso = "2026-01-01 06:30:00"
    assert expected_iso in as_str_norm, \
        f"non-UTC offset not normalised correctly: got {as_str!r}, expected to contain {expected_iso!r}"
    _assert_connection_live(trex_conn)


def test_pgwire_tstz_pre_epoch_and_far_future(trex_conn, populated_table):
    """Pre-epoch (1900) and far-future (2200) timestamps must round-trip."""
    rows = _query_all(
        trex_conn,
        f"SELECT label, ts FROM {populated_table} "
        f"WHERE label IN ('pre_epoch', 'far_future', 'just_pre_unix') ORDER BY label",
    )
    assert len(rows) == 3, f"expected 3 boundary rows, got {rows!r}"
    by_label = {r[0]: r[1] for r in rows}
    assert by_label["pre_epoch"] is not None
    assert by_label["far_future"] is not None
    assert by_label["just_pre_unix"] is not None
    _assert_connection_live(trex_conn)


def test_pgwire_tstz_join_and_other_types(trex_conn, populated_table):
    """A JOIN that interleaves TIMESTAMPTZ with INT, TEXT, TIMESTAMP, DATE
    columns confirms the per-batch tz-strip logic does not corrupt sibling
    columns of unrelated types.
    """
    rows = _query_all(
        trex_conn,
        f"SELECT a.id, a.label, a.ts, b.plain_ts, b.dt "
        f"FROM {populated_table} a JOIN {populated_table} b ON a.id = b.id "
        f"WHERE a.ts IS NOT NULL ORDER BY a.id",
    )
    assert len(rows) >= 5, f"expected >=5 join rows, got {rows!r}"
    for r in rows:
        rid, label, ts, plain_ts, dt = r
        assert isinstance(rid, int), f"id should be int, got {rid!r}"
        assert isinstance(label, str), f"label should be str, got {label!r}"
        assert ts is not None, f"non-null ts unexpectedly None: {r!r}"
        assert plain_ts is not None, f"plain_ts unexpectedly None: {r!r}"
        assert dt is not None, f"dt unexpectedly None: {r!r}"
    _assert_connection_live(trex_conn)
