"""Regression test for pgwire server restart on the same host:port.

Before the fix in ``plugins/pgwire/src/server_registry.rs``, ``stop_server``
sent the shutdown oneshot and returned without joining the spawned server
thread. The OS hadn't released the listener yet, so a new ``trex_pgwire_start``
on the same ``host:port`` raced the still-shutting-down accept loop and hit
``EADDRINUSE``. In some manifestations the trex process was killed by the
panic propagating out of the spawned tokio runtime, leaving an external
SIGTERM (signal 15) in the container logs.

The fix mirrors the FHIR plugin: ``stop_server`` now removes the registry
entry while briefly holding the lock, drops the lock, sends the shutdown
signal, and joins the thread handle so the port is fully released before
returning.

This test exercises the fix by:
  1. Looping ``trex_pgwire_start`` -> ``trex_pgwire_stop`` 3 times on the
     same port. Without the join, iteration 2's bind would race iteration
     1's still-closing socket; with the join, every cycle succeeds.
  2. After each stop, asserting ``trex_pgwire_status()`` has 0 rows for the
     port — i.e. no dangling registry entry.
  3. Calling ``trex_pgwire_stop`` once more on the no-longer-running server
     and asserting it returns a clean ``No server running`` error rather
     than panicking.
  4. Ending with ``SELECT 1`` heartbeat — if trex SIGTERMed mid-test the
     pgwire connection would be dead and this would raise.

Assumes the docker-compose ``trexsql-trex-1`` container is reachable on the
host's ``localhost:5433`` with seeded ``trex / trex`` credentials.
"""

from __future__ import annotations

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

# Distinct from the 5432/5433 already-bound pgwire and from the
# integration-tests in-process port range (19200+) used by node_factory.
RESTART_PORT = 28291

CYCLES = 3


def _connect():
    if psycopg2 is None:
        pytest.skip("psycopg2 not available")
    return psycopg2.connect(
        host=PGWIRE_HOST,
        port=PGWIRE_PORT,
        user=PGWIRE_USER,
        password=PGWIRE_PASSWORD,
        dbname=PGWIRE_DB,
    )


def _scalar(cur, sql, *args):
    cur.execute(sql, args)
    row = cur.fetchone()
    return row[0] if row else None


def _row_count_for_port(cur, port: int) -> int:
    cur.execute(
        "SELECT count(*) FROM trex_pgwire_status() WHERE port = %s",
        (str(port),),
    )
    return cur.fetchone()[0]


@pytest.fixture(scope="module", autouse=True)
def _ensure_clean_port():
    """Make sure RESTART_PORT is free before and after the module runs.

    A previous failed run can leave a registered server on this port; clean
    up so the test starts from a known state. Failures here are non-fatal.
    """
    try:
        conn = _connect()
    except Exception:
        # If the container isn't reachable at all, leave it for the test
        # body to surface a clear failure.
        return
    try:
        conn.autocommit = True
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT trex_pgwire_stop(%s, %s)",
                (PGWIRE_HOST.replace("localhost", "127.0.0.1"), RESTART_PORT),
            )
            cur.fetchone()
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)
        cur.close()
    finally:
        conn.close()
    yield


def test_pgwire_start_stop_cycle_no_eaddrinuse():
    """3x start/stop cycles on the same port must all succeed.

    Without the ``thread_handle.join()`` in ``ServerRegistry::stop_server``
    the second iteration's bind races the first iteration's still-closing
    listener and either fails with EADDRINUSE or kills trex.
    """
    conn = _connect()
    try:
        conn.autocommit = True
        cur = conn.cursor()

        for i in range(CYCLES):
            start_msg = _scalar(
                cur,
                "SELECT trex_pgwire_start(%s, %s, %s, %s)",
                "127.0.0.1",
                RESTART_PORT,
                "regr-restart",
                "",
            )
            assert isinstance(start_msg, str), f"iter {i}: unexpected start result: {start_msg!r}"
            assert "Started" in start_msg, (
                f"iter {i}: start did not succeed (likely EADDRINUSE from "
                f"prior cycle's unjoined thread): {start_msg!r}"
            )

            running = _row_count_for_port(cur, RESTART_PORT)
            assert running == 1, f"iter {i}: expected 1 status row after start, got {running}"

            stop_msg = _scalar(
                cur,
                "SELECT trex_pgwire_stop(%s, %s)",
                "127.0.0.1",
                RESTART_PORT,
            )
            assert isinstance(stop_msg, str), f"iter {i}: unexpected stop result: {stop_msg!r}"
            assert "Stopped" in stop_msg, f"iter {i}: stop did not return success: {stop_msg!r}"

            after = _row_count_for_port(cur, RESTART_PORT)
            assert after == 0, (
                f"iter {i}: dangling registry row after stop (got {after}); "
                f"server_registry.stop_server failed to remove the entry"
            )

        # Heartbeat: trex still alive and serving queries after 3 cycles.
        assert _scalar(cur, "SELECT 1") == 1
        cur.close()
    finally:
        conn.close()


def test_pgwire_stop_non_running_returns_clean_error():
    """Stopping a server that was never started (or already stopped) must
    return a structured error rather than crashing trex. The pgwire VScalar
    wraps the registry Err into an "Error: ..." string in the result column.
    """
    conn = _connect()
    try:
        conn.autocommit = True
        cur = conn.cursor()

        # Belt-and-braces: make sure nothing is registered for the port.
        before = _row_count_for_port(cur, RESTART_PORT)
        assert before == 0, f"unexpected pre-existing server on {RESTART_PORT}: {before} rows"

        # The pgwire stop scalar returns the error text as the result value
        # rather than raising — see StopPgWireServerScalar in lib.rs.
        result = _scalar(
            cur,
            "SELECT trex_pgwire_stop(%s, %s)",
            "127.0.0.1",
            RESTART_PORT,
        )
        assert isinstance(result, str)
        # Either "Error: No server running on ..." or any "No server running"
        # substring is acceptable — we just want a structured error, not a
        # crash or a phantom success.
        assert "No server running" in result, (
            f"stop on non-running server returned unexpected payload: {result!r}"
        )

        # Heartbeat after the error path — proves trex didn't crash.
        assert _scalar(cur, "SELECT 1") == 1
        cur.close()
    finally:
        conn.close()
