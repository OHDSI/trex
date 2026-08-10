"""HANA standalone integration tests.

Verifies that the hana extension can load, scan queries via hana_scan/hana_query,
and execute DDL via hana_execute against an SAP HANA Express instance.

Start HANA before running:  make hana-up
"""

import os
import socket
import time

import pytest
import logging

logger = logging.getLogger(__name__)

# HANA Express requires TLS — use hdbsqls:// with insecure cert check skipped
HANA_TEST_URL = os.environ.get(
    "HANA_TEST_URL",
    "hdbsqls://SYSTEM:Toor1234@localhost:39041/HDB?insecure_omit_server_certificate_check",
)


def _hana_reachable(host="localhost", port=39041, timeout=2):
    """Return True if the HANA SQL port accepts TCP connections."""
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not _hana_reachable(), reason="HANA not reachable on localhost:39041"
)


def test_hana_load(node_factory):
    """Extension loads and basic trexsql SQL works."""
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute("SELECT 1")
    assert result == [(1,)]


def test_hana_scan_basic(node_factory):
    """trex_hana_scan() returns data from a simple HANA query."""
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT * FROM trex_hana_scan('SELECT 1 AS a FROM DUMMY', '{HANA_TEST_URL}')"
    )
    assert len(result) == 1
    assert result[0][0] == 1


def test_hana_session_variable_survives_across_calls(node_factory):
    """A session variable set on a pinned session is visible to later statements."""
    node = node_factory(load_hana=True, load_db=False)
    session_id = "778899"
    # Quotes are doubled once for the DuckDB literal carrying the HANA statement:
    # HANA receives SET 'APPLICATION' = 'WIZARD_test'.
    node.execute(
        f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
        f"'SET ''APPLICATION'' = ''WIZARD_test''', '{session_id}')"
    )
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT SESSION_CONTEXT(''APPLICATION'') AS application FROM DUMMY', "
        f"'{HANA_TEST_URL}', session_id = '{session_id}')"
    )
    node.execute(f"SELECT trex_hana_evict_session('{session_id}')")
    assert result == [("WIZARD_test",)]


def test_hana_session_variable_absent_without_session(node_factory):
    """Without a session id each call is a fresh connection, so the SET is lost."""
    node = node_factory(load_hana=True, load_db=False)
    node.execute(
        f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
        f"'SET ''APPLICATION'' = ''WIZARD_unpinned''')"
    )
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT SESSION_CONTEXT(''APPLICATION'') AS application FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert result != [("WIZARD_unpinned",)]


def test_hana_query_alias(node_factory):
    """trex_hana_query() is an alias for trex_hana_scan() and returns the same result."""
    node = node_factory(load_hana=True, load_db=False)
    scan_result = node.execute(
        f"SELECT * FROM trex_hana_scan('SELECT 1 AS a FROM DUMMY', '{HANA_TEST_URL}')"
    )
    query_result = node.execute(
        f"SELECT * FROM trex_hana_query('SELECT 1 AS a FROM DUMMY', '{HANA_TEST_URL}')"
    )
    assert scan_result == query_result


def test_hana_scan_system_table(node_factory):
    """trex_hana_scan() can query HANA system tables."""
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT SCHEMA_NAME FROM SYS.TABLES WHERE TABLE_NAME = ''DUMMY''', "
        f"'{HANA_TEST_URL}')"
    )
    assert len(result) >= 1
    schemas = [row[0] for row in result]
    assert "SYS" in schemas


def test_hana_execute_ddl(node_factory):
    """trex_hana_execute() can run DDL (CREATE/DROP TABLE)."""
    node = node_factory(load_hana=True, load_db=False)
    table_name = f"TREX_TEST_{int(time.time())}"
    try:
        node.execute(
            f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
            f"'CREATE TABLE {table_name} (ID INTEGER, NAME NVARCHAR(100))')"
        )
        result = node.execute(
            f"SELECT * FROM trex_hana_scan("
            f"'SELECT TABLE_NAME FROM SYS.TABLES WHERE TABLE_NAME = ''{table_name}''', "
            f"'{HANA_TEST_URL}')"
        )
        tables = [row[0] for row in result]
        assert table_name in tables
    finally:
        try:
            node.execute(
                f"SELECT trex_hana_execute('{HANA_TEST_URL}', 'DROP TABLE {table_name}')"
            )
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)


