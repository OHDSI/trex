---
sidebar_position: 4
---

# Edge Functions & Management API

Trex bundles the Supabase Edge Runtime for running Deno-based edge functions and
implements the Supabase management API surface so the standard `supabase` CLI can
deploy / manage them.

## Endpoints

### Invocation

| Pattern | Description |
|---------|-------------|
| `${BASE_PATH}/functions/v1/:slug` | Invoke a built-in function by slug (any HTTP method). |
| `${BASE_PATH}/functions/v1/:slug/*` | Subpath under the same worker. |
| `${PLUGINS_BASE_PATH}${scopePrefix}/:source/*` | Invoke a function registered by a plugin. |

`BASE_PATH` defaults to `/trex`. Plugin-routed functions use the **separate**
`PLUGINS_BASE_PATH` (default `/plugins`), not `BASE_PATH` — so with defaults a scoped
plugin function lives at `/plugins/@trex/:source/*`, not `/trex/plugins/...`.
`scopePrefix` is the plugin scope (e.g. `/@trex`) and is omitted for non-scoped
plugins.

For plugin-routed functions, the `authContext` middleware injects `x-user-id` and
`x-user-role` headers into the worker request based on the session JWT. The built-in
`/functions/v1/:slug` invoker does **not** inject those headers — it verifies the JWT
(when `verify_jwt` is set) and forwards only the inbound `Authorization` header.

### Management API (Supabase CLI compatible)

These mirror Supabase's REST API so `supabase login`, `supabase functions deploy`,
`supabase secrets set`, `supabase gen types`, and `supabase config push` work
against a Trex deployment. Every endpoint requires admin auth: a Bearer JWT with
`trex_role = "admin"`, an `sbp_…` personal access token, or a `trex_…` API key.

| Method | Path | Description |
|--------|------|-------------|
| GET | `${BASE_PATH}/v1/organizations` | Returns `[{ id: "trex-org", name: "trex" }]`. |
| GET | `${BASE_PATH}/v1/projects` | Returns a single synthetic project (used by `supabase login` to validate tokens). |
| GET | `${BASE_PATH}/v1/projects/:ref` | Project metadata with the resolved DB host (`EXTERNAL_DB_URL` → `POOLER_URL` → `DATABASE_URL`). |
| GET | `${BASE_PATH}/v1/projects/:ref/api-keys?reveal=true` | Anon and service-role keys (`reveal=true` returns plaintext for admins). |
| POST | `${BASE_PATH}/v1/projects/:ref/cli/login-role` | Allocates a temporary `cli_login_*` Postgres role with login privilege, valid for 1 hour. |
| GET / PATCH / PUT | `${BASE_PATH}/v1/projects/:ref/config/auth` | GoTrue config. PATCH/PUT updates persist into `trexdb.setting`. |
| GET / PATCH / PUT | `${BASE_PATH}/v1/projects/:ref/config/database/postgres` | Postgres tunables (advisory; `trexdb.setting` only). |
| GET / PATCH / PUT | `${BASE_PATH}/v1/projects/:ref/config/storage` | Storage config (file-size limit, image-transformation flag). |
| GET | `${BASE_PATH}/v1/projects/:ref/config/database/pooler` | Connection pool / pooler info derived from env DB URLs. |
| GET / PATCH / PUT | `${BASE_PATH}/v1/projects/:ref/postgrest` | PostgREST config. |
| GET | `${BASE_PATH}/v1/projects/:ref/network-restrictions` | Stub (returns `0.0.0.0/0`). |
| GET | `${BASE_PATH}/v1/projects/:ref/ssl-enforcement` | Stub. |
| GET | `${BASE_PATH}/v1/projects/:ref/billing/addons` | Empty addon list (required by `supabase config push`). |

#### Functions

| Method | Path | Description |
|--------|------|-------------|
| GET | `${BASE_PATH}/v1/projects/:ref/functions` | List all functions discovered under `FUNCTIONS_DIR` (default `./functions`). |
| GET | `${BASE_PATH}/v1/projects/:ref/functions/:slug` | Function metadata. `entrypoint_path` is rewritten to a `file:///` URL for CLI compatibility. |
| GET | `${BASE_PATH}/v1/projects/:ref/functions/:slug/body` | Returns the ESZIP bundle (`esbuild.esz`, optionally `EZBR`-prefixed Brotli) if present, otherwise the entrypoint source. |
| POST | `${BASE_PATH}/v1/projects/:ref/functions?slug=…&entrypoint_path=…&verify_jwt=…` | Deploy. Body is the raw ESZIP bundle. Stored at `FUNCTIONS_DIR/:slug/esbuild.esz`. Bumps `version`. |
| POST | `${BASE_PATH}/v1/projects/:ref/functions/deploy` | Legacy JSON deploy: `{ slug, name?, body, verify_jwt?, entrypoint_path?, import_map? }`. |
| DELETE | `${BASE_PATH}/v1/projects/:ref/functions/:slug` | Remove the function directory. |

