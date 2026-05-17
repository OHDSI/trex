"""Regression test for the Flight-server registry phantom-entry bug (Fix 3).

Failure mode (pre-fix):
  ``flight_server::start_flight_server[_with_tls]`` reserves a slot in the
  ``ServerRegistry`` synchronously and then spawns the listening thread.
  If the thread later fails internally — bind error on a port already in
  use, parse error on an invalid host, runtime build failure, or
  ``serve()`` returning Err — nobody removed the registry entry. The
  registry then reported a phantom server forever via
  ``trex_db_flight_status()``.

Fix:
  The spawned thread holds an RAII ``DeregisterOnDrop`` guard for the
  ``host:port`` it reserved. Any exit path — Ok, Err, panic — drops the
  guard and the registry slot is reclaimed.

Test plan:
  - Connect over pgwire; load the db extension.
  - Snapshot ``trex_db_flight_status()`` so we can compare deltas.
  - Call ``trex_db_flight_start('not a real hostname', 65530)``. The
    address parse fails inside the spawned thread, so the call returns
    success/string at the SQL layer but the thread aborts immediately.
  - Wait briefly for the thread to run + drop the guard.
  - Assert the registry does not list the bogus entry.

The same logic protects port-conflict and bind-error cases; we exercise
the parse-failure path because it is the most reliable to trigger from a
test without colliding with concurrent suites.

Skipped automatically if the trex pgwire endpoint is not reachable.
"""

from __future__ import annotations

import os
import time

import pytest

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

# Pick a host string that ``"<host>:<port>".parse::<SocketAddr>()`` is
# guaranteed to reject. SocketAddr cannot represent unresolved DNS names;
# only literal IP addresses parse.
BAD_HOST = "not.a.real.host.invalid"
BAD_PORT = 65530


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


def _rows(conn, sql: str):
    cur = conn.cursor()
    try:
        cur.execute(sql)
        return cur.fetchall()
    finally:
        cur.close()


@pytest.mark.skipif(not _trex_pgwire_available(),
                    reason="trex pgwire not reachable")
def test_flight_server_failed_start_does_not_register_phantom():
    conn = _connect()
    try:
        before = _rows(conn,
                       "SELECT hostname, port FROM trex_db_flight_status()")
        before_set = {(h, p) for (h, p) in before}

        # Trigger a start that will reserve a slot and then fail in-thread.
        # The SQL function returns a status string regardless; we don't
        # assert on the string, only on the registry side-effect.
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT trex_db_flight_start(%s, %s)",
                (BAD_HOST, BAD_PORT),
            )
            try:
                cur.fetchall()
            except Exception:
                pass
        except Exception:
            # Some pgwire bridges turn the "Error: ..." string into an
            # exception. Either way, the in-process registry is what we test.
            pass
        finally:
            cur.close()

        # Give the spawned thread time to bail, drop its guard, and let the
        # registry reclaim the slot.
        time.sleep(1.0)

        after = _rows(conn,
                      "SELECT hostname, port FROM trex_db_flight_status()")
        after_set = {(h, p) for (h, p) in after}

        new_entries = after_set - before_set
        bad_entries = [(h, p) for (h, p) in new_entries
                       if str(p) == str(BAD_PORT) or h == BAD_HOST]

        assert not bad_entries, (
            f"flight registry still reports phantom server(s) {bad_entries} "
            f"after a failed start; full delta: {sorted(new_entries)}"
        )
    finally:
        # Best-effort cleanup in case some future change makes the bogus
        # start succeed enough to leave a real entry behind.
        try:
            cur = conn.cursor()
            cur.execute("SELECT trex_db_flight_stop(%s, %s)",
                        (BAD_HOST, BAD_PORT))
            cur.close()
        except Exception:
            pass
        conn.close()
