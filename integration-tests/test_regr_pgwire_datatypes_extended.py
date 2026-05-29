"""Extended pgwire data-type regression coverage.

Complements ``test_regr_pgwire_timestamptz.py`` (TIMESTAMPTZ-only) and the
broader unit-style ``test_pgwire_datatypes.py`` (single-shot literals via
in-process node fixtures). This module hits the *running* trex container
with broader edge cases that proactively catch the type-mapping bug family
introduced around commits #142 (date parsing), #143 (numeric support), and
#144 (handle-all-data-types).

Coverage matrix vs. existing tests:

  * test_regr_pgwire_timestamptz.py — TIMESTAMPTZ only (NOW(), offsets, ...)
  * test_pgwire_datatypes.py        — literal SELECTs, single value, no table
  * THIS module                      — table round-trips with edge values:
      - NUMERIC(20,5), DECIMAL(38,10) max precision
      - NaN / Infinity / -Infinity DOUBLE
      - Decimal128(38,10) materialised via INSERT
      - DATE literals, INTERVAL year/month/day mixed in result rows
      - BLOB / BYTEA non-text bytes (0x00, 0xFF)
      - JSON column values (json extension)
      - BOOLEAN mixed with NULL
      - VARCHAR with multi-byte / non-ASCII

Each test ends with ``SELECT 1`` as a heartbeat — if trex died mid-test
(SIGTERM, decode panic) this lookup fails clearly with a connection error
rather than a silent test pass on cached results.

Assumes the trex container is running on ``localhost:5433`` with the seeded
``trex / trex`` credentials (``main`` database).
"""

from __future__ import annotations

import math
import uuid
from decimal import Decimal

import pytest
import logging

logger = logging.getLogger(__name__)

try:
    import psycopg2
except ImportError:  # pragma: no cover
    psycopg2 = None


PGWIRE_HOST = "localhost"
PGWIRE_PORT = 5433
PGWIRE_USER = "trex"
PGWIRE_PASSWORD = "trex"
PGWIRE_DB = "main"

RUN_TAG = uuid.uuid4().hex[:8]

# Tracks every table created by tests in this module so the module-scope
# fixture can drop them all on teardown — even if a single test fails before
# its own explicit DROP. psycopg2 connection objects don't accept ad-hoc
# attribute assignment, so this lives at module scope.
_CREATED_TABLES: list[str] = []


def _table(name: str) -> str:
    """Unique per-run table name to avoid collisions across parallel runs."""
    full = f"_regr_dt_{name}_{RUN_TAG}"
    _CREATED_TABLES.append(full)
    return full


def _connect():
    return psycopg2.connect(
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


def _heartbeat(conn) -> None:
    """Final SELECT 1 — fails clearly if trex died mid-test."""
    cur = conn.cursor()
    cur.execute("SELECT 1")
    rows = cur.fetchall()
    cur.close()
    assert rows == [(1,)], (
        "pgwire heartbeat failed — trex likely SIGTERM'd or wire decoder "
        "left the connection in a bad state"
    )


@pytest.fixture(scope="module")
def conn():
    if psycopg2 is None:
        pytest.skip("psycopg2 not installed")
    if not _trex_available():
        pytest.skip(f"trex pgwire ({PGWIRE_HOST}:{PGWIRE_PORT}) not reachable")
    c = _connect()
    c.autocommit = True
    try:
        yield c
    finally:
        try:
            cur = c.cursor()
            for t in _CREATED_TABLES:
                try:
                    cur.execute(f"DROP TABLE IF EXISTS {t}")
                except Exception as e:
                    logger.debug("ignoring %s: %s", type(e).__name__, e)
            cur.close()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)
        try:
            c.close()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)


# -----------------------------------------------------------------------------
# NUMERIC / DECIMAL edge cases
# -----------------------------------------------------------------------------