def test_hana_scan_multi_column(node_factory):
    """trex_hana_scan() returns all columns from a multi-column query."""
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT ''hello'' AS col_a, 123 AS col_b, ''world'' AS col_c FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert len(result) == 1
    row = result[0]
    assert len(row) == 3, f"Expected 3 columns, got {len(row)}: {row}"
    assert row[0] == "hello"
    assert row[1] == 123
    assert row[2] == "world"


def test_hana_scan_now_multi_column(node_factory):
    """Regression: queries with NOW() must return all columns, not just the first."""
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT ''Alice'' AS name, 42 AS age, NOW() AS ts FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert len(result) == 1
    row = result[0]
    assert len(row) == 3, f"Expected 3 columns (name, age, ts), got {len(row)}: {row}"
    assert row[0] == "Alice"
    assert row[1] == 42
    # ts (column 2) should be a non-empty timestamp string
    assert row[2] is not None and str(row[2]) != ""


def test_hana_scan_current_timestamp_multi_column(node_factory):
    """Regression: CURRENT_TIMESTAMP in query must not collapse columns."""
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT 1 AS a, CURRENT_TIMESTAMP AS b, ''x'' AS c FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert len(result) == 1
    row = result[0]
    assert len(row) == 3, f"Expected 3 columns, got {len(row)}: {row}"
    assert row[0] == 1
    assert row[2] == "x"


def test_hana_execute_multi_statement(node_factory):
    """trex_hana_execute() handles multiple semicolon-separated statements."""
    node = node_factory(load_hana=True, load_db=False)
    table1 = f"TREX_MULTI1_{int(time.time())}"
    table2 = f"TREX_MULTI2_{int(time.time())}"
    try:
        result = node.execute(
            f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
            f"'CREATE TABLE {table1} (ID INT); CREATE TABLE {table2} (ID INT)')"
        )
        assert "2 statement" in result[0][0]
        check = node.execute(
            f"SELECT * FROM trex_hana_scan("
            f"'SELECT TABLE_NAME FROM SYS.TABLES "
            f"WHERE TABLE_NAME IN (''{table1}'', ''{table2}'')', "
            f"'{HANA_TEST_URL}')"
        )
        tables = [row[0] for row in check]
        assert table1 in tables
        assert table2 in tables
    finally:
        for t in [table1, table2]:
            try:
                node.execute(
                    f"SELECT trex_hana_execute('{HANA_TEST_URL}', 'DROP TABLE {t}')"
                )
            except Exception as e:
                logger.debug("ignoring %s: %s", type(e).__name__, e)


def test_hana_execute_error_propagation(node_factory):
    """trex_hana_execute() raises RuntimeError on invalid SQL, not a success string."""
    node = node_factory(load_hana=True, load_db=False)
    with pytest.raises(RuntimeError):
        node.execute(
            f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
            f"'DROP TABLE NONEXISTENT_TABLE_XYZ_12345')"
        )


def test_hana_scan_error_handling(node_factory):
    """trex_hana_scan() raises RuntimeError on invalid SQL."""
    node = node_factory(load_hana=True, load_db=False)
    with pytest.raises(RuntimeError):
        node.execute(
            f"SELECT * FROM trex_hana_scan('SELECT * FROM NONEXISTENT_TABLE_XYZ', "
            f"'{HANA_TEST_URL}')"
        )


# ---------------------------------------------------------------------------
# Type / edge-case regression tests
#
# Each guards a bug found in the 2026-06 scenario sweep against live HANA.
# ---------------------------------------------------------------------------


def test_hana_scan_binary_not_null(node_factory):
    """Regression: BLOB/VARBINARY columns return their bytes, not NULL.

    HdbValue::try_into is serde-based and deserialises Vec<u8> as a sequence,
    so binary used to silently come back NULL.
    """
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT octet_length(vb) FROM trex_hana_scan("
        f"'SELECT CAST(''ABC'' AS VARBINARY) AS vb FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert len(result) == 1
    assert result[0][0] == 3, f"expected 3 bytes (not NULL), got {result[0]}"


def test_hana_scan_trailing_semicolon(node_factory):
    """Regression: a trailing ';' must not collapse the result to one column.

    The schema-detection wrap `SELECT * FROM (<query>) AS subquery LIMIT 1`
    is a syntax error when <query> ends in ';', which used to drop all but
    the first column.
    """
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT 1 AS a, 2 AS b, ''x'' AS c FROM DUMMY;', "
        f"'{HANA_TEST_URL}')"
    )
    assert len(result) == 1
    row = result[0]
    assert len(row) == 3, f"Expected 3 columns, got {len(row)}: {row}"
    assert row[0] == 1
    assert row[1] == 2
    assert row[2] == "x"


