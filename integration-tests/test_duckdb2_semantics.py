"""DuckDB 2.0 SQL-semantics checks, run over pgwire against a trex node."""

import psycopg
import pytest


@pytest.fixture
def pg(node_factory):
    node = node_factory(load_pgwire=True, load_db=False)
    node.execute(
        f"SELECT trex_pgwire_start('127.0.0.1', {node.pgwire_port}, 'test', '')"
    )
    conn = psycopg.connect(
        host="127.0.0.1", port=node.pgwire_port, user="any",
        password="test", dbname="memory", autocommit=True,
    )
    yield conn
    conn.close()


def _assert_errors_then_alive(conn, sql):
    with pytest.raises(psycopg.errors.Error) as exc:
        conn.execute(sql).fetchall()
    assert exc.value.sqlstate
    # The same connection must stay usable after the error.
    assert conn.execute("SELECT 1").fetchone() == (1,)


def test_integer_division_operator_removed(pg):
    _assert_errors_then_alive(pg, "SELECT 1 // 0")


def test_modulo_by_zero_errors(pg):
    _assert_errors_then_alive(pg, "SELECT 5 % 0")


def test_single_arrow_lambda_disabled(pg):
    _assert_errors_then_alive(pg, "SELECT list_transform([1,2], x -> x + 1)")


def test_python_style_lambda(pg):
    row = pg.execute("SELECT list_transform([1,2], lambda x: x + 1)").fetchone()
    assert list(row[0]) == [2, 3] or row[0] in ("{2,3}", "[2, 3]")


def test_merge_duplicate_source_key_errors(pg):
    pg.execute("CREATE TABLE tgt(id INT, v INT)")
    pg.execute("INSERT INTO tgt VALUES (1, 0)")
    _assert_errors_then_alive(
        pg,
        "MERGE INTO tgt USING (VALUES (1, 10), (1, 20)) AS s(id, v) "
        "ON tgt.id = s.id WHEN MATCHED THEN UPDATE SET v = s.v",
    )


def test_regex_tilde_operator(pg):
    assert pg.execute("SELECT 'abc' ~ 'b'").fetchone() == (True,)
