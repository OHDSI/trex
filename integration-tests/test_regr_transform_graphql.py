"""Regression test for the GraphQL ``transformPlan`` / ``transformRun`` /
``transformTest`` resolvers in ``core/server/graphql/plugin-operations.ts``.

The bug
-------
The three resolvers used to build the SQL function's ``source_schema``
argument by concatenating the GraphQL ``sourceDb`` and ``sourceSchema``
inputs:

    const sourceSchema = `${args.sourceDb}.${args.sourceSchema}`;
    SELECT * FROM trex_transform_run(..., source_schema := 'memory.public')

That string was then used by the transform parser to qualify
unqualified table references in the model SQL — producing
``"memory.public"."regr_src"``, which DuckDB interprets as schema name
``memory.public`` (a single identifier with a dot in it) and a table
``regr_src``. The catalog never holds such a schema, so the run failed
with::

    Catalog Error: Schema with name "memory.public" does not exist!

The fix
-------
``plugin-operations.ts`` now passes only ``sourceSchema``:

    const sourceSchema = `${args.sourceSchema}`;

so the parser sees ``"public"."regr_src"`` and the lookup succeeds. The
``destSchema`` argument keeps the ``${destDb}.${destSchema}`` shape
because the SQL function expects a fully qualified ``db.schema`` for
the destination.

This regression test guards the fix end-to-end against the running
``trexsql-trex-1`` container by:

1. Scaffolding a small ``@regr/gql-test`` plugin (one model
   ``regr_dest_model`` whose SQL references a bare source table
   ``regr_src``) under ``/usr/src/plugins-dev/@regr/gql-test``. The
   model declaration is recorded in ``project.yml`` /
   ``models/regr_dest_model.sql`` / ``models/regr_dest_model.yml``.
2. Restarting the trex container ONCE so the loader registers the
   plugin (this is restart 1 of the 2 the test performs).
3. Pre-populating ``memory.public.regr_src`` so the model has data.
4. Authenticating as the seeded admin and issuing both
   ``transformPlan`` and ``transformRun`` GraphQL mutations with
   ``sourceDb: "memory"`` and ``sourceSchema: "public"`` — pre-fix
   these would have failed with ``Catalog Error: Schema with name
   "memory.public" does not exist!``.
5. Verifying the model materialised in
   ``memory.regr_dest.regr_dest_model`` by querying the trex pgwire
   port.
6. Cleaning up: dropping the dest schema, dropping the source table,
   removing the plugin dir, and restarting trex (restart 2). This
   keeps the agent within the 3-restart budget the spec sets.

There is no ``transformTest`` mutation issued: the plugin doesn't
declare any test SQL files, and the spec explicitly says to skip the
test mutation in that case.
"""

from __future__ import annotations

import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid

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


CONTAINER = "trexsql-trex-1"
COMPOSE_DIR = "/home/ph/code/trexsql"
BASE_URL = "http://localhost:8001"

PGWIRE_HOST = "localhost"
PGWIRE_PORT = 5433
PGWIRE_USER = "trex"
PGWIRE_PASSWORD = "trex"
PGWIRE_DB = "main"

ADMIN_EMAIL = "admin@trex.local"
ADMIN_PASSWORD = "password"

# Unique-per-run suffix so concurrent agents don't collide.
RUN_TAG = uuid.uuid4().hex[:8]
PLUGIN_SHORTNAME = "gql-test"
PLUGIN_DIR = f"/usr/src/plugins-dev/@regr/{PLUGIN_SHORTNAME}"
TRANSFORM_PROJECT_NAME = "regr_gql_test"

# The model uses an unqualified reference to this source table — the
# transform parser must rewrite it to "public"."regr_src_<tag>".
SOURCE_TABLE = f"regr_src_{RUN_TAG}"
MODEL_NAME = "regr_dest_model"
DEST_SCHEMA = "regr_dest"

PACKAGE_JSON = json.dumps(
    {
        "name": f"@regr/{PLUGIN_SHORTNAME}",
        "version": "0.0.1",
        "trex": {
            "transform": {},
        },
    },
    indent=2,
)

