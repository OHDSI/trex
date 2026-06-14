---
sidebar_position: 2
---

# Authentication API

trexsql ships a GoTrue-compatible auth router (custom Express implementation) plus
machine-to-machine API keys for MCP / CLI access. JWT access tokens (1h) and opaque
refresh tokens are issued from `trexdb.refresh_token`; passwords are hashed in
`trexdb.user.password_hash` (legacy `trexdb.account.password` rows are migrated on first
login).

## Base Path

All auth endpoints are mounted at `${BASE_PATH}/auth/v1`. With the default
`BASE_PATH=/trex` that is:

```
/trex/auth/v1/*
```

## Email & Password

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/signup` | none | Register with email + password. Honors the `auth.selfRegistration` setting; returns 403 when disabled. The first registered user (or any user matching `ADMIN_EMAIL`) becomes admin. |
| POST | `/token?grant_type=password` | none | Exchange email/password for `access_token` + `refresh_token`. |
| POST | `/token?grant_type=refresh_token` | none | Rotate a refresh token. The old token is revoked atomically. |
| POST | `/logout` | Bearer | Revoke all refresh tokens tied to the access token's session. |
| POST | `/recover` | none | Stub. Always returns `{}` (avoids email enumeration). Recovery email delivery is not built-in. |
| POST | `/change-password` | Bearer | Verify `currentPassword`, set `newPassword`, revoke all outstanding refresh tokens. |
| POST | `/password-changed` | Bearer | Clear the `mustChangePassword` flag for the calling user. |

## User & Session Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/user` | Bearer | Return the current user as a GoTrue user object. |
| PUT | `/user` | Bearer | Update `email`, `password`, or `data` (merged into `user_metadata`). Password changes revoke all refresh tokens. |
| GET | `/sessions` | Bearer | List active sessions for the current user (one row per `session_id`). |
| POST | `/revoke-session` | Bearer | Revoke a session by `session_id`. |
| GET | `/accounts` | Bearer | List linked OAuth/credential accounts. |

## Settings & Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/settings` | none | Returns `{ external: { email, google, github, microsoft, apple }, disable_signup, mailer_autoconfirm, ... }`. Provider flags are read from `trexdb.sso_provider`. |
| GET | `/health` | none | Returns `{ version, name: "GoTrue", description }`. |

## Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/admin/create-user` | Bearer (admin) | Create a user without registration restrictions. Body: `{ email, password, data: { name?, role? } }`. `/admin/users` is a GoTrue-compatible alias for the same handler. |
| POST | `/sync-cookie` | Bearer | Set an `httpOnly` session cookie from the supplied access token (used by the web UI). |

## Social Providers

Configured per-provider in `trexdb.sso_provider` (DB-driven, takes precedence) or via
env vars:

| Provider | Environment Variables |
|----------|----------------------|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| GitHub | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` |
| Microsoft | `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |
| Apple | (DB-driven only) |

## Tokens

- Access tokens are JWTs signed with an HS256 key derived from `TREX_ROOT_KEY` via HKDF
  (label `trex.jwt.hs256.v1`), valid for 3600 seconds, with
  `app_metadata.trex_role` carrying the user role.
- Refresh tokens are random opaque strings hashed into `trexdb.refresh_token`. Rotating
  a refresh token marks the old row `revoked = true`. A password change or `/logout`
  revokes every refresh token tied to the session (or user).

## API Keys (machine-to-machine)

API keys are used by MCP clients and the Trex / Supabase CLI. Bearer prefix
`trex_<48-hex>` denotes an MCP-style key; `sbp_…` denotes a CLI personal access token.
Both formats validate against `trexdb.api_key`.

These endpoints require an admin Bearer JWT (or an admin API key) — `user.role` must
be `admin`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `${BASE_PATH}/api/api-keys` | Bearer (admin) | Create a new key. Body `{ name, expiresAt? }`. |
| GET | `${BASE_PATH}/api/api-keys` | Bearer (admin) | List the caller's keys. |
| DELETE | `${BASE_PATH}/api/api-keys/:id` | Bearer (admin) | Revoke a key. |

## CLI Login Flow

The web UI can hand a CLI a sealed access token via an ephemeral ECDH+AES-GCM
exchange. See [CLI / Management API](functions#cli-login-flow) for details.

## First User

The first registered user is automatically promoted to `admin`. After bootstrap, set
`auth.selfRegistration = false` (via the admin UI) and create users through
`POST /auth/v1/admin/create-user` or the MCP `user-create` tool.

## User Model

Beyond the standard GoTrue fields, `trexdb.user` carries:

| Field | Type | Description |
|-------|------|-------------|
| `role` | string | `admin` or `user` (default `user`). Surfaces as `app_metadata.trex_role` in JWTs. |
| `deletedAt` | timestamp | Soft-delete marker. Deleted users are filtered from all auth queries. |
| `mustChangePassword` | bool | Force a password change before privileged actions. Cleared by `/password-changed`. |
| `password_hash` | string | scrypt hash (Better-Auth compatible, format `saltHex:hashHex`). Legacy hashes in `trexdb.account.password` are migrated on first successful login. |