#### Secrets

| Method | Path | Description |
|--------|------|-------------|
| GET | `${BASE_PATH}/v1/projects/:ref/secrets` | List secrets (name + hash, no plaintext). `SUPABASE_*` names are filtered out. |
| POST | `${BASE_PATH}/v1/projects/:ref/secrets` | Body: `[{ name, value }, …]`. Values are stored encrypted in `trexdb.secret`. |
| DELETE | `${BASE_PATH}/v1/projects/:ref/secrets` | Body: `[name, …]`. |

Secrets are decrypted and injected as env vars for every edge-function worker. The
server caches decrypted secrets for 30 seconds; mutations invalidate the cache.

#### Types

| Method | Path | Description |
|--------|------|-------------|
| GET | `${BASE_PATH}/v1/projects/:ref/types/typescript?included_schemas=public,trexdb` | Generate Supabase-style `Database` TypeScript types from `information_schema`. Used by `supabase gen types typescript`. |

## Function Metadata (`function.json`)

Each function directory may contain a `function.json`:

```json
{
  "slug": "hello-world",
  "name": "hello-world",
  "status": "ACTIVE",
  "version": 3,
  "verify_jwt": true,
  "entrypoint_path": "index.ts",
  "import_map_path": null,
  "created_at": 1730000000,
  "updated_at": 1730500000
}
```

If a function directory has only an `index.ts` and no `function.json`, defaults are
synthesized at read time (status `ACTIVE`, version `1`, `verify_jwt: true`).

## Writing a Function

Workers use the standard Supabase Edge Runtime Fetch API:

```typescript
Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return Response.json({ status: "ok" });
  }
  return new Response("Method not allowed", { status: 405 });
});
```

### Auth Context

Plugin-routed functions (via `PLUGINS_BASE_PATH`) receive the injected user headers;
the built-in `/functions/v1/:slug` invoker forwards only `Authorization`:

| Header | Source |
|--------|--------|
| `x-user-id` | `app.user_id` from `pgSettings` (plugin-routed only) |
| `x-user-role` | `app.user_role` from `pgSettings` (plugin-routed only) |
| `Authorization` | Forwarded from the inbound request |

`accept-encoding` is stripped before the worker runs to avoid double-encoded
responses.

### Environment Injection

Workers receive:

- All decrypted entries from `trexdb.secret` (refreshed every 30s).
- The plugin's `_shared` env block (with `${VAR}`/`${VAR:-default}` substitution).
- The plugin's per-`NODE_ENV` env block (e.g. `production`).
- `TREX_FUNCTION_PATH` — absolute path to the plugin directory.

## CLI Login Flow

`POST /api/cli/sessions` (admin only) and `GET /platform/cli/login/:session_id`
implement an ECDH-sealed device-code login used by `supabase login` against a Trex
instance.

```
CLI                        Browser / Web UI               Server
 │                             │                             │
 │  generate ECDH P-256 ──────▶│                             │
 │  open browser w/ pubkey     │                             │
 │                             │  POST /api/cli/sessions ───▶│
 │                             │  { session_id, public_key,  │
 │                             │    token_name }             │
 │                             │                             │  generate sbp_ key
 │                             │                             │  ECDH → AES-GCM
 │                             │  ◀────── { device_code } ───│  store encrypted
 │  GET /platform/cli/login/   │                             │
 │     :session_id?device_code=│ ───────────────────────────▶│
 │  ◀───────────────────────── { encrypted_access_token,     │
 │                              public_key, nonce } ─────────│
 │  derive shared key, decrypt │                             │
```

Sessions live in memory for 5 minutes and are deleted after a single successful
retrieval.

## Built-in Functions

Built-in functions live in `FUNCTIONS_DIR` (default `./functions`) outside any
plugin. They use the same metadata, deployment endpoints, and runtime as plugin
functions, and are invoked at `${BASE_PATH}/functions/v1/:slug`.