def test_hana_scan_duplicate_column_names(node_factory):
    """Regression: duplicate column names are de-duplicated, not a binder error.

    duckdb rejects duplicate result column names, which used to hard-fail any
    join projecting two same-named columns (common in CDM).
    """
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT 1 AS dup, 2 AS dup, 3 AS dup FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert len(result) == 1
    row = result[0]
    assert len(row) == 3, f"Expected 3 columns, got {len(row)}: {row}"
    assert row[0] == 1
    assert row[1] == 2
    assert row[2] == 3


def test_hana_scan_decimal_is_numeric(node_factory):
    """Regression: DECIMAL columns arrive as a numeric type, not varchar.

    HANA delivers decimals via FIXED8/12/16 transport ids, which were
    unmapped and fell back to varchar; they now map to DOUBLE.
    """
    node = node_factory(load_hana=True, load_db=False)
    typ = node.execute(
        f"SELECT typeof(amt) FROM trex_hana_scan("
        f"'SELECT CAST(10.50 AS DECIMAL(10,2)) AS amt FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert typ[0][0] == "DOUBLE", f"expected numeric DOUBLE, got {typ[0]}"
    total = node.execute(
        f"SELECT sum(amt) FROM trex_hana_scan("
        f"'SELECT CAST(10.50 AS DECIMAL(10,2)) AS amt FROM DUMMY "
        f"UNION ALL SELECT CAST(20.25 AS DECIMAL(10,2)) AS amt FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert abs(total[0][0] - 30.75) < 1e-9, f"expected 30.75, got {total[0]}"


def test_hana_scan_timestamp_normalized(node_factory):
    """Regression: TIMESTAMP uses a space separator with trimmed fraction.

    HANA serialises `2024-01-15T12:34:56.7890000`; it is normalised to
    `2024-01-15 12:34:56.789` for clean downstream parsing.
    """
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute(
        f"SELECT * FROM trex_hana_scan("
        f"'SELECT TIMESTAMP''2024-01-15 12:34:56.789'' AS ts FROM DUMMY', "
        f"'{HANA_TEST_URL}')"
    )
    assert len(result) == 1
    ts = result[0][0]
    assert ts == "2024-01-15 12:34:56.789", f"got {ts!r}"
    assert "T" not in ts


# ---------------------------------------------------------------------------
# hana_attach / hana_detach / hana_tables tests
#
# Uses a small dedicated test schema (TREX_TEST_ATTACH) with 1 table
# so that attach completes in < 1s.  This avoids the 30s subprocess
# timeout that would be needed for the 200-table SYS schema.
# ---------------------------------------------------------------------------

ATTACH_SCHEMA = "TREX_TEST_ATTACH"


def _ensure_test_schema(node):
    """Create the test schema + table in HANA (idempotent)."""
    try:
        node.execute(
            f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
            f"'CREATE SCHEMA {ATTACH_SCHEMA}')"
        )
    except RuntimeError as e:
        logger.debug("ignoring %s: %s", type(e).__name__, e)
    # Drop and recreate to ensure correct schema
    try:
        node.execute(
            f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
            f"'DROP TABLE {ATTACH_SCHEMA}.T1')"
        )
    except RuntimeError as e:
        logger.debug("ignoring %s: %s", type(e).__name__, e)
    node.execute(
        f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
        f"'CREATE TABLE {ATTACH_SCHEMA}.T1 (ID INT, NAME NVARCHAR(50))')"
    )
    node.execute(
        f"SELECT trex_hana_execute('{HANA_TEST_URL}', "
        f"'INSERT INTO {ATTACH_SCHEMA}.T1 VALUES (42, ''hello'')')"
    )


def test_hana_tables_empty(node_factory):
    """trex_hana_tables() returns empty result when nothing is attached."""
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute("SELECT * FROM trex_hana_tables()")
    assert result == []


def test_trex_hana_attach(node_factory):
    """trex_hana_attach() discovers tables and registers them."""
    node = node_factory(load_hana=True, load_db=False)
    _ensure_test_schema(node)
    result = node.execute(
        f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '{ATTACH_SCHEMA}')"
    )
    assert len(result) >= 1
    table_names = [row[0] for row in result]
    full_names = [row[1] for row in result]
    assert "T1" in table_names
    assert f"HANA__test_{ATTACH_SCHEMA}_T1" in full_names


def test_hana_attach_replacement_scan(node_factory):
    """After attach, HANA__<dbname>_<schema>_<table> resolves via replacement scan."""
    node = node_factory(load_hana=True, load_db=False)
    _ensure_test_schema(node)
    node.execute(
        f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '{ATTACH_SCHEMA}')"
    )
    result = node.execute(f"SELECT * FROM HANA__test_{ATTACH_SCHEMA}_T1")
    assert len(result) >= 1
    assert result[0][0] == 42


