---
sidebar_position: 4
---

# Function Plugins

Function plugins register HTTP API endpoints powered by Deno EdgeRuntime workers.
Each function runs in an isolated worker with configurable permissions, secrets
injection, and optional ESZIP bundles.

## Configuration

```json
{
  "trex": {
    "functions": {
      "env": {
        "_shared": {
          "DATABASE_URL": "${DATABASE_URL}",
          "API_KEY": "${MY_API_KEY:-}"
        },
        "production": {
          "FEATURE_FLAG": "on"
        }
      },
      "roles": {
        "my-plugin-admin": ["my-plugin:read", "my-plugin:write"],
        "my-plugin-viewer": ["my-plugin:read"]
      },
      "scopes": [
        { "path": "/plugins/my-plugin/admin/*", "scopes": ["my-plugin:write"] },
        { "path": "/plugins/my-plugin/*", "scopes": ["my-plugin:read"] }
      ],
      "api": [
        {
          "source": "/my-plugin",
          "function": "/functions",
          "env": "production",
          "imports": "/functions/import_map.json",
          "eszip": "/dist/bundle.eszip",
          "allowHostFsAccess": false,
          "permissions": { "net": ["api.example.com"] }
        }
      ],
      "init": [
        {
          "function": "/functions/setup.ts",
          "waitfor": "http://localhost:5432",
          "delay": 1000
        }
      ]
    }
  }
}
```

## API Routes

Each entry in `api` registers an Express handler at
`${PLUGINS_BASE_PATH}{scopePrefix}{source}/*` (default
`/plugins/<scope>/<source>/*`):

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | URL path. Mounted under `${PLUGINS_BASE_PATH}` plus the plugin's scope prefix. |
| `function` | string | Path to the worker **directory** (containing `index.ts`), relative to the plugin directory. The Deno EdgeRuntime resolves the entrypoint inside the directory. Pointing at a specific `.ts` file fails with `could not find an appropriate entrypoint`. |
| `env` | string | Selects the per-environment env block to merge with `_shared`. Typically `production`, `development`, or omitted. |
| `imports` | string | Path to a Deno import map. Absolute paths and URLs are passed through; relative paths are resolved against the plugin directory. |
| `eszip` | string | Path to a prebuilt ESZIP bundle (e.g. produced by `deno bundle` / `esbuild` + `eszip`). When set, the worker loads from the bundle instead of source. |
| `allowHostFsAccess` | bool | When `true`, the worker may read/write the host filesystem outside its sandbox. Default `false`. |
| `permissions` | object | Deno permissions object passed straight to the worker (e.g. `{ net: [...], read: [...] }`). |
| `memoryLimitMb` | number | Per-worker memory cap. Default `4096`. |
| `cpuTimeSoftLimitMs` | number | CPU soft limit. Default `60000000`. |
| `cpuTimeHardLimitMs` | number | CPU hard limit. Default `120000000`. |

All HTTP methods (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`) route to the worker
under the registered path.

## Init Hooks

`functions.init[]` runs one-shot setup workers at server startup:

| Field | Description |
|-------|-------------|
| `function` | Path to the init script. |
| `env` | Environment block to merge. |
| `imports` | Import map path (same rules as `api[].imports`). |
| `eszip` | Optional ESZIP bundle for the init worker. |
| `waitfor` | URL to poll until reachable before running. |
| `waitforEnvVar` | Name of an env var whose value to use as `waitfor` URL. |
| `delay` | Milliseconds to wait after the worker exits. |

Init workers run sequentially in declaration order.

## Roles & Scopes

Plugins ship their own authorization model. The loader merges plugin roles into
the global `ROLE_SCOPES` map and prepends `scopes[].path` patterns into the
URL-scope check list.

- Roles are auto-created in `trexdb.role` at startup (via `ensureRolesExist`).
- Admin users bypass every scope check.
- Non-admin callers must hold a role whose scope set covers all scopes required
  by the matched URL pattern.
- The first matching path pattern wins. Order entries from most specific to least
  specific.

## Environment Variables

Workers receive a merged env map composed of:

1. `_shared` from the plugin config (with `${VAR}` substitution).
2. The block named by the `api[].env` field, if any.
3. `TREX_FUNCTION_PATH` — absolute path to the plugin directory.

Plugin workers do **not** receive auto-injected database secrets. The 30s-TTL
decrypted-secrets injection (from `trexdb.secret`) applies to the trex serverless
functions runtime, not to plugin workers — surface any secrets a plugin needs
through `_shared` / the `env` block with `${VAR}` substitution.

Substitution syntax (in the plugin config — not at runtime in the worker):

| Pattern | Behavior |
|---------|----------|
| `${VAR}` | Value of env var (empty string if unset). |
| `${VAR:-default}` | Value or default if unset/empty. |
| `${VAR-default}` | Value or default if unset. |
| `${VAR:?error}` | Throw if unset/empty. |
| `${VAR:+alternate}` | Alternate if set and non-empty. |

## Auth Context

The Express middleware injects auth metadata into every plugin request before it
reaches the worker:

| Header | Source |
|--------|--------|
| `x-user-id` | `pgSettings["app.user_id"]` |
| `x-user-role` | `pgSettings["app.user_role"]` |

The original `Authorization` header is forwarded. `accept-encoding` is stripped
to avoid double-encoded responses.

## Worker Limits

Each request worker is bounded by (defaults):

- `memoryLimitMb` — 4096 MB.
- 30-minute wall clock timeout per request.
- `cpuTimeSoftLimitMs` — 60 000 000 ms soft / `cpuTimeHardLimitMs` — 120 000 000 ms hard.

All three limits are configurable per-plugin via the `api` entry
(`memoryLimitMb`, `cpuTimeSoftLimitMs`, `cpuTimeHardLimitMs`).

Init workers (see [Init Hooks](#init-hooks)) use a separate, non-configurable set
of limits: 1000 MB memory, a 3-minute timeout, and 100 000 / 200 000 ms CPU
soft/hard limits.
