"""Regression test for transform plugin ?format=arrow endpoint.

Covers:
- transform plugin HTTP endpoint accepts ?format=arrow
- Returns Content-Type: application/vnd.apache.arrow.stream
- Returns a non-empty Apache Arrow IPC stream
- pyarrow.ipc can parse the stream and the schema/rows match the model

Assumes the trex container (trexsql-trex-1) is running on
http://localhost:8001 with the seeded admin user and that the
@regr/arrow-transform plugin is mounted in /usr/src/plugins-dev.
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import pytest
import logging

logger = logging.getLogger(__name__)

BASE_URL = "http://localhost:8001"
ADMIN_EMAIL = "admin@trex.local"
ADMIN_PASSWORD = "password"

PLUGIN_NAME = "arrow-transform"
DEST_DB = "memory"
DEST_SCHEMA = "arrow_test"
SOURCE_DB = "memory"
SOURCE_SCHEMA = "public"
MODEL_NAME = "tiny"
ENDPOINT_PATH = (
    f"/plugins/transform/{PLUGIN_NAME}/{MODEL_NAME}"
)


def _http(method, path, *, headers=None, body=None, timeout=30.0):
    req = urllib.request.Request(
        BASE_URL + path,
        method=method,
        data=body,
        headers=headers or {},
    )
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


@pytest.fixture(scope="module")
def admin_token():
    body = json.dumps({"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}).encode()
    status, _h, raw = _http(
        "POST",
        "/trex/auth/v1/token?grant_type=password",
        headers={"Content-Type": "application/json"},
        body=body,
    )
    assert status == 200, f"login failed: {status} {raw[:200]!r}"
    return json.loads(raw)["access_token"]


CONTAINER = os.environ.get("TREX_CONTAINER", "trexsql-trex-1")
DEVX_WS_PATH = "/tmp/devx-workspaces/arrow-transform"


def _docker(*args, check=True):
    return subprocess.run(
        ["docker", *args],
        check=check,
        capture_output=True,
        text=True,
    )


def _scaffold_plugin_in_container():
    """Build the @regr/arrow-transform plugin under /tmp/devx-workspaces in the
    trex container so it's registrable via the dynamic plugin endpoint.

    The dev plugin tree under /usr/src/plugins-dev is rebuilt from the image
    on container restart, so we instead place the plugin under the allowed
    devx workspace dir (/tmp/devx-workspaces) and register it dynamically.
    """
    src = os.path.join(os.path.dirname(__file__), "_arrow_transform_scaffold")
    if not os.path.isdir(src):
        os.makedirs(os.path.join(src, "project", "models"), exist_ok=True)
        with open(os.path.join(src, "package.json"), "w") as f:
            f.write(
                '{"name":"@regr/arrow-transform","version":"0.0.1",'
                '"trex":{"transform":{}}}\n'
            )
        with open(os.path.join(src, "project", "project.yml"), "w") as f:
            f.write(
                "name: regr_arrow_transform\n"
                "models_path: models\n"
            )
        with open(os.path.join(src, "project", "models", "tiny.sql"), "w") as f:
            f.write(
                "SELECT 1 AS a, 'b' AS b "
                "UNION ALL SELECT 2 AS a, 'c' AS b "
                "UNION ALL SELECT 3 AS a, 'd' AS b\n"
            )
        with open(os.path.join(src, "project", "models", "tiny.yml"), "w") as f:
            f.write(
                "materialized: table\n"
                "endpoint:\n"
                "  path: /tiny\n"
                "  roles:\n"
                "    - admin\n"
                "    - user\n"
                "  formats:\n"
                "    - json\n"
                "    - csv\n"
                "    - arrow\n"
            )
    # Wipe any stale copy in the container, then copy the scaffold.
    _docker("exec", "-u", "root", CONTAINER, "rm", "-rf", DEVX_WS_PATH, check=False)
    _docker(
        "exec", "-u", "root", CONTAINER,
        "mkdir", "-p", "/tmp/devx-workspaces",
    )
    _docker("cp", src, f"{CONTAINER}:{DEVX_WS_PATH}")
    _docker(
        "exec", "-u", "root", CONTAINER,
        "chown", "-R", "node:node", DEVX_WS_PATH,
    )


@pytest.fixture(scope="module")
def plugin_registered(admin_token):
    """Ensure the @regr/arrow-transform plugin is registered in the running
    trex server. Idempotent: if it's already registered, skip the dynamic
    registration call."""
    # Check current registration via GraphQL.
    body = json.dumps({"query": "{ transformProjects { pluginName } }"}).encode()
    _, _h, raw = _http(
        "POST", "/trex/graphql",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {admin_token}",
        },
        body=body,
    )
    plugins = []
    try:
        plugins = [
            p["pluginName"]
            for p in json.loads(raw).get("data", {}).get("transformProjects", [])
            or []
        ]
    except Exception as e:
        logger.debug("ignoring %s: %s", type(e).__name__, e)
    if PLUGIN_NAME in plugins:
        return PLUGIN_NAME

    # Need to scaffold + register dynamically.
    _scaffold_plugin_in_container()
    body = json.dumps({"path": DEVX_WS_PATH}).encode()
    status, _h, raw = _http(
        "POST", "/trex/api/plugins/register",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {admin_token}",
        },
        body=body,
    )
    assert status == 200, f"register failed: {status} {raw[:200]!r}"
    return PLUGIN_NAME


@pytest.fixture(scope="module")
def materialized(admin_token, plugin_registered):
    """Materialize the arrow-transform model so the endpoint has data."""
    query = (
        "mutation {"
        f' transformRun(pluginName: "{PLUGIN_NAME}",'
        f' destDb: "{DEST_DB}", destSchema: "{DEST_SCHEMA}",'
        f' sourceDb: "{SOURCE_DB}", sourceSchema: "{SOURCE_SCHEMA}")'
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
    )
    assert status == 200, f"transformRun failed: {status} {raw[:300]!r}"
    payload = json.loads(raw)
    assert "errors" not in payload, f"transformRun errors: {payload}"
    runs = payload["data"]["transformRun"]
    assert any(r["name"] == MODEL_NAME for r in runs), (
        f"expected model {MODEL_NAME!r} in run results: {runs}"
    )
    return runs


def test_arrow_endpoint_returns_ipc_stream(admin_token, materialized):
    """?format=arrow returns 200 + non-empty Arrow IPC stream body."""
    status, headers, body = _http(
        "GET",
        ENDPOINT_PATH + "?format=arrow",
        headers={
            "Authorization": f"Bearer {admin_token}",
            "Accept": "application/vnd.apache.arrow.stream",
        },
    )
    assert status == 200, (
        f"arrow endpoint failed: status={status} body={body[:300]!r}"
    )
    ctype = headers.get("content-type") or headers.get("Content-Type") or ""
    assert "application/vnd.apache.arrow.stream" in ctype, (
        f"unexpected content-type: {ctype!r}"
    )
    assert len(body) > 0, "expected non-empty Arrow IPC stream body"
    # IPC stream messages start with the 0xFFFFFFFF continuation marker.
    assert body[:4] == b"\xff\xff\xff\xff", (
        f"expected Arrow IPC continuation marker, got {body[:8]!r}"
    )


def test_arrow_endpoint_parses_with_pyarrow(admin_token, materialized):
    """The returned IPC stream is parseable and has the model's rows + schema."""
    pa = pytest.importorskip("pyarrow")
    pa_ipc = pytest.importorskip("pyarrow.ipc")

    status, _h, body = _http(
        "GET",
        ENDPOINT_PATH + "?format=arrow",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert status == 200, f"arrow endpoint failed: {status}"

    reader = pa_ipc.open_stream(pa.py_buffer(body))
    table = reader.read_all()
    assert table.num_rows > 0, "expected at least one row in Arrow table"
    cols = set(table.schema.names)
    assert {"a", "b"}.issubset(cols), (
        f"expected columns 'a' and 'b' in schema, got {cols}"
    )
    # tiny.sql produces 3 rows of (a:int, b:str)
    data = table.to_pydict()
    assert sorted(data["a"]) == [1, 2, 3] or sorted(data["a"]) == [1.0, 2.0, 3.0]
    assert sorted(data["b"]) == ["b", "c", "d"]


def test_arrow_endpoint_rejects_unknown_format(admin_token, materialized):
    """Sanity: an unknown format still returns 400 with a clear error."""
    status, _h, body = _http(
        "GET",
        ENDPOINT_PATH + "?format=parquet",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert status == 400, f"expected 400, got {status}: {body[:200]!r}"
    msg = json.loads(body)
    assert "Unsupported format" in msg.get("error", ""), msg
