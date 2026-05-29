"""Regression test: full plugin lifecycle (functions + UI + migrations + transform).

Scaffolds a single `@regr/lifecycle-test` plugin that contributes ALL four
artifact types and asserts each one is reachable end-to-end:

- function: `GET /plugins/regr/api` with admin Bearer
  returns the function JSON. (Note: function routes use the plugin's
  scope `@regr` as their URL prefix, not the shortname.)
- UI: `GET /plugins/regr/lifecycle-test/index.html` returns the static
  HTML.
- migration: a `_migrations` row in `_config.regr_lifecycle_test._migrations`
  exists for `V1__regr` (asserted via psycopg2 against the running
  postgres container).
- transform: `transformRun` mutation succeeds and the transform endpoint
  `GET /plugins/transform/lifecycle-test/x?format=json` returns
  `[{"one": 1}]`.

The test also greps the trex container logs for the loader markers
(`Found plugin lifecycle-test`, migration applied, function fn registered,
transform plugin registered) to prove the registration pipeline ran.

Note on URL design: the spec wanted `/plugins/regr/lifecycle-test/` for
the function. With both UI (static) and a function mounted under the same
scope prefix, the UI's express.static handler would auto-serve
`dist/index.html` for the bare prefix. To keep the assertions
unambiguous (UI vs function) we anchor the function source at `/api`.

Assumes the trex container `trexsql-trex-1` is up on port 8001 and the
postgres container `trexsql-postgres` is reachable on host port 65433
with credentials postgres/mypass database=testdb.
"""

from __future__ import annotations

import json
import subprocess
import time
import urllib.error
import urllib.request

import psycopg2
import pytest

CONTAINER = "trexsql-trex-1"
COMPOSE_DIR = "/home/ph/code/trexsql"
BASE_URL = "http://localhost:8001"

PLUGIN_SHORTNAME = "lifecycle-test"
PLUGIN_DIR = f"/usr/src/plugins-dev/@regr/{PLUGIN_SHORTNAME}"
PLUGIN_PATH = f"/plugins/regr/{PLUGIN_SHORTNAME}"
# Function routes mount at PLUGINS_BASE + scopePrefix + source. With
# scope `@regr` the scopePrefix is `/regr` (NOT `/regr/<short>`), so a
# function with source `/api` lives at `/plugins/regr/api`, while the
# UI sits at `/plugins/regr/<short>` (its own scope+path).
FUNCTION_PATH = "/plugins/regr/api"
TRANSFORM_PATH = f"/plugins/transform/{PLUGIN_SHORTNAME}"

ADMIN_EMAIL = "admin@trex.local"
ADMIN_PASSWORD = "password"

MIGRATION_SCHEMA = "regr_lifecycle_test"
MIGRATION_VERSION = "V1__regr"
TRANSFORM_PROJECT_NAME = "lifecycle_test"

PG_DSN = (
    "host=localhost port=65433 user=postgres password=mypass dbname=testdb"
)


PACKAGE_JSON = json.dumps(
    {
        "name": f"@regr/{PLUGIN_SHORTNAME}",
        "version": "0.0.1",
        "trex": {
            "functions": {
                "api": [
                    {"source": "/api", "function": "/functions"}
                ]
            },
            "ui": {
                "routes": [
                    {"path": f"/{PLUGIN_SHORTNAME}", "dir": "dist"}
                ]
            },
            "migrations": {
                "schema": MIGRATION_SCHEMA,
                "database": "_config",
            },
            "transform": {},
        },
    },
    indent=2,
)

DENO_JSON = json.dumps({"nodeModulesDir": "manual"}, indent=2)

FUNCTIONS_INDEX_TS = (
    'Deno.serve(() => Response.json({hit: "fn"}));\n'
)

INDEX_HTML = (
    "<!doctype html><html><body>lifecycle-test:ui</body></html>\n"
)

MIGRATION_SQL = (
    f"CREATE TABLE IF NOT EXISTS {MIGRATION_SCHEMA}.note "
    f"(id INT PRIMARY KEY, body TEXT NOT NULL);\n"
)

PROJECT_YML = (
    f"name: {TRANSFORM_PROJECT_NAME}\n"
    "models_path: models\n"
)

