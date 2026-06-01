"""Regression test: PostGraphile enforces trexdb RLS via the Supabase
authenticator + SET ROLE model.

Before the RLS-auth change, PostGraphile connected as the database owner and
RLS was bypassed, so any authenticated user could read every `user` row. After
the change, a normal user must see only their own row, an admin sees all, and
an unauthenticated request is denied.

Runs against a running stack (same harness as test_regr_transform_graphql.py).
The base URL defaults to http://localhost:8001 and can be overridden with the
TREX_BASE_URL environment variable.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid

import pytest

BASE_URL = os.environ.get("TREX_BASE_URL", "http://localhost:8001")
ADMIN_EMAIL = "admin@trex.local"
ADMIN_PASSWORD = "password"


def _http(method, path, *, headers=None, body=None, timeout=60.0):
    req = urllib.request.Request(
        BASE_URL + path, method=method, data=body, headers=headers or {}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _password_token(email, password):
    status, raw = _http(
        "POST",
        "/trex/auth/v1/token?grant_type=password",
        headers={"Content-Type": "application/json"},
        body=json.dumps({"email": email, "password": password}).encode(),
    )
    assert status == 200, f"login HTTP {status}: {raw[:300]!r}"
    return json.loads(raw)["access_token"]


def _signup_token(email, password):
    status, raw = _http(
        "POST",
        "/trex/auth/v1/signup",
        headers={"Content-Type": "application/json"},
        body=json.dumps({"email": email, "password": password}).encode(),
    )
    assert status in (200, 201), f"signup HTTP {status}: {raw[:300]!r}"
    data = json.loads(raw)
    # Supabase-style signup returns the session token directly when email
    # confirmation is disabled (requireEmailVerification: false in auth.ts).
    token = data.get("access_token")
    if token:
        return token
    return _password_token(email, password)


def _gql(query, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    status, raw = _http(
        "POST",
        "/trex/graphql",
        headers=headers,
        body=json.dumps({"query": query}).encode(),
    )
    assert status == 200, f"graphql HTTP {status}: {raw[:300]!r}"
    return json.loads(raw)


ALL_USERS = "{ allUsers { nodes { id email } } }"


@pytest.fixture(scope="module")
def admin_token():
    return _password_token(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def normal_user():
    email = f"rls-{uuid.uuid4().hex[:8]}@trex.local"
    password = "password123"
    token = _signup_token(email, password)
    return {"email": email, "token": token}


def _emails(payload):
    nodes = (payload.get("data") or {}).get("allUsers", {}).get("nodes")
    assert nodes is not None, f"unexpected payload: {payload}"
    return {n["email"] for n in nodes}


def test_admin_sees_all_users(admin_token, normal_user):
    emails = _emails(_gql(ALL_USERS, admin_token))
    assert ADMIN_EMAIL in emails
    assert normal_user["email"] in emails


def test_normal_user_sees_only_own_row(normal_user):
    emails = _emails(_gql(ALL_USERS, normal_user["token"]))
    assert emails == {normal_user["email"]}, (
        f"RLS leak: normal user saw {emails}"
    )


def test_unauthenticated_sees_no_users():
    payload = _gql(ALL_USERS)  # no token -> anon role
    nodes = (payload.get("data") or {}).get("allUsers", {}).get("nodes")
    # anon has no trexdb table grants: either an authorization error, or an
    # empty/None result set. Anything that is NOT a populated list is a pass.
    assert not nodes, f"anon leaked users: {payload}"


def test_normal_user_cannot_leak_users_via_search_function(normal_user, admin_token):
    # search_users is SECURITY DEFINER and would bypass RLS if EXECUTE weren't
    # revoked from authenticated. A normal user calling it must NOT see the
    # admin's row (either a permission error -> data null, or no foreign rows).
    query = '{ searchUsers(query: "") { nodes { email } } }'
    payload = _gql(query, normal_user["token"])
    nodes = (payload.get("data") or {}).get("searchUsers", {})
    nodes = nodes.get("nodes") if nodes else None
    if nodes:
        emails = {n["email"] for n in nodes}
        assert ADMIN_EMAIL not in emails, f"searchUsers leaked admin row: {emails}"
        assert emails <= {normal_user["email"]}, f"searchUsers leaked rows: {emails}"
    # nodes being None/empty (permission denied or no rows) is also a pass.


def test_normal_user_cannot_self_promote_to_admin(normal_user):
    token = normal_user["token"]
    # A normal user's allUsers is RLS-scoped to their own row; grab their id.
    own = _gql("{ allUsers { nodes { id role } } }", token)
    nodes = (own.get("data") or {}).get("allUsers", {}).get("nodes") or []
    assert len(nodes) == 1, f"expected only own row under RLS, got {nodes}"
    uid = nodes[0]["id"]
    assert nodes[0]["role"] != "admin"

    mutation = (
        "mutation($id: String!) {"
        "  updateUser(input: { id: $id, patch: { role: \"admin\" } }) {"
        "    user { id role }"
        "  }"
        "}"
    )
    status, raw = _http(
        "POST",
        "/trex/graphql",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        body=json.dumps({"query": mutation, "variables": {"id": uid}}).encode(),
    )
    payload = json.loads(raw)
    # The mutation must NOT promote the user: either a GraphQL error (column
    # UPDATE denied) with data.updateUser null, or role unchanged.
    updated = (payload.get("data") or {}).get("updateUser")
    if updated and updated.get("user"):
        assert updated["user"]["role"] != "admin", f"PRIVILEGE ESCALATION: {payload}"

    # And it must not have persisted.
    after = _gql("{ allUsers { nodes { role } } }", token)
    roles = {n["role"] for n in ((after.get("data") or {}).get("allUsers", {}).get("nodes") or [])}
    assert "admin" not in roles, f"role persisted as admin after update: {after}"