def test_numeric_wide_precision(conn):
    """NUMERIC(20,5) and DECIMAL(38,10) (max precision) round-trip.

    Previously DuckDB's wire encoder SIGTERM'd trex on full-width
    DECIMAL(38,10) values because arrow-pg routes Decimal128 through
    rust_decimal, whose 96-bit mantissa aborts on a 38-digit i128. The
    pgwire plugin now pre-formats Decimal128 to Utf8 itself (see
    ``format_decimal128_as_utf8`` in plugins/pgwire/src/pgwire_server.rs),
    so this test exercises full precision with confidence.
    """
    t = _table("num_wide")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(
        f"CREATE TABLE {t} (n20 NUMERIC(20,5), n38 DECIMAL(38,10))"
    )
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(123456789012345.67890::NUMERIC(20,5), "
        f" 12345678901234567890123456.1234567890::DECIMAL(38,10))"
    )
    cur.execute(f"SELECT n20, n38 FROM {t}")
    rows = cur.fetchall()
    assert len(rows) == 1
    n20, n38 = rows[0]
    assert n20 == Decimal("123456789012345.67890")
    assert n38 == Decimal("12345678901234567890123456.1234567890")
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


def test_decimal_max_precision_full_width(conn):
    """Full-width DECIMAL(38, *) used to SIGTERM the trex pgwire encoder.

    This is the regression-guard for the i128 overflow path that crashed
    rust_decimal inside arrow-pg. We now hit:
      * positive max-width DECIMAL(38,10)
      * negative max-width DECIMAL(38,10)
      * scale=0 max-width DECIMAL(38,0)
      * boundary near i128 max
    """
    t = _table("dec_max")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(
        f"CREATE TABLE {t} ("
        f" id INT,"
        f" d10 DECIMAL(38,10),"
        f" d0 DECIMAL(38,0)"
        f")"
    )
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, 12345678901234567890123456.1234567890::DECIMAL(38,10),"
        f"    99999999999999999999999999999999999999::DECIMAL(38,0)),"
        f"(2, -99999999999999999999999999.9999999999::DECIMAL(38,10),"
        f"    -99999999999999999999999999999999999999::DECIMAL(38,0)),"
        f"(3, 0::DECIMAL(38,10), 0::DECIMAL(38,0)),"
        f"(4, NULL, NULL)"
    )
    cur.execute(f"SELECT id, d10, d0 FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == 4
    by_id = {r[0]: (r[1], r[2]) for r in rows}
    assert by_id[1][0] == Decimal("12345678901234567890123456.1234567890")
    assert by_id[1][1] == Decimal("99999999999999999999999999999999999999")
    assert by_id[2][0] == Decimal("-99999999999999999999999999.9999999999")
    assert by_id[2][1] == Decimal("-99999999999999999999999999999999999999")
    assert by_id[3][0] in (Decimal("0E-10"), Decimal("0"))
    assert by_id[3][1] == Decimal("0")
    assert by_id[4] == (None, None)
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


def test_numeric_negative_scale_unsupported(conn):
    """DuckDB rejects NEGATIVE scale at parse time.

    Documenting the contract so a future behaviour change shows up here as
    a test failure instead of silently changing semantics. Crucially the
    parser error must NOT terminate the connection.
    """
    cur = conn.cursor()
    with pytest.raises(Exception) as excinfo:
        cur.execute("SELECT 12345::NUMERIC(10,-2)")
    msg = str(excinfo.value)
    assert "Negative" in msg or "modifier" in msg, (
        f"unexpected error for negative scale: {msg!r}"
    )
    cur.close()
    _heartbeat(conn)


def test_decimal_via_arrow_table_roundtrip(conn):
    """Decimal128(38,10) materialised as a regular table column.

    A previous regression had decimals at max precision panicking the wire
    encoder (commit #143 territory).
    """
    t = _table("dec128")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(f"CREATE TABLE {t} (id INT, d DECIMAL(38,10))")
    # NB: keep magnitudes modest here; full 38-digit width values are
    # exercised separately in ``test_decimal_max_precision_full_width``.
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, 0.0000000001::DECIMAL(38,10)),"
        f"(2, -123456789.0123456789::DECIMAL(38,10)),"
        f"(3, 0::DECIMAL(38,10)),"
        f"(4, NULL)"
    )
    cur.execute(f"SELECT id, d FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == 4
    by_id = {r[0]: r[1] for r in rows}
    assert by_id[1] == Decimal("0.0000000001")
    assert by_id[2] == Decimal("-123456789.0123456789")
    assert by_id[3] == Decimal("0E-10") or by_id[3] == Decimal("0")
    assert by_id[4] is None
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


def test_double_nan_and_infinity(conn):
    """NaN / +Inf / -Inf must encode without crashing the wire.

    DuckDB rejects NaN for DECIMAL but allows it for DOUBLE. We test the
    DOUBLE path here; the DECIMAL-rejected path is asserted as a parse
    error (no connection drop).
    """
    t = _table("dbl_special")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(f"CREATE TABLE {t} (id INT, v DOUBLE)")
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, 'NaN'::DOUBLE),"
        f"(2, 'Infinity'::DOUBLE),"
        f"(3, '-Infinity'::DOUBLE),"
        f"(4, 0.0),"
        f"(5, NULL)"
    )
    cur.execute(f"SELECT id, v FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == 5
    by_id = {r[0]: r[1] for r in rows}
    assert math.isnan(by_id[1]), f"expected NaN, got {by_id[1]!r}"
    assert by_id[2] == math.inf
    assert by_id[3] == -math.inf
    assert by_id[4] == 0.0
    assert by_id[5] is None
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


def test_decimal_nan_rejected_cleanly(conn):
    """DECIMAL does not accept NaN — error must be a clean ProgrammingError,
    not a connection reset / SIGTERM.
    """
    cur = conn.cursor()
    with pytest.raises(Exception) as excinfo:
        cur.execute("SELECT 'NaN'::DECIMAL(10,2)")
    assert "Conversion" in str(excinfo.value) or "DECIMAL" in str(excinfo.value)
    cur.close()
    _heartbeat(conn)


# -----------------------------------------------------------------------------
# DATE / INTERVAL
# -----------------------------------------------------------------------------


def test_date_and_interval_mixed(conn):
    """DATE literals + INTERVAL of mixed units in the same SELECT.

    Previously the pgwire INTERVAL encoder leaked the stale buffer slot for
    SQL NULL intervals (e.g. "62206777 years 4 mons 31872 days") because
    arrow-pg's encoder reads ``value(idx)`` without checking the validity
    bitmap. The pgwire plugin now pre-formats intervals to Utf8 itself
    (see ``format_interval_as_utf8`` in plugins/pgwire/src/pgwire_server.rs),
    so the row 4 INTERVAL NULL must now arrive as an actual wire NULL.
    """
    t = _table("date_iv")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(f"CREATE TABLE {t} (id INT, d DATE, iv INTERVAL)")
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, DATE '2026-05-07', INTERVAL '1 year 2 months 3 days'),"
        f"(2, DATE '1900-01-01', INTERVAL '12 hours 30 minutes'),"
        f"(3, DATE '2200-12-31', INTERVAL '0 seconds'),"
        f"(4, NULL,              NULL)"
    )
    cur.execute(f"SELECT id, d, iv FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == 4
    # Row 1: both populated
    assert rows[0][1] is not None
    assert rows[0][2] is not None
    # Row 2/3: dates populated and intervals non-null & truthy
    assert rows[1][1] is not None and rows[1][2] is not None
    assert rows[2][1] is not None and rows[2][2] is not None
    # Row 4: DATE NULL and INTERVAL NULL must both arrive as real wire NULLs.
    assert rows[3][1] is None
    assert rows[3][2] is None, (
        f"INTERVAL NULL must arrive as None on the wire, got {rows[3][2]!r}"
    )
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


def test_interval_null_and_variants(conn):
    """Dedicated regression-guard for the INTERVAL NULL stale-buffer bug.

    Exercises a mix of INTERVAL shapes (year/month, day, time, mixed,
    negative, zero) interleaved with NULLs to make sure the validity
    bitmap is honoured for every Arrow IntervalUnit DuckDB might pick.
    """
    t = _table("iv_variants")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(f"CREATE TABLE {t} (id INT, iv INTERVAL)")
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, NULL),"
        f"(2, INTERVAL '1 day'),"
        f"(3, NULL),"
        f"(4, INTERVAL '1 year 2 months'),"
        f"(5, INTERVAL '12 hours 30 minutes 45 seconds'),"
        f"(6, INTERVAL '-1 day -2 hours'),"
        f"(7, INTERVAL '0 seconds'),"
        f"(8, NULL)"
    )
    cur.execute(f"SELECT id, iv FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == 8
    by_id = {r[0]: r[1] for r in rows}
    assert by_id[1] is None, f"row 1 INTERVAL NULL leaked: {by_id[1]!r}"
    assert by_id[2] is not None
    assert by_id[3] is None, f"row 3 INTERVAL NULL leaked: {by_id[3]!r}"
    assert by_id[4] is not None
    assert by_id[5] is not None
    assert by_id[6] is not None
    assert by_id[7] is not None
    assert by_id[8] is None, f"row 8 INTERVAL NULL leaked: {by_id[8]!r}"
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


# -----------------------------------------------------------------------------
# Binary / BLOB / BYTEA
# -----------------------------------------------------------------------------


def test_blob_with_non_text_bytes(conn):
    """BLOB column with NUL, 0x7F, 0xFF — bytes that break naive UTF-8 paths."""
    t = _table("blob")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(f"CREATE TABLE {t} (id INT, b BLOB)")
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, '\\x00\\x01\\x02'::BLOB),"
        f"(2, '\\xFF\\xFE\\xFD'::BLOB),"
        f"(3, '\\x7E\\x7F\\x80'::BLOB),"
        f"(4, ''::BLOB),"
        f"(5, NULL)"
    )
    cur.execute(f"SELECT id, b FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == 5
    by_id = {r[0]: (bytes(r[1]) if r[1] is not None else None) for r in rows}
    assert by_id[1] == b"\x00\x01\x02"
    assert by_id[2] == b"\xff\xfe\xfd"
    assert by_id[3] == b"\x7e\x7f\x80"
    assert by_id[4] == b""
    assert by_id[5] is None
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


# -----------------------------------------------------------------------------
# JSON
# -----------------------------------------------------------------------------


def test_json_column(conn):
    """JSON column round-trip (the json extension is built into trex)."""
    t = _table("json")
    cur = conn.cursor()
    # json extension is bundled — INSTALL/LOAD are best-effort.
    for sql in ("INSTALL json", "LOAD json"):
        try:
            cur.execute(sql)
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(f"CREATE TABLE {t} (id INT, j JSON)")
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, '{{\"k\":42,\"arr\":[1,2,3]}}'::JSON),"
        f"(2, '[\"a\",\"b\",\"c\"]'::JSON),"
        f"(3, 'null'::JSON),"
        f"(4, NULL)"
    )
    cur.execute(f"SELECT id, j FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == 4
    # Row 1: object content survives
    assert "42" in rows[0][1] and "arr" in rows[0][1]
    # Row 2: array content survives
    assert "a" in rows[1][1] and "c" in rows[1][1]
    # Row 4: SQL NULL
    assert rows[3][1] is None
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


# -----------------------------------------------------------------------------
# Boolean + NULL mixed
# -----------------------------------------------------------------------------


def test_boolean_with_nulls(conn):
    """BOOLEAN column with TRUE / FALSE / NULL interleaved across many rows."""
    t = _table("bool")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(f"CREATE TABLE {t} (id INT, b BOOLEAN)")
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, TRUE), (2, FALSE), (3, NULL), (4, TRUE), (5, NULL), (6, FALSE)"
    )
    cur.execute(f"SELECT id, b FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == 6
    by_id = {r[0]: r[1] for r in rows}
    assert by_id[1] is True
    assert by_id[2] is False
    assert by_id[3] is None
    assert by_id[4] is True
    assert by_id[5] is None
    assert by_id[6] is False
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


# -----------------------------------------------------------------------------
# VARCHAR multi-byte
# -----------------------------------------------------------------------------


def test_varchar_multibyte(conn):
    """VARCHAR / TEXT with multi-byte UTF-8 characters."""
    t = _table("vch")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(f"CREATE TABLE {t} (id INT, s VARCHAR)")
    payloads = [
        "ascii-only",
        "héllo wörld",          # latin diacritics
        "你好世界",              # CJK
        "🦖🚀💾",                # emoji
        "mix: café / 北京 / 🦕",  # mixed
        "",                     # empty string distinct from NULL
    ]
    for i, s in enumerate(payloads, start=1):
        cur.execute(f"INSERT INTO {t} VALUES (%s, %s)", (i, s))
    cur.execute(f"INSERT INTO {t} VALUES (%s, NULL)", (len(payloads) + 1,))
    cur.execute(f"SELECT id, s FROM {t} ORDER BY id")
    rows = cur.fetchall()
    assert len(rows) == len(payloads) + 1
    for (rid, val), expected in zip(rows[:-1], payloads):
        assert val == expected, f"row {rid}: got {val!r}, expected {expected!r}"
    assert rows[-1][1] is None
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)