X_SQL = "SELECT 1 AS one\n"

X_YML = (
    "materialized: view\n"
    "endpoint:\n"
    "  path: /x\n"
    "  formats:\n"
    "    - json\n"
)


def _docker(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["docker", *args], check=check, capture_output=True, text=True
    )


def _docker_exec(*args: str, user: str = "root") -> subprocess.CompletedProcess:
    return _docker("exec", "-u", user, CONTAINER, *args)


def _write_in_container(path: str, contents: str) -> None:
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


def _wait_for_ready(timeout: float = 180.0) -> None:
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


def _http(
    method: str,
    path: str,
    *,
    headers: dict | None = None,
    body: bytes | None = None,
    timeout: float = 30.0,
):
    req = urllib.request.Request(
        BASE_URL + path, method=method, data=body, headers=headers or {}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def _drop_migration_schema() -> None:
    """Drop the plugin's migration schema so the next install reapplies V1."""
    try:
        with psycopg2.connect(PG_DSN) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute(
                    f'DROP SCHEMA IF EXISTS "{MIGRATION_SCHEMA}" CASCADE'
                )
    except Exception as e:
        # Don't let cleanup errors mask the actual test result.
        print(f"warning: failed to drop {MIGRATION_SCHEMA}: {e}")


@pytest.fixture(scope="module")
def lifecycle_plugin():
    """Scaffold @regr/lifecycle-test, restart trex, yield, clean up + restart."""
    # Ensure a clean schema before install so the V1 migration definitely runs.
    _drop_migration_schema()

    _docker_exec("rm", "-rf", PLUGIN_DIR)
    _docker_exec(
        "mkdir", "-p",
        f"{PLUGIN_DIR}/functions",
        f"{PLUGIN_DIR}/dist",
        f"{PLUGIN_DIR}/migrations",
        f"{PLUGIN_DIR}/project/models",
    )

    _write_in_container(f"{PLUGIN_DIR}/package.json", PACKAGE_JSON)
    _write_in_container(f"{PLUGIN_DIR}/deno.json", DENO_JSON)
    _write_in_container(f"{PLUGIN_DIR}/functions/index.ts", FUNCTIONS_INDEX_TS)
    _write_in_container(f"{PLUGIN_DIR}/dist/index.html", INDEX_HTML)
    _write_in_container(
        f"{PLUGIN_DIR}/migrations/{MIGRATION_VERSION}.sql", MIGRATION_SQL
    )
    _write_in_container(f"{PLUGIN_DIR}/project/project.yml", PROJECT_YML)
    _write_in_container(f"{PLUGIN_DIR}/project/models/x.sql", X_SQL)
    _write_in_container(f"{PLUGIN_DIR}/project/models/x.yml", X_YML)

    _docker_exec("chown", "-R", "node:node", PLUGIN_DIR)

    subprocess.run(
        ["docker", "compose", "restart", "trex"],
        cwd=COMPOSE_DIR,
        check=True,
        capture_output=True,
        text=True,
    )
    _wait_for_ready()

    yield

    _drop_migration_schema()
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
def admin_token(lifecycle_plugin):
    body = json.dumps(
        {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
    ).encode()
    status, _h, raw = _http(
        "POST",
        "/trex/auth/v1/token?grant_type=password",
        headers={"Content-Type": "application/json"},
        body=body,
        timeout=10.0,
    )
    assert status == 200, f"login failed: {status} {raw[:200]!r}"
    return json.loads(raw)["access_token"]


def _container_logs() -> str:
    res = subprocess.run(
        ["docker", "logs", CONTAINER],
        check=False,
        capture_output=True,
        text=True,
    )
    return (res.stdout or "") + (res.stderr or "")


def test_loader_logs_announce_plugin(lifecycle_plugin):
    """The loader emits `Found plugin lifecycle-test` and `Registered plugin
    lifecycle-test [dev]` once during startup."""
    logs = _container_logs()
    assert f"Found plugin {PLUGIN_SHORTNAME}" in logs, (
        "expected loader to discover lifecycle-test plugin; "
        "loader markers missing in trex logs"
    )
    assert f"Registered plugin {PLUGIN_SHORTNAME} [dev]" in logs, (
        "expected loader to register lifecycle-test plugin"
    )


def test_loader_logs_function_registration(lifecycle_plugin):
    """The function plugin handler logs `add fn /api @ <dir>/functions`."""
    logs = _container_logs()
    needle = f"add fn /api @ {PLUGIN_DIR}/functions"
    assert needle in logs, (
        f"expected function-fn registration log line; needle={needle!r} "
        f"missing in trex logs"
    )


def test_loader_logs_transform_registration(lifecycle_plugin):
    """The transform handler logs `Registered transform plugin lifecycle-test`."""
    logs = _container_logs()
    needle = f"Registered transform plugin {PLUGIN_SHORTNAME}"
    assert needle in logs, (
        f"expected transform registration log line; needle={needle!r} "
        f"missing in trex logs"
    )


def test_loader_logs_migration_applied(lifecycle_plugin):
    """The migration runner logs that V1__regr was applied."""
    logs = _container_logs()
    needle = f"Plugin {PLUGIN_SHORTNAME}: applied migration {MIGRATION_VERSION}"
    assert needle in logs, (
        f"expected migration applied log line; needle={needle!r} "
        f"missing in trex logs"
    )


def test_migration_history_row_exists(lifecycle_plugin):
    """The plugin's _migrations table records V1__regr."""
    with psycopg2.connect(PG_DSN) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f'SELECT version FROM "{MIGRATION_SCHEMA}"._migrations '
                "WHERE version = %s",
                (MIGRATION_VERSION,),
            )
            row = cur.fetchone()
    assert row is not None, (
        f"expected a row in {MIGRATION_SCHEMA}._migrations for "
        f"version={MIGRATION_VERSION!r}"
    )
    assert row[0] == MIGRATION_VERSION


def test_ui_serves_static_html(lifecycle_plugin):
    """`GET /plugins/regr/lifecycle-test/index.html` returns the scaffolded HTML."""
    status, _h, raw = _http("GET", f"{PLUGIN_PATH}/index.html")
    assert status == 200, f"expected 200, got {status} {raw[:200]!r}"
    assert b"lifecycle-test:ui" in raw, f"unexpected UI body: {raw[:200]!r}"


def test_function_route_returns_json(admin_token):
    """`GET /plugins/regr/api` (admin Bearer) → function JSON.

    Function routes use the *scope* (here `@regr`) as their URL prefix,
    not the per-plugin shortname. With `source: /api` the resulting
    route is `/plugins/regr/api` — see FUNCTION_PATH note above.
    """
    status, _h, raw = _http(
        "GET",
        FUNCTION_PATH,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=60.0,
    )
    assert status == 200, (
        f"expected 200 from function, got {status} {raw[:300]!r}"
    )
    payload = json.loads(raw)
    assert payload == {"hit": "fn"}, f"unexpected fn body: {payload!r}"


def test_transform_run_and_query(admin_token):
    """transformRun mutation succeeds and the JSON endpoint returns [{one:1}]."""
    query = (
        "mutation {"
        f' transformRun(pluginName: "{PLUGIN_SHORTNAME}",'
        f' destDb: "memory", destSchema: "{TRANSFORM_PROJECT_NAME}",'
        f' sourceDb: "memory", sourceSchema: "public")'
        " { name action durationMs message }"
        " }"
    )
    body = json.dumps({"query": query}).encode()
    status, _h, raw = _http(
        "POST",
        "/trex/graphql",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {admin_token}",
        },
        body=body,
        timeout=60.0,
    )
    assert status == 200, f"transformRun failed: {status} {raw[:300]!r}"
    payload = json.loads(raw)
    assert "errors" not in payload, f"transformRun errors: {payload}"
    runs = payload["data"]["transformRun"]
    assert any(r["name"] == "x" for r in runs), (
        f"expected model 'x' in run results: {runs}"
    )

    # Now query the transform endpoint.
    status, _h, raw = _http(
        "GET",
        f"{TRANSFORM_PATH}/x?format=json",
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30.0,
    )
    assert status == 200, (
        f"expected 200 from transform endpoint, got {status} {raw[:300]!r}"
    )
    rows = json.loads(raw)
    assert rows == [{"one": 1}], f"unexpected transform rows: {rows!r}"