def test_hana_attach_schema_view(node_factory):
    """After attach, <dbname>_<schema>.<table> resolves via trexsql view."""
    node = node_factory(load_hana=True, load_db=False)
    _ensure_test_schema(node)
    node.execute(
        f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '{ATTACH_SCHEMA}')"
    )
    result = node.execute(f'SELECT * FROM test_{ATTACH_SCHEMA}."T1"')
    assert len(result) >= 1
    assert result[0][0] == 42


def test_hana_tables_after_attach(node_factory):
    """trex_hana_tables() lists attached tables after trex_hana_attach()."""
    node = node_factory(load_hana=True, load_db=False)
    _ensure_test_schema(node)
    node.execute(
        f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '{ATTACH_SCHEMA}')"
    )
    result = node.execute("SELECT * FROM trex_hana_tables()")
    assert len(result) >= 1
    table_names = [row[0] for row in result]
    assert "T1" in table_names


def test_trex_hana_detach(node_factory):
    """trex_hana_detach() removes tables from registry and drops schema."""
    node = node_factory(load_hana=True, load_db=False)
    _ensure_test_schema(node)
    node.execute(
        f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '{ATTACH_SCHEMA}')"
    )
    result = node.execute("SELECT * FROM trex_hana_tables()")
    assert len(result) >= 1

    result = node.execute(f"SELECT trex_hana_detach('test', '{ATTACH_SCHEMA}')")
    assert "Detached" in result[0][0]

    result = node.execute("SELECT * FROM trex_hana_tables()")
    assert result == []


def test_hana_attach_replacement_scan_case_insensitive(node_factory):
    """Replacement scan lookup is case-insensitive."""
    node = node_factory(load_hana=True, load_db=False)
    _ensure_test_schema(node)
    node.execute(
        f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '{ATTACH_SCHEMA}')"
    )
    # trexsql uppercases unquoted identifiers, so lowercase should resolve
    result = node.execute(f"SELECT * FROM hana__test_{ATTACH_SCHEMA.lower()}_t1")
    assert len(result) >= 1


def test_hana_attach_reattach_same_key(node_factory):
    """Re-attaching the same dbname+schema replaces the previous attachment."""
    node = node_factory(load_hana=True, load_db=False)
    _ensure_test_schema(node)
    # Attach once
    node.execute(
        f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '{ATTACH_SCHEMA}')"
    )
    result1 = node.execute("SELECT * FROM trex_hana_tables()")
    count1 = len(result1)
    assert count1 >= 1

    # Re-attach same key — should replace, not duplicate
    node.execute(
        f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '{ATTACH_SCHEMA}')"
    )
    result2 = node.execute("SELECT * FROM trex_hana_tables()")
    assert len(result2) == count1

    # Replacement scan still works after re-attach
    result = node.execute(f"SELECT * FROM HANA__test_{ATTACH_SCHEMA}_T1")
    assert len(result) >= 1
    assert result[0][0] == 42


def test_hana_attach_empty_dbname(node_factory):
    """trex_hana_attach() rejects empty dbname."""
    node = node_factory(load_hana=True, load_db=False)
    with pytest.raises(RuntimeError, match="dbname"):
        node.execute(
            f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', '', '{ATTACH_SCHEMA}')"
        )


def test_hana_attach_empty_schema(node_factory):
    """trex_hana_attach() rejects empty schema."""
    node = node_factory(load_hana=True, load_db=False)
    with pytest.raises(RuntimeError, match="schema"):
        node.execute(
            f"SELECT * FROM trex_hana_attach('{HANA_TEST_URL}', 'test', '')"
        )


def test_hana_detach_nonexistent(node_factory):
    """trex_hana_detach() on a non-existent attachment returns 0 tables detached."""
    node = node_factory(load_hana=True, load_db=False)
    result = node.execute("SELECT trex_hana_detach('nonexistent', 'NOPE')")
    assert "Detached 0 tables" in result[0][0]
