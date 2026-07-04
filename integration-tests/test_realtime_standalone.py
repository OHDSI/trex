"""End-to-end integration tests for trex's native "realtime" feature
(Supabase-Realtime-compatible: Phoenix-protocol WebSocket channels,
postgres_changes via logical replication + RLS, broadcast, presence).

DEFERRED-RUN NOTICE
--------------------
This suite requires a FULLY RUNNING trex stack (``docker compose up``, or
equivalent) reachable at ``http://localhost:8001`` (override with
``TREX_BASE_URL``), plus direct access to its backing Postgres (the same
Postgres trex's ``DATABASE_URL`` points at — override with ``DATABASE_URL``;
defaults to ``postgres://postgres:mypass@localhost:65433/testdb``, matching
``docker-compose.yml``'s ``postgres`` service, which maps host port 65433 to
container port 5432). It was authored WITHOUT such a stack available in this
environment: only ``python -m py_compile`` (parses) and import-shape review
were possible here. Every test function below is written to run against the
real server (real WebSocket handshake, real Postgres DDL/DML, real logical
replication) — running it requires the deferred full-stack pass. The module
skips itself cleanly (not a hard failure) when the stack, Postgres, or the
``websockets``/``psycopg`` packages aren't available, matching the
reachability-skip convention used by ``test_regr_mcp_protocol.py`` /
``test_regr_transform_graphql.py`` / ``test_regr_db_admission_no_leak.py``.

Protocol facts this suite relies on (see core/server/realtime/*.ts):
  * Route prefix: ``${BASE_PATH}/realtime/v1/websocket`` (WS) and
    ``${BASE_PATH}/realtime/v1/api/broadcast`` (HTTP), ``BASE_PATH=/trex``.
  * WS auth: ``?apikey=<JWT>&vsn=1.0.0`` query params (JSON frame serializer).
  * Frame shape: ``{topic, event, payload, ref, join_ref}``.
  * ``phx_join`` reply: ``payload == {status, response}``; for
    ``postgres_changes`` config, ``response.postgres_changes`` is the list of
    assigned bindings (each has an ``id``).
  * ``postgres_changes`` delivery: ``{event:"postgres_changes",
    payload:{ids:[...], data:{type, schema, table, record, old_record?,
    columns, commit_timestamp, errors}}}`` — ``data.type`` is
    ``"INSERT"|"UPDATE"|"DELETE"``.
  * ``broadcast``: client push payload is relayed verbatim as event
    ``"broadcast"``; ``self``/``ack`` are per-channel config
    (``config.broadcast.self`` / ``.ack``).
  * ``presence``: ``presence_state`` sent to the joining channel on join;
    ``track``/``untrack`` pushes broadcast ``presence_diff``
    (``{joins, leaves}``) to the topic; ``presence_state`` payload is
    ``{[key]: {metas}}`` directly (not reply-wrapped).
  * Private channels (``config.private: true``) are authorized via RLS
    policies on ``realtime.messages`` keyed on ``realtime.topic()`` — see
    ``core/server/realtime/authz.ts`` / ``authz.test.ts``.
  * Replication slot name is ``trex_realtime`` (see
    ``core/server/realtime/index.ts``'s ``startRealtimeService`` log line and
    ``replication.ts``), publication ``supabase_realtime`` (empty by default,
    tables are added via ``ALTER PUBLICATION ... ADD TABLE``).
  * JWTs: login (``/trex/auth/v1/token?grant_type=password``) mints a
    ``role: "authenticated"`` token. The long-lived ``anon``/``service_role``
    tokens are generated once and stored in Postgres at
    ``trexdb.setting`` under keys ``auth.anonKey`` / ``auth.serviceRoleKey``
    (see ``core/server/auth/jwt.ts`` / ``api-keys.ts``) — fetched here via a
    direct DB query rather than a stack-internal env var.

Known gotcha exercised deliberately by ``test_private_channel_denied``:
``core/server/realtime/migrations/V1__realtime_schema.sql`` does NOT enable
row level security on ``realtime.messages`` by default (comment: "RLS on
realtime.messages is added by later tasks") — without RLS enabled, private
channels would be readable by anyone (base GRANT SELECT covers all app
roles). That test enables RLS itself (idempotent) to exercise the
authorization path, matching the precedent already set by
``core/server/realtime/authz.test.ts``. Because ``ALTER TABLE ... ENABLE ROW
LEVEL SECURITY`` isn't undone afterward (same as that existing test), this is
a one-way change to whatever DB the suite runs against — acceptable for a
disposable/dev stack, called out here for visibility.

Run (once a stack is up): ``cd integration-tests && python -m pytest
test_realtime_standalone.py -v`` (or ``make test-realtime``).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from typing import Callable

import pytest

try:
    import websockets
except ImportError:  # pragma: no cover - environment-dependent
    websockets = None

try:
    import psycopg

    PSYCOPG_VERSION = 3
except ImportError:  # pragma: no cover - environment-dependent
    try:
        import psycopg2 as psycopg

        PSYCOPG_VERSION = 2
    except ImportError:
        psycopg = None
        PSYCOPG_VERSION = None


BASE_URL = os.environ.get("TREX_BASE_URL", "http://localhost:8001")
BASE_PATH = "/trex"
WS_BASE_URL = (
    BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + BASE_PATH
)
ADMIN_EMAIL = "admin@trex.local"
ADMIN_PASSWORD = "password"
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    f"postgres://postgres:{os.environ.get('POSTGRES_PASSWORD', 'mypass')}@localhost:65433/testdb",
)
REPLICATION_SLOT = "trex_realtime"


# -----------------------------------------------------------------------------
# Plain HTTP helper (urllib, matching test_regr_mcp.py / test_regr_mcp_protocol.py)
# -----------------------------------------------------------------------------


def _http(
    method: str,
    path: str,
    *,
    headers: dict[str, str] | None = None,
    body: bytes | None = None,
    timeout: float = 10.0,
) -> tuple[int, bytes]:
    req = urllib.request.Request(
        BASE_URL + path, method=method, data=body, headers=headers or {}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _password_token(email: str, password: str) -> str:
    status, raw = _http(
        "POST",
        f"{BASE_PATH}/auth/v1/token?grant_type=password",
        headers={"Content-Type": "application/json"},
        body=json.dumps({"email": email, "password": password}).encode(),
    )
    assert status == 200, f"login failed: {status} {raw[:300]!r}"
    return json.loads(raw)["access_token"]


def _trex_available() -> bool:
    try:
        status, _raw = _http("GET", f"{BASE_PATH}/realtime/v1/health", timeout=3.0)
        return status == 200
    except Exception:
        return False


def _connect_db():
    return psycopg.connect(DATABASE_URL)


def _db_available() -> bool:
    if psycopg is None:
        return False
    try:
        conn = _connect_db()
        conn.close()
        return True
    except Exception:
        return False


def _setting_value(key: str) -> str:
    """Fetch a long-lived JWT (anon/service_role) stored in trexdb.setting."""
    conn = _connect_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT value #>> '{}' FROM trexdb.setting WHERE key = %s", (key,))
        row = cur.fetchone()
        assert row and row[0], f"setting {key!r} not found in trexdb.setting"
        return row[0]
    finally:
        conn.close()


def _safe(cur, sql: str) -> None:
    """Best-effort cleanup statement — never let teardown mask a real failure."""
    with contextlib.suppress(Exception):
        cur.execute(sql)


# -----------------------------------------------------------------------------
# Reachability gate — skips the whole module cleanly, never hard-fails in CI
# without a live stack.
# -----------------------------------------------------------------------------


@pytest.fixture(scope="module", autouse=True)
def _require_stack():
    if websockets is None:
        pytest.skip("websockets package not installed")
    if psycopg is None:
        pytest.skip("psycopg/psycopg2 not installed")
    if not _trex_available():
        pytest.skip(f"trex not reachable at {BASE_URL}")
    if not _db_available():
        pytest.skip(f"postgres not reachable at {DATABASE_URL}")


@pytest.fixture(scope="module")
def admin_token() -> str:
    return _password_token(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def anon_token() -> str:
    return _setting_value("auth.anonKey")


@pytest.fixture(scope="module")
def service_token() -> str:
    return _setting_value("auth.serviceRoleKey")


@pytest.fixture()
def db():
    conn = _connect_db()
    conn.autocommit = True
    try:
        yield conn
    finally:
        conn.close()


# -----------------------------------------------------------------------------
# Phoenix protocol client helper (vsn=1.0.0 JSON frames)
# -----------------------------------------------------------------------------


class Phx:
    def __init__(self, ws):
        self.ws = ws
        self.ref = 0

    async def push(
        self, topic: str, event: str, payload: dict, join_ref: str = "1"
    ) -> str:
        self.ref += 1
        ref = str(self.ref)
        await self.ws.send(
            json.dumps(
                {
                    "topic": topic,
                    "event": event,
                    "payload": payload,
                    "ref": ref,
                    "join_ref": join_ref,
                }
            )
        )
        return ref

    async def recv_until(
        self, pred: Callable[[dict], bool], timeout: float = 10.0
    ) -> dict:
        """Consume frames until one satisfies pred, or raise on timeout.

        Uses wait_for/loop-clock deadline tracking (not asyncio.timeout(),
        which requires Python 3.11+) for broader interpreter compatibility.
        """
        loop = asyncio.get_event_loop()
        deadline = loop.time() + timeout
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                raise TimeoutError(
                    f"no frame matched predicate within {timeout}s"
                )
            raw = await asyncio.wait_for(self.ws.recv(), timeout=remaining)
            msg = json.loads(raw)
            if pred(msg):
                return msg

    async def recv_none_within(
        self, pred: Callable[[dict], bool], timeout: float = 2.0
    ) -> bool:
        """True if NO frame matching pred arrives within timeout (negative check)."""
        try:
            await self.recv_until(pred, timeout=timeout)
            return False
        except (TimeoutError, asyncio.TimeoutError):
            return True

    async def close(self) -> None:
        await self.ws.close()


async def connect(token: str) -> Phx:
    url = (
        f"{WS_BASE_URL}/realtime/v1/websocket"
        f"?apikey={urllib.parse.quote(token, safe='')}&vsn=1.0.0"
    )
    ws = await websockets.connect(url, open_timeout=10, close_timeout=5)
    return Phx(ws)


async def join(phx: Phx, topic: str, config: dict, join_ref: str = "1") -> dict:
    ref = await phx.push(topic, "phx_join", {"config": config}, join_ref=join_ref)
    return await phx.recv_until(
        lambda m: m["event"] == "phx_reply" and m["ref"] == ref
    )


def rt_topic(name: str) -> str:
    return f"realtime:{name}"


# -----------------------------------------------------------------------------
# 1. postgres_changes: INSERT / UPDATE / DELETE
# -----------------------------------------------------------------------------


async def _test_postgres_changes_insert_update_delete(admin_token, db):
    table = f"rt_iud_{uuid.uuid4().hex[:8]}"
    cur = db.cursor()
    cur.execute(f'CREATE TABLE public."{table}" (id int PRIMARY KEY, note text)')
    cur.execute(f'GRANT SELECT ON public."{table}" TO authenticated')
    cur.execute(f'ALTER PUBLICATION supabase_realtime ADD TABLE public."{table}"')
    try:
        phx = await connect(admin_token)
        try:
            topic = rt_topic(f"iud-{uuid.uuid4().hex[:8]}")
            reply = await join(
                phx,
                topic,
                {"postgres_changes": [{"event": "*", "schema": "public", "table": table}]},
            )
            assert reply["payload"]["status"] == "ok", reply
            bindings = reply["payload"]["response"]["postgres_changes"]
            assert len(bindings) == 1, bindings
            binding_id = bindings[0]["id"]

            cur.execute(f'INSERT INTO public."{table}" (id, note) VALUES (1, %s)', ("hello",))
            msg = await phx.recv_until(lambda m: m["event"] == "postgres_changes")
            assert msg["payload"]["ids"] == [binding_id], msg
            data = msg["payload"]["data"]
            assert data["type"] == "INSERT"
            assert data["table"] == table
            assert data["record"] == {"id": 1, "note": "hello"}

            cur.execute(f'UPDATE public."{table}" SET note = %s WHERE id = 1', ("world",))
            msg = await phx.recv_until(
                lambda m: m["event"] == "postgres_changes"
                and m["payload"]["data"]["type"] == "UPDATE"
            )
            assert msg["payload"]["ids"] == [binding_id]
            assert msg["payload"]["data"]["record"] == {"id": 1, "note": "world"}

            cur.execute(f'DELETE FROM public."{table}" WHERE id = 1')
            msg = await phx.recv_until(
                lambda m: m["event"] == "postgres_changes"
                and m["payload"]["data"]["type"] == "DELETE"
            )
            assert msg["payload"]["ids"] == [binding_id]
            assert msg["payload"]["data"]["old_record"]["id"] == 1
        finally:
            await phx.close()
    finally:
        _safe(cur, f'ALTER PUBLICATION supabase_realtime DROP TABLE public."{table}"')
        _safe(cur, f'DROP TABLE IF EXISTS public."{table}"')


def test_postgres_changes_insert_update_delete(admin_token, db):
    asyncio.run(_test_postgres_changes_insert_update_delete(admin_token, db))


# -----------------------------------------------------------------------------
# 2. postgres_changes: eq filter
# -----------------------------------------------------------------------------


async def _test_postgres_changes_eq_filter(admin_token, db):
    table = f"rt_eqf_{uuid.uuid4().hex[:8]}"
    cur = db.cursor()
    cur.execute(f'CREATE TABLE public."{table}" (id int PRIMARY KEY, note text)')
    cur.execute(f'GRANT SELECT ON public."{table}" TO authenticated')
    cur.execute(f'ALTER PUBLICATION supabase_realtime ADD TABLE public."{table}"')
    try:
        phx = await connect(admin_token)
        try:
            topic = rt_topic(f"eqf-{uuid.uuid4().hex[:8]}")
            reply = await join(
                phx,
                topic,
                {
                    "postgres_changes": [
                        {"event": "*", "schema": "public", "table": table, "filter": "id=eq.1"}
                    ]
                },
            )
            assert reply["payload"]["status"] == "ok", reply
            binding_id = reply["payload"]["response"]["postgres_changes"][0]["id"]

            cur.execute(f'INSERT INTO public."{table}" (id, note) VALUES (1, %s)', ("match",))
            cur.execute(f'INSERT INTO public."{table}" (id, note) VALUES (2, %s)', ("no-match",))

            msg = await phx.recv_until(lambda m: m["event"] == "postgres_changes")
            assert msg["payload"]["ids"] == [binding_id]
            assert msg["payload"]["data"]["record"]["id"] == 1

            no_more = await phx.recv_none_within(
                lambda m: m["event"] == "postgres_changes", timeout=2.0
            )
            assert no_more, "unexpected second postgres_changes frame for a filtered-out row"
        finally:
            await phx.close()
    finally:
        _safe(cur, f'ALTER PUBLICATION supabase_realtime DROP TABLE public."{table}"')
        _safe(cur, f'DROP TABLE IF EXISTS public."{table}"')


def test_postgres_changes_eq_filter(admin_token, db):
    asyncio.run(_test_postgres_changes_eq_filter(admin_token, db))


# -----------------------------------------------------------------------------
# 3. RLS filtering: authenticated (privileged) sees a row anon does not
# -----------------------------------------------------------------------------


async def _test_rls_filtering(admin_token, anon_token, db):
    table = f"rt_rls_{uuid.uuid4().hex[:8]}"
    cur = db.cursor()
    cur.execute(f'CREATE TABLE public."{table}" (id int PRIMARY KEY, secret text)')
    cur.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')
    cur.execute(f'GRANT SELECT ON public."{table}" TO authenticated, anon')
    cur.execute(
        f'CREATE POLICY rt_rls_auth_only ON public."{table}" FOR SELECT TO authenticated USING (true)'
    )
    cur.execute(f'ALTER PUBLICATION supabase_realtime ADD TABLE public."{table}"')
    try:
        priv = await connect(admin_token)  # role=authenticated -> matches the policy
        lowpriv = await connect(anon_token)  # role=anon -> no matching policy
        try:
            topic = rt_topic(f"rls-{uuid.uuid4().hex[:8]}")
            cfg = {"postgres_changes": [{"event": "*", "schema": "public", "table": table}]}
            r1 = await join(priv, topic, cfg)
            r2 = await join(lowpriv, topic, cfg)
            assert r1["payload"]["status"] == "ok", r1
            assert r2["payload"]["status"] == "ok", r2

            cur.execute(f'INSERT INTO public."{table}" (id, secret) VALUES (1, %s)', ("classified",))

            msg = await priv.recv_until(lambda m: m["event"] == "postgres_changes")
            assert msg["payload"]["data"]["record"]["id"] == 1

            denied = await lowpriv.recv_none_within(
                lambda m: m["event"] == "postgres_changes", timeout=3.0
            )
            assert denied, "RLS leak: the anon socket received a row it must not see"
        finally:
            await priv.close()
            await lowpriv.close()
    finally:
        _safe(cur, f'ALTER PUBLICATION supabase_realtime DROP TABLE public."{table}"')
        _safe(cur, f'DROP TABLE IF EXISTS public."{table}"')


def test_rls_filtering(admin_token, anon_token, db):
    asyncio.run(_test_rls_filtering(admin_token, anon_token, db))


# -----------------------------------------------------------------------------
# 4. broadcast: two clients, self/ack semantics
# -----------------------------------------------------------------------------


async def _test_broadcast_two_clients_self_ack(admin_token):
    topic1 = rt_topic(f"bc1-{uuid.uuid4().hex[:8]}")
    topic2 = rt_topic(f"bc2-{uuid.uuid4().hex[:8]}")
    a = await connect(admin_token)
    b = await connect(admin_token)
    c = await connect(admin_token)
    try:
        cfg_default = {"broadcast": {"self": False, "ack": False}}
        ra = await join(a, topic1, cfg_default)
        rb = await join(b, topic1, cfg_default)
        assert ra["payload"]["status"] == "ok"
        assert rb["payload"]["status"] == "ok"

        payload = {"type": "broadcast", "event": "msg", "payload": {"hello": "world"}}
        await a.push(topic1, "broadcast", payload)

        # b (not the sender) receives the cross-delivered broadcast.
        recv_b = await b.recv_until(lambda m: m["event"] == "broadcast" and m["topic"] == topic1)
        assert recv_b["payload"]["payload"]["hello"] == "world"

        # a (the sender, self:false by default) must NOT receive its own broadcast.
        no_self = await a.recv_none_within(
            lambda m: m["event"] == "broadcast" and m["topic"] == topic1, timeout=2.0
        )
        assert no_self, "self-echo happened despite self:false (the default)"

        # A fresh channel with self:true + ack:true: the sender gets both its own
        # echoed broadcast AND a phx_reply ack for the push.
        rc = await join(c, topic2, {"broadcast": {"self": True, "ack": True}})
        assert rc["payload"]["status"] == "ok"

        ref = await c.push(topic2, "broadcast", payload)

        echo = await c.recv_until(lambda m: m["event"] == "broadcast" and m["topic"] == topic2)
        assert echo["payload"]["payload"]["hello"] == "world"

        ack = await c.recv_until(lambda m: m["event"] == "phx_reply" and m["ref"] == ref)
        assert ack["payload"]["status"] == "ok"
    finally:
        await a.close()
        await b.close()
        await c.close()


def test_broadcast_two_clients_self_ack(admin_token):
    asyncio.run(_test_broadcast_two_clients_self_ack(admin_token))


# -----------------------------------------------------------------------------
# 5. HTTP broadcast endpoint
# -----------------------------------------------------------------------------


async def _test_http_broadcast_endpoint(admin_token):
    name = f"http-bc-{uuid.uuid4().hex[:8]}"
    topic = rt_topic(name)
    phx = await connect(admin_token)
    try:
        reply = await join(phx, topic, {})
        assert reply["payload"]["status"] == "ok", reply

        status, raw = _http(
            "POST",
            f"{BASE_PATH}/realtime/v1/api/broadcast",
            headers={
                "Authorization": f"Bearer {admin_token}",
                "Content-Type": "application/json",
            },
            body=json.dumps(
                {"messages": [{"topic": name, "event": "http-evt", "payload": {"n": 1}}]}
            ).encode(),
        )
        assert status == 202, f"expected 202, got {status}: {raw[:200]!r}"

        msg = await phx.recv_until(lambda m: m["event"] == "broadcast")
        assert msg["payload"]["event"] == "http-evt"
        assert msg["payload"]["payload"]["n"] == 1
    finally:
        await phx.close()


def test_http_broadcast_endpoint(admin_token):
    asyncio.run(_test_http_broadcast_endpoint(admin_token))


# -----------------------------------------------------------------------------
# 6. broadcast from DB: realtime.send(...)
# -----------------------------------------------------------------------------


async def _test_broadcast_from_db(admin_token, db):
    name = f"room-db-{uuid.uuid4().hex[:8]}"
    topic = rt_topic(name)
    phx = await connect(admin_token)
    try:
        reply = await join(phx, topic, {})
        assert reply["payload"]["status"] == "ok", reply

        cur = db.cursor()
        cur.execute(
            "SELECT realtime.send(%s::jsonb, %s, %s, false)",
            (json.dumps({"x": 1}), "evt", name),
        )

        msg = await phx.recv_until(lambda m: m["event"] == "broadcast")
        assert msg["payload"]["event"] == "evt"
        assert msg["payload"]["payload"]["x"] == 1
    finally:
        await phx.close()


def test_broadcast_from_db(admin_token, db):
    asyncio.run(_test_broadcast_from_db(admin_token, db))


# -----------------------------------------------------------------------------
# 7. presence sync
# -----------------------------------------------------------------------------


async def _test_presence_sync(admin_token):
    topic = rt_topic(f"presence-{uuid.uuid4().hex[:8]}")
    a = await connect(admin_token)
    b = None
    try:
        ra = await join(a, topic, {"presence": {"key": "user-a"}})
        assert ra["payload"]["status"] == "ok", ra

        track_ref = await a.push(
            topic,
            "presence",
            {"type": "presence", "event": "track", "payload": {"status": "online"}},
        )
        # Wait for the ack so B's join is guaranteed to observe A already tracked
        # (avoids a join-vs-track race between the two sockets).
        track_ack = await a.recv_until(
            lambda m: m["event"] == "phx_reply" and m["ref"] == track_ref
        )
        assert track_ack["payload"]["status"] == "ok"

        b = await connect(admin_token)
        rb = await join(b, topic, {"presence": {"key": "user-b"}})
        assert rb["payload"]["status"] == "ok", rb

        state = await b.recv_until(lambda m: m["event"] == "presence_state")
        assert "user-a" in state["payload"], state["payload"]

        await a.close()
        a = None

        diff = await b.recv_until(lambda m: m["event"] == "presence_diff")
        assert "user-a" in diff["payload"]["leaves"], diff["payload"]
    finally:
        if a is not None:
            await a.close()
        if b is not None:
            await b.close()


def test_presence_sync(admin_token):
    asyncio.run(_test_presence_sync(admin_token))


# -----------------------------------------------------------------------------
# 8. private channel denied (no read policy)
# -----------------------------------------------------------------------------


async def _test_private_channel_denied(admin_token, db):
    # RLS on realtime.messages is not enabled by default (see module docstring);
    # enable it here so the absence of a matching SELECT policy actually denies,
    # matching the precedent set by core/server/realtime/authz.test.ts. This is
    # a one-way change to the target DB (idempotent to re-run, not undone).
    cur = db.cursor()
    cur.execute("ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY")

    name = f"denied-{uuid.uuid4().hex[:8]}"  # unique -> no existing policy matches it
    topic = rt_topic(name)
    phx = await connect(admin_token)
    try:
        reply = await join(phx, topic, {"private": True})
        assert reply["payload"]["status"] == "error", reply
        assert "response" in reply["payload"]
    finally:
        await phx.close()


def test_private_channel_denied(admin_token, db):
    asyncio.run(_test_private_channel_denied(admin_token, db))


# -----------------------------------------------------------------------------
# 9. replication reconnect after slot backend termination
# -----------------------------------------------------------------------------


async def _test_replication_reconnect(admin_token, db):
    table = f"rt_reconnect_{uuid.uuid4().hex[:8]}"
    cur = db.cursor()
    cur.execute(f'CREATE TABLE public."{table}" (id int PRIMARY KEY, note text)')
    cur.execute(f'GRANT SELECT ON public."{table}" TO authenticated')
    cur.execute(f'ALTER PUBLICATION supabase_realtime ADD TABLE public."{table}"')
    try:
        phx = await connect(admin_token)
        try:
            topic = rt_topic(f"reconnect-{uuid.uuid4().hex[:8]}")
            reply = await join(
                phx,
                topic,
                {"postgres_changes": [{"event": "*", "schema": "public", "table": table}]},
            )
            assert reply["payload"]["status"] == "ok", reply

            cur.execute(
                "SELECT pg_terminate_backend(active_pid) FROM pg_replication_slots "
                "WHERE slot_name = %s AND active_pid IS NOT NULL",
                (REPLICATION_SLOT,),
            )
            # Pipeline reconnect backoff starts at 1s (up to 30s exponential) —
            # give it room to notice the drop and resubscribe.
            await asyncio.sleep(5)

            cur.execute(
                f'INSERT INTO public."{table}" (id, note) VALUES (1, %s)', ("after-reconnect",)
            )

            msg = await phx.recv_until(lambda m: m["event"] == "postgres_changes", timeout=30.0)
            assert msg["payload"]["data"]["record"]["note"] == "after-reconnect"
        finally:
            await phx.close()
    finally:
        _safe(cur, f'ALTER PUBLICATION supabase_realtime DROP TABLE public."{table}"')
        _safe(cur, f'DROP TABLE IF EXISTS public."{table}"')


def test_replication_reconnect(admin_token, db):
    asyncio.run(_test_replication_reconnect(admin_token, db))


# -----------------------------------------------------------------------------
# 10. heartbeat
# -----------------------------------------------------------------------------


async def _test_heartbeat(admin_token):
    phx = await connect(admin_token)
    try:
        ref = await phx.push("phoenix", "heartbeat", {})
        reply = await phx.recv_until(
            lambda m: m["event"] == "phx_reply" and m["ref"] == ref
        )
        assert reply["payload"]["status"] == "ok", reply
    finally:
        await phx.close()


def test_heartbeat(admin_token):
    asyncio.run(_test_heartbeat(admin_token))
