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

## Federation Administration

Routes for administering OIDC federation (registering an upstream provider,
pre-linking identities before a user's first sign-in). Mounted at
`${BASE_PATH}/admin/federation`. Auth: a Bearer token that is either the
service-role key or a trex admin's access token (`app_metadata.trex_role ===
"admin"`) — the same check `POST /admin/roles/assign` uses.

| Method | Path | Description |
|--------|------|-------------|
| PUT | `/providers/:id` | Create or replace a provider's config (`displayName`, `clientId`, `clientSecret`, `issuer`, `discoveryUrl`, `authorizationEndpoint`, `scopes`, `groupsSource`, `groupsClaim`, `autoProvision`, `enabled`). 204 on success, 400 on an invalid body. |
| PATCH | `/providers/:id` | Enable or disable a provider. Body `{ enabled: boolean }`. 204 on success, 404 if the provider is unknown, 400 on an invalid body. |
| PUT | `/links` | Pre-link an upstream identity (`providerId`, `accountId`, `email`, `name?`, `banned?`, `userId?`) to a trex user ahead of its first sign-in — matches by email, or provisions a password-less user if none exists. With `userId` (1–128 of `A-Z a-z 0-9 _ -`; anything else is a 400), the identity is bound to exactly that trex user id: an existing user with that id is linked, otherwise one is created with that id, and a user holding the email under a different id is a 409 rather than a link — so a migrated user keeps its old id as its token `sub`. 200 with `{ userId, outcome }` (`linked` \| `created` \| `already_linked`), 404 if the provider is unknown, 409 with `{ userId }` if the account is already linked to a *different* user, or the user is already linked to a different account at that provider. |

`sso_provider.authorization_endpoint` is the URL a browser can actually reach
for the authorize redirect — set it when the provider's OIDC discovery
document advertises an endpoint that isn't reachable from outside the
deployment (e.g. an internal-only issuer host).

When a federated sign-in is refused (unknown account, disabled user, etc.) and
`TREX_OIDC_LOGIN_URL` is set, trex redirects the browser back to that login
page with `error` (one of trex's fixed refusal codes) and `return_to` query
params instead of returning a bare JSON error.

## OIDC Provider

Off unless `TREX_OIDC_PROVIDER_ENABLED` is `true` or `1`. When on, trex is an
OpenID Connect provider for its own relying parties (WebAPI, the d2e portal),
served by `@better-auth/oauth-provider` under `${BASE_PATH}/oidc`.

| Path | Description |
|------|-------------|
| `/.well-known/openid-configuration` | Discovery. Every other URL below is advertised here; fetch it rather than hard-coding them. |
| `/.well-known/jwks.json` | The RS256 key set. |
| `/oauth2/authorize` | Authorization code flow, PKCE required. |
| `/oauth2/token` | `authorization_code`, `refresh_token`, `client_credentials`. |
| `/oauth2/userinfo` | |
| `/oauth2/end-session` | RP-initiated logout. |

Anything under `${BASE_PATH}/oidc` that is not `/oauth2/...` or
`/.well-known/...` answers 404, including Better Auth's own sign-in and session
routes: `${BASE_PATH}/auth/v1` owns those. Clients are registered from the
environment (`TREX_OIDC_CLIENT_ID`, `TREX_OIDC_CLIENT_SECRET`,
`TREX_OIDC_CLIENT_REDIRECT_URIS`, `TREX_OIDC_CLIENT_POST_LOGOUT_URIS`,
`TREX_OIDC_CLIENT_ROLES`, `TREX_OIDC_CLIENT_SCOPES`) at boot; there is no HTTP
surface for creating one.

Two things worth knowing before they surprise you:

- **`TREX_OIDC_ISSUER` is checked at boot, and a bad value stops the node
  coming up.** It must be `https:` (or a loopback host) and carry no query or
  fragment; Better Auth would otherwise silently rewrite it, and every token
  would go out with an `iss` no relying party expects. The failure is loud on
  purpose — a node that serves unusable tokens looks healthy. `/trex/api/ready`
  stays down and the reason is on stderr.
- **The whole engine answers at the issuer path**, not just the protocol
  endpoints, because the discovery document builds every endpoint URL from it.
  One consequence: an `https:` issuer gives Better Auth's session cookie the
  `__Secure-` prefix and the `secure` attribute, so a deployment that terminates
  TLS elsewhere and speaks plain http to trex will not see that cookie come
  back.

Relying parties must set their expected audience to the issuer (the access
token's `aud` is the RFC 8707 resource identifier, not the client id) alongside
the client id, which is what the id_token carries. In d2e that is
`D2E_IDP_AUDIENCES`, and it is what `D2E_IDP=trex` now defaults to, so a
deployment that sets nothing accepts both tokens. Setting it replaces the pair
rather than adding to it.

The same identifier is sent as the token request's `resource` (`D2E_IDP_RESOURCE`,
defaulting to the issuer). Without it the provider mints an opaque access token
rather than a JWT, and nothing downstream can read or verify it.

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