# -----------------------------------------------------------------------------
# Cross-cutting: every type in one row
# -----------------------------------------------------------------------------


def test_all_edge_types_one_table(conn):
    """One wide table containing every edge-case type at once.

    This is the integration-level analogue of
    ``test_pgwire_all_types_one_row`` from the unit-style suite — but as a
    real table over a real wire on the running container.
    """
    t = _table("wide")
    cur = conn.cursor()
    cur.execute(f"DROP TABLE IF EXISTS {t}")
    cur.execute(
        f"CREATE TABLE {t} ("
        f"  id INT,"
        f"  n NUMERIC(20,5),"
        f"  d DECIMAL(38,10),"
        f"  f DOUBLE,"
        f"  dt DATE,"
        f"  iv INTERVAL,"
        f"  blob_v BLOB,"
        f"  j JSON,"
        f"  b BOOLEAN,"
        f"  s VARCHAR"
        f")"
    )
    cur.execute(
        f"INSERT INTO {t} VALUES "
        f"(1, 12345.67890::NUMERIC(20,5),"
        f"    1.0000000001::DECIMAL(38,10),"
        f"    'NaN'::DOUBLE,"
        f"    DATE '2026-05-07',"
        f"    INTERVAL '1 year 2 months 3 days',"
        f"    '\\x00\\xFF\\x42'::BLOB,"
        f"    '{{\"ok\":true}}'::JSON,"
        f"    TRUE,"
        f"    'héllo 你好 🦖')"
    )
    cur.execute(f"SELECT * FROM {t}")
    rows = cur.fetchall()
    assert len(rows) == 1
    rid, n, d, f, dt, iv, blob_v, j, b, s = rows[0]
    assert rid == 1
    assert n == Decimal("12345.67890")
    assert d == Decimal("1.0000000001")
    assert math.isnan(f)
    assert dt is not None
    assert iv is not None
    assert bytes(blob_v) == b"\x00\xff\x42"
    assert "ok" in j
    assert b is True
    assert s == "héllo 你好 🦖"
    cur.execute(f"DROP TABLE {t}")
    cur.close()
    _heartbeat(conn)