PROJECT_YML = (
    f"name: {TRANSFORM_PROJECT_NAME}\n"
    "models_path: models\n"
    "source_tables:\n"
    f"  - {SOURCE_TABLE}\n"
)

# Bare reference to the source table — exactly the case the parser's
# dual-rewrite logic exists to handle, and exactly the case that broke
# when sourceSchema was "memory.public".
MODEL_SQL = f"SELECT id, label FROM {SOURCE_TABLE}\n"

MODEL_YML = (
    "materialized: table\n"
    "endpoint:\n"
    f"  path: /{MODEL_NAME}\n"
    "  formats:\n"
    "    - json\n"
)


def _docker(*args, check=True):
    return subprocess.run(
        ["docker", *args], check=check, capture_output=True, text=True
    )


def _docker_exec(*args, user="root"):
    return _docker("exec", "-u", user, CONTAINER, *args)


def _write_in_container(path: str, contents: str):
    proc = subprocess.run(
        [
            "docker", "exec", "-i", "-u", "root", CONTAINER,
            "sh", "-c", f"cat > {path}",
        ],
        input=contents,
        text=True,
        capture_output=True,
        check=True,
    )
    assert proc.returncode == 0, proc.stderr


def _http(method, path, *, headers=None, body=None, timeout=60.0):
    req = urllib.request.Request(
        BASE_URL + path, method=method, data=body, headers=headers or {}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def _wait_for_ready(timeout: float = 180.0):
    deadline = time.time() + timeout
    last_err = None
    while time.time() < deadline:
        try:
            req = urllib.request.Request(
                BASE_URL + "/trex/api/settings/public", method="GET"
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                if resp.status == 200:
                    return
        except urllib.error.HTTPError as e:
            if e.code == 200:
                return
            last_err = e
        except Exception as e:
            last_err = e
        time.sleep(2)
    raise RuntimeError(
        f"trex did not become ready in {timeout}s; last={last_err!r}"
    )


def _connect_pgwire():
    if PSYCOPG_VERSION == 3:
        return psycopg.connect(
            host=PGWIRE_HOST, port=PGWIRE_PORT, user=PGWIRE_USER,
            password=PGWIRE_PASSWORD, dbname=PGWIRE_DB, autocommit=True,
        )
    conn = psycopg.connect(
        host=PGWIRE_HOST, port=PGWIRE_PORT, user=PGWIRE_USER,
        password=PGWIRE_PASSWORD, dbname=PGWIRE_DB,
    )
    conn.autocommit = True
    return conn


def _trex_pgwire_available():
    try:
        c = _connect_pgwire()
        c.close()
        return True
    except Exception:
        return False


@pytest.fixture(scope="module")
def gql_plugin():
    """Scaffold @regr/gql-test, restart trex (1 of 2), yield, then
    cleanup + restart (2 of 2). Restart budget per spec: <= 3 total."""
    if psycopg is None:
        pytest.skip("psycopg/psycopg2 not installed")
    if not _trex_pgwire_available():
        pytest.skip(
            f"trex pgwire ({PGWIRE_HOST}:{PGWIRE_PORT}) not reachable"
        )

    _docker_exec("rm", "-rf", PLUGIN_DIR)
    _docker_exec(
        "mkdir", "-p", f"{PLUGIN_DIR}/project/models",
    )
    _write_in_container(f"{PLUGIN_DIR}/package.json", PACKAGE_JSON)
    _write_in_container(f"{PLUGIN_DIR}/project/project.yml", PROJECT_YML)
    _write_in_container(
        f"{PLUGIN_DIR}/project/models/{MODEL_NAME}.sql", MODEL_SQL
    )
    _write_in_container(
        f"{PLUGIN_DIR}/project/models/{MODEL_NAME}.yml", MODEL_YML
    )
    _docker_exec("chown", "-R", "node:node", PLUGIN_DIR)

    subprocess.run(
        ["docker", "compose", "restart", "trex"],
        cwd=COMPOSE_DIR,
        check=True,
        capture_output=True,
        text=True,
    )
    _wait_for_ready()

    # Re-create the source table after restart (memory db gets cleared).
    # ``memory.public`` doesn't exist by default — pgwire's CREATE TABLE
    # rejects bare ``public.<tbl>`` without first attaching the schema.
    deadline = time.time() + 60
    last_err: Exception | None = None
    seeded = False
    while time.time() < deadline:
        try:
            with _connect_pgwire() as conn:
                cur = conn.cursor()
                cur.execute("CREATE SCHEMA IF NOT EXISTS memory.public")
                cur.execute(
                    f'DROP TABLE IF EXISTS memory.public."{SOURCE_TABLE}"'
                )
                cur.execute(
                    f'CREATE TABLE memory.public."{SOURCE_TABLE}" '
                    "(id INT, label VARCHAR)"
                )
                cur.execute(
                    f'INSERT INTO memory.public."{SOURCE_TABLE}" VALUES '
                    "(1, 'one'), (2, 'two'), (3, 'three')"
                )
                cur.close()
            seeded = True
            break
        except Exception as e:
            last_err = e
            time.sleep(2)
    if not seeded:
        pytest.fail(
            f"could not seed source table after restart: {last_err!r}"
        )

    yield

    # Teardown: drop dest schema + source table, remove plugin, restart.
    try:
        with _connect_pgwire() as conn:
            cur = conn.cursor()
            cur.execute(
                f'DROP SCHEMA IF EXISTS memory."{DEST_SCHEMA}" CASCADE'
            )
            cur.execute(
                f'DROP TABLE IF EXISTS memory.public."{SOURCE_TABLE}"'
            )
            cur.close()
    except Exception as e:
        print(f"warning: pgwire cleanup failed: {e}")

    _docker_exec("rm", "-rf", PLUGIN_DIR)
    _docker_exec(
        "sh", "-c",
        "rmdir /usr/src/plugins-dev/@regr 2>/dev/null || true",
    )
    subprocess.run(
        ["docker", "compose", "restart", "trex"],
        cwd=COMPOSE_DIR,
        check=False,
        capture_output=True,
        text=True,
    )
    _wait_for_ready()


@pytest.fixture(scope="module")
def admin_token(gql_plugin):
    body = json.dumps(
        {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    ).encode()
    status, _h, raw = _http(
        "POST",
        "/trex/auth/v1/token?grant_type=password",
        headers={"Content-Type": "application/json"},
        body=body,
        timeout=15.0,
    )
    assert status == 200, f"login failed: {status} {raw[:200]!r}"
    return json.loads(raw)["access_token"]


def _gql(token: str, query: str):
    body = json.dumps({"query": query}).encode()
    status, _h, raw = _http(
        "POST",
        "/trex/graphql",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        body=body,
        timeout=60.0,
    )
    assert status == 200, f"graphql HTTP {status}: {raw[:300]!r}"
    payload = json.loads(raw)
    return payload


def _assert_no_catalog_error(payload, op: str):
    """Raise a clear assertion if the response surfaces the original
    'memory.public' catalog error or any unrelated error."""
    if "errors" in payload and payload["errors"]:
        msgs = [e.get("message", "") for e in payload["errors"]]
        joined = " | ".join(msgs)
        # The original bug surfaced as the literal string below.
        assert "memory.public" not in joined, (
            f"{op} surfaced the pre-fix 'memory.public' catalog error: "
            f"{joined!r} — the resolver is concatenating sourceDb and "
            f"sourceSchema again"
        )
        assert "Schema with name" not in joined, (
            f"{op} surfaced a 'Schema with name ... does not exist' "
            f"error — likely the resolver is mis-qualifying the source "
            f"schema: {joined!r}"
        )
        pytest.fail(f"{op} returned errors: {joined!r}")


def test_transform_plan_accepts_split_source_db_and_schema(admin_token):
    """``transformPlan`` (a Query) with sourceDb='memory',
    sourceSchema='public' succeeds — pre-fix this would have raised a
    Catalog Error because the resolver concatenated them into
    'memory.public'."""
    query = (
        "query {"
        f' transformPlan(pluginName: "{PLUGIN_SHORTNAME}",'
        f' destDb: "memory", destSchema: "{DEST_SCHEMA}",'
        f' sourceDb: "memory", sourceSchema: "public")'
        " { name action }"
        " }"
    )
    payload = _gql(admin_token, query)
    _assert_no_catalog_error(payload, "transformPlan")
    plans = payload["data"]["transformPlan"]
    assert isinstance(plans, list) and len(plans) >= 1, (
        f"expected at least 1 plan entry, got {plans!r}"
    )
    assert any(p["name"] == MODEL_NAME for p in plans), (
        f"expected plan entry for model {MODEL_NAME!r} in {plans!r}"
    )


def test_transform_run_materialises_model(admin_token):
    """``transformRun`` succeeds and the model lands in
    ``memory.regr_dest.regr_dest_model`` with the source's rows.

    Pre-fix the run failed with::

        Catalog Error: Schema with name "memory.public" does not exist!
    """
    query = (
        "mutation {"
        f' transformRun(pluginName: "{PLUGIN_SHORTNAME}",'
        f' destDb: "memory", destSchema: "{DEST_SCHEMA}",'
        f' sourceDb: "memory", sourceSchema: "public")'
        " { name action durationMs message }"
        " }"
    )
    payload = _gql(admin_token, query)
    _assert_no_catalog_error(payload, "transformRun")
    runs = payload["data"]["transformRun"]
    assert isinstance(runs, list) and len(runs) >= 1, (
        f"expected >=1 run result, got {runs!r}"
    )
    matched = [r for r in runs if r["name"] == MODEL_NAME]
    assert matched, (
        f"expected run result for {MODEL_NAME!r}, got {runs!r}"
    )
    # message should not contain the catalog error string either
    msg = matched[0].get("message", "") or ""
    assert "memory.public" not in msg, (
        f"transformRun result for {MODEL_NAME!r} carries the pre-fix "
        f"catalog error string: message={msg!r}"
    )

    # Verify materialisation by reading the dest table via the transform
    # plugin's JSON endpoint. The table lives in the trex pool's memory
    # catalog, which the pgwire bridge does not expose directly to ad-hoc
    # SELECTs against arbitrary attached schemas — but the plugin's own
    # endpoint resolves the same DB/schema pair the run wrote to.
    status, _h, raw = _http(
        "GET",
        f"/plugins/transform/{PLUGIN_SHORTNAME}/{MODEL_NAME}?format=json",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30.0,
    )
    assert status == 200, (
        f"transform endpoint returned {status}: {raw[:300]!r}"
    )
    payload_rows = json.loads(raw)
    # Compare ignoring row order — transform_run doesn't guarantee one.
    expected = [{"id": 1, "label": "one"},
                {"id": 2, "label": "two"},
                {"id": 3, "label": "three"}]
    got_sorted = sorted(payload_rows, key=lambda r: r["id"])
    assert got_sorted == expected, (
        f"materialised model rows mismatch via endpoint: got "
        f"{payload_rows!r}, expected (any order) {expected!r}"
    )


def test_transform_run_idempotent_second_call(admin_token):
    """A second ``transformRun`` after the first must still succeed —
    there's nothing in the bug-vs-fix story that depends on freshness,
    but a second call exercises the plan/replace-existing path through
    the same resolver and gives us belt-and-braces coverage of the
    sourceSchema fix."""
    query = (
        "mutation {"
        f' transformRun(pluginName: "{PLUGIN_SHORTNAME}",'
        f' destDb: "memory", destSchema: "{DEST_SCHEMA}",'
        f' sourceDb: "memory", sourceSchema: "public")'
        " { name action }"
        " }"
    )
    payload = _gql(admin_token, query)
    _assert_no_catalog_error(payload, "transformRun (second call)")
    runs = payload["data"]["transformRun"]
    assert any(r["name"] == MODEL_NAME for r in runs), (
        f"expected {MODEL_NAME!r} in second-run results: {runs!r}"
    )
