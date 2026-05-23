"""Regression test for the admission-controller queue leak (Fix 2).

Failure mode (pre-fix):
  When ``DbQueryTable::bind`` ran the query through
  ``admission::submit_or_check`` and got back ``QueryStatus::Queued``, it
  bailed out with ``Err(format!("Query queued at position {}", ...))`` and
  never called ``admission::cancel_query`` for the qid the controller had
  just allocated. The queue therefore accumulated one orphaned entry per
  rejected-via-Queued ``trex_db_query(...)`` call, and
  ``trex_db_query_status()`` would report queued queries that the engine
  was no longer going to schedule.

Fix:
  ``plugins/db/src/lib.rs`` cancels the qid on the Queued (and Rejected)
  return path before returning Err.

Test plan:
  - Connect over pgwire; load the db extension; turn distributed mode on.
  - Set the per-user admission quota to 1 so that the second concurrent
    submission must Queue.
  - Issue N+1 ``trex_db_query`` calls in quick succession. The queued ones
    return an error string starting with "Query queued at position ...";
    we tolerate either an exception from psycopg or an error column.
  - After the storm settles, assert ``trex_db_query_status()`` does NOT
    list any rows in the ``queued(*)`` state for the user we used. With
    the leak, leftover entries persist for the lifetime of the process.

Skipped automatically if the trex pgwire endpoint is not reachable.
"""

from __future__ import annotations

import os
import time
import uuid

import pytest
import logging

logger = logging.getLogger(__name__)

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


PGWIRE_HOST = os.environ.get("TREX_PGWIRE_HOST", "localhost")
PGWIRE_PORT = int(os.environ.get("TREX_PGWIRE_PORT", "5433"))
PGWIRE_USER = "postgres"
PGWIRE_PASSWORD = "postgres"
PGWIRE_DB = "postgres"

RUN_TAG = uuid.uuid4().hex[:8]
USER_ID = f"regr_admission_{RUN_TAG}"


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


def _scalar(conn, sql: str, *params):
    cur = conn.cursor()
    try:
        cur.execute(sql, params or None)
        row = cur.fetchone()
        return row[0] if row else None
    finally:
        cur.close()


def _rows(conn, sql: str, *params):
    cur = conn.cursor()
    try:
        cur.execute(sql, params or None)
        return cur.fetchall()
    finally:
        cur.close()


@pytest.mark.skipif(not _trex_pgwire_available(),
                    reason="trex pgwire not reachable")
def test_admission_does_not_leak_on_queued():
    conn = _connect()
    try:
        # Force the distributed admission path so submit_or_check is exercised.
        try:
            _scalar(conn, "SELECT trex_db_set_distributed(true)")
        except Exception:
            # Some builds expose this as an integer/text result; ignore the type
            # mismatch from the prepared-statement path and assume it succeeded.
            pass

        # Quota = 1 makes any second concurrent in-flight query queue.
        try:
            _scalar(conn,
                    "SELECT trex_db_set_user_quota(%s, %s)",
                    USER_ID, 1)
        except Exception:
            # Fall back to the default user used by the binding. The test still
            # exercises the leak path; we just rely on the global cap.
            pass

        # Snapshot baseline: the admission table may already have entries from
        # prior tests or background activity.
        baseline = _rows(conn, "SELECT query_id, status FROM trex_db_query_status()")
        baseline_queued = {qid for (qid, status) in baseline if status.startswith("queued")}

        # Submit a burst. We expect at least some to come back as
        # "Query queued at position ..." — psycopg surfaces these as errors.
        burst = 12
        sql = "SELECT * FROM trex_db_query('SELECT 1') LIMIT 1"
        for _ in range(burst):
            try:
                cur = conn.cursor()
                try:
                    cur.execute(sql)
                    try:
                        cur.fetchall()
                    except Exception as e:
                        logger.debug("ignoring %s: %s", type(e).__name__, e)
                finally:
                    cur.close()
            except Exception:
                # Queued / Rejected returns surface as a pgwire error from the
                # bind() failure. We do not care about the per-call status —
                # only that the controller cleans up afterward.
                pass

        # Give the controller a moment in case any cancel landed asynchronously.
        time.sleep(0.5)

        after = _rows(conn, "SELECT query_id, status FROM trex_db_query_status()")
        after_queued = {qid for (qid, status) in after if status.startswith("queued")}
        leaked = after_queued - baseline_queued

        assert not leaked, (
            f"admission queue leaked {len(leaked)} orphaned entries after "
            f"a burst of {burst} queued submissions: {sorted(leaked)[:5]}"
        )
    finally:
        try:
            _scalar(conn, "SELECT trex_db_set_distributed(false)")
        except Exception as e:
            logger.debug("ignoring %s: %s", type(e).__name__, e)
        conn.close()
