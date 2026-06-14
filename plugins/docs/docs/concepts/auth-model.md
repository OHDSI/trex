---
sidebar_position: 2
---

# Auth & Authorization

This page explains *how* Trex authenticates users and authorizes requests. For
the endpoint-by-endpoint reference, see [APIs → Auth](../apis/auth).

## Two Identity Surfaces

Trex carries two parallel identity surfaces, both backed by Postgres tables in
the `trexdb` schema:

```mermaid
flowchart LR
    Browser["Browser / Web UI"] -->|JWT + refresh| AuthRouter["GoTrue-compatible<br/>auth router"]
    Code["Server-to-server<br/>(MCP, CLI, scripts)"] -->|Bearer trex_… or sbp_…| ApiKeyAuth["API Key validator"]

    AuthRouter --> UserTable["trexdb.user"]
    AuthRouter --> RefreshTable["trexdb.refresh_token"]
    ApiKeyAuth --> ApiKeyTable["trexdb.api_key"]

    UserTable --> RoleTable["trexdb.role"]
    UserTable --> UserRole["trexdb.user_role"]
    ApiKeyTable --> UserTable
```

- **Interactive sessions** issue short-lived JWT access tokens (1 hour) plus
  opaque refresh tokens. Browser-based UIs and the auth-required parts of the
  GraphQL/REST surface authenticate this way.
- **Machine-to-machine** clients (MCP, the `trex` CLI, automation scripts)
  present long-lived API keys. There are two prefixes — `trex_…` for
  server-issued keys and `sbp_…` for keys issued through the CLI device-code
  login. Both validate against `trexdb.api_key`.

The two surfaces share a single user table: every API key is owned by a user,
and that user's role determines what the key can do.

## What's in a JWT

When a user signs in with email + password (or refreshes a token), the auth
router signs a JWT with the following shape:

```json
{
  "sub": "<user-id>",
  "email": "alice@example.com",
  "role": "authenticated",
  "aud": "authenticated",
  "iss": "http://localhost:8000/trex/auth/v1",
  "iat": <unix timestamp>,
  "exp": <unix timestamp>,
  "session_id": "<uuid>",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"],
    "trex_role": "admin"
  },
  "user_metadata": {
    "name": "Alice",
    "image": null,
    "must_change_password": false
  }
}
```

Note that the system role lives at `app_metadata.trex_role` — the top-level
`role` is always `authenticated` (Supabase/GoTrue compatibility); `iss` is
derived from `BETTER_AUTH_URL` + the base path.

The token is an HS256 JWT signed with a key derived from `TREX_ROOT_KEY` via
HKDF under the label `trex.jwt.hs256.v1` (see `core/server/auth/jwt.ts` and
`keys.ts`). `BETTER_AUTH_SECRET` is no longer the signing key — it survives
only as a legacy compatibility comment. To rotate the signing key, bump the
HKDF label suffix (e.g. `.v2`) and re-issue tokens; all tokens signed under the
old label become invalid by design. The token is consumed by the `authContext`
middleware, which extracts the `trex_role` and exposes it as the Postgres GUC
`app.user_role` for downstream queries.

## Roles & Scopes

Trex has *two* role concepts that look superficially similar but live in
different layers:

| Layer | Where | Purpose |
|-------|-------|---------|
| **System role** | `trexdb.user.role` (`admin` or `user`) | Determines whether the caller bypasses scope checks. |
| **Plugin roles** | `trexdb.role` (auto-created by plugins) + `trexdb.user_role` join | Fine-grained URL-pattern authorization for plugin routes. |

The system role is binary: admins bypass every authorization check. Non-admins
need plugin roles whose scope set covers the URL pattern they're hitting.
Plugin roles are assigned to users through the `trexdb.user_role` join table
(one row per `(userId, roleId)` pair).

```mermaid
flowchart TD
    Req["Incoming request"] --> AuthCtx["authContext: extract user/role from JWT or API key"]
    AuthCtx --> IsAdmin{trex_role == admin?}
    IsAdmin -->|Yes| Allow1[Allow]
    IsAdmin -->|No| MatchPath{Path matches a<br/>scope pattern?}
    MatchPath -->|No match| Allow2[Allow]
    MatchPath -->|Match| HasScopes{User's plugin roles<br/>cover required scopes?}
    HasScopes -->|Yes| Allow3[Allow]
    HasScopes -->|No| Deny[403 Forbidden]
```

A plugin contributes to this model by declaring `roles` and `scopes` in its
`package.json`. Scopes are URL patterns mapped to a list of required scope
strings; roles are named bundles of scope strings. The plugin loader
auto-creates rows in `trexdb.role` at startup so admins can assign them to
users (via `trexdb.user_role`) through the UI/MCP.

## Sessions & Refresh Tokens

Every interactive sign-in creates a session UUID and stores a refresh token in
`trexdb.refresh_token` keyed by that session. The session is the unit of
revocation: logging out, rotating a password, or revoking from
`/auth/v1/sessions` invalidates all refresh tokens tied to that session, but
leaves other sessions intact (so signing out of one device doesn't sign you out
everywhere).

Refresh tokens themselves are opaque random strings, hashed at rest. Rotation
is mandatory — using a refresh token marks it `revoked = true` and issues a new
one in the same session.

## SSO

The `/auth/v1/settings` endpoint reports which SSO providers are enabled. For
each provider, settings come from one of two sources:

1. **`trexdb.sso_provider`** (DB-driven) — preferred. Allows runtime
   configuration, supports Apple, and tracks per-provider client IDs.
2. **Environment variables** (`GOOGLE_CLIENT_ID`, etc.) — legacy fallback for
   bootstrap.

Enabled providers appear in the login page. The actual OAuth dance is driven
by the auth router's social provider plumbing.

## API Keys for MCP & CLI

API keys give code paths the same authorization story as user sessions, with
two simplifications:

- They never expire on a clock — they're explicitly revoked.
- They carry their owner's `trex_role`. An API key issued by an admin user
  authorizes admin-level operations; one from a regular user does not.

Trex issues two prefixes:

- `trex_<48-hex>` — created via the web UI or the `api-key-create` MCP tool.
  Targeted at MCP and other internal automation.
- `sbp_…` — created by the CLI device-code login flow. Compatible with
  `SUPABASE_ACCESS_TOKEN`-style auth; the management API accepts both prefixes
  interchangeably.

## Putting It Together

```mermaid
sequenceDiagram
    participant U as User Browser
    participant W as Web UI
    participant A as Auth Router
    participant DB as Postgres
    participant API as Plugin / GraphQL / REST

    U->>W: Open admin UI
    W->>A: POST /auth/v1/token (password grant)
    A->>DB: Verify trexdb.user.password_hash
    A->>DB: INSERT trexdb.refresh_token
    A-->>W: { access_token, refresh_token }
    W->>API: GET /trex/graphql<br/>Authorization: Bearer access_token
    API->>API: authContext: validate JWT, set app.user_id / app.user_role
    API->>API: pluginAuthz: check scope match
    API-->>W: { data }

    Note over U,API: 60 minutes later — access token expires
    W->>A: POST /auth/v1/token (refresh_token grant)
    A->>DB: UPDATE old token revoked=true,<br/>INSERT new token
    A-->>W: { access_token, refresh_token }
```

## Next steps

- See [APIs → Auth](../apis/auth) for endpoint-by-endpoint reference.
- See [Plugins → Function Plugins](../plugins/function-plugins) for how a
  plugin declares its own roles and scopes.
- See [APIs → MCP](../apis/mcp) and [CLI](../cli) for how the two API-key
  prefixes are used in practice.
