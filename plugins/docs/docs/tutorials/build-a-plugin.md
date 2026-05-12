---
sidebar_position: 7
---

# Build a plugin

This walkthrough builds a minimal Trex plugin in 10 minutes. The plugin
contributes one HTTP function endpoint and one navigation entry in the admin
UI. After you finish, you'll have a working pattern to extend.

It assumes [Quickstart: Deploy](../quickstarts/deploy) is running. For the
plugin to be visible to the container, the `plugins-dev/` directory needs
to be bind-mounted — the dev compose overlay does this:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

The base `docker-compose.yml` ships with the bind commented out so that the
default deploy is image-only.

## 1. Create the plugin directory

Plugins live under `plugins-dev/` while you develop them — the loader
scans this path on every startup. Create:

```bash
mkdir -p plugins-dev/@trex/hello/functions
cd plugins-dev/@trex/hello
```

## 2. Write `package.json`

```json
{
  "name": "@trex/hello",
  "version": "0.1.0",
  "trex": {
    "functions": {
      "env": {
        "_shared": {
          "GREETING": "${GREETING:-Hello}"
        }
      },
      "api": [
        {
          "source": "/hello",
          "function": "/functions"
        }
      ]
    },
    "ui": {
      "uiplugins": {
        "sidebar": [
          {
            "route": "/plugins/trex/hello/",
            "label": "Hello",
            "icon": "Smile"
          }
        ]
      }
    }
  }
}
```

What's happening:

- `functions.api[0].source = "/hello"` mounts the worker at
  `${PLUGINS_BASE_PATH}<scope-prefix>/hello`. For a scoped package
  `@trex/hello`, the scope prefix is `/trex`, so the final path is
  `/plugins/trex/hello/`. Unscoped packages mount directly under
  `${PLUGINS_BASE_PATH}<source>`.
- `functions.api[0].function = "/functions"` points at the worker's
  **directory** (containing `index.ts`), not at a specific file. The Deno
  EdgeRuntime resolves the entrypoint inside the directory.
- `functions.env._shared.GREETING` exposes a configurable env var with a
  default. Override with `GREETING=Hi` on the Trex container.
- `ui.uiplugins.sidebar.route` should match the function path so clicking
  the nav entry hits the worker.

## 3. Add `deno.json`

A bare `deno.json` in the plugin root marks it as its own Deno workspace.
Without this, the EdgeRuntime worker walks up to `/usr/src/deno.json` and
refuses to start because the plugin's `package.json` is inside the parent
workspace tree but not registered as a member. Every working bundled
plugin (`@trex/storage`, `@trex/pg-meta`, etc.) ships one.

`deno.json`:

```json
{
  "nodeModulesDir": "manual",
  "unstable": ["sloppy-imports"]
}
```

## 4. Write the function

`functions/index.ts`:

```typescript
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userRole = req.headers.get("x-user-role") ?? "guest";
  const greeting = Deno.env.get("GREETING") ?? "Hello";
  const name = url.searchParams.get("name") ?? userId;

  return Response.json({
    message: `${greeting}, ${name}!`,
    role: userRole,
    receivedAt: new Date().toISOString(),
  });
});
```

`x-user-id` and `x-user-role` are injected by the auth-context middleware
(see [Concepts → Auth Model](../concepts/auth-model)). `Deno.env.get()`
reads from the merged env block.

## 5. Restart and test

The plugin loader scans `plugins-dev/` at startup. With the dev compose
overlay running, restart only the Trex service:

```bash
docker compose restart trex
```

Watch the logs:

```bash
docker compose logs trex --since=30s | grep hello
```

You should see something like:

```
Found plugin hello (v0.1.0) [dev] in /usr/src/plugins-dev/@trex/hello
add fn /hello @ /usr/src/plugins-dev/@trex/hello/functions/index.ts
Updated UI plugins JSON
Registered plugin hello [dev]
```

If you see `failed to bootstrap runtime: Config file must be a member of
the workspace`, you skipped Step 3 — add the `deno.json` and restart.

:::caution Known regression in the current `latest` image
Even with `deno.json` in place, the current `latest` image has a Deno
workspace-membership regression that can still surface as
`worker boot error: failed to bootstrap runtime: Config file must be a
member of the workspace`. This affects **every** function-worker plugin
in this image, not just this tutorial — bundled plugins like
`@trex/storage` and `@trex/pg-meta` hit it too. The fix is environmental
(image-side); track project issues for status.
:::

Get an access token. The default deployment seeds an admin user
(`admin@trex.local` / password `password`) and disables self-signup, so
log in directly:

```bash
TOKEN=$(curl -s -X POST 'http://localhost:8001/trex/auth/v1/token?grant_type=password' \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@trex.local","password":"password"}' | jq -r .access_token)
```

Hit the endpoint (note the trailing slash — the route is mounted as
`hello/*` so the slash is required):

```bash
curl -H "Authorization: Bearer $TOKEN" \
     "http://localhost:8001/plugins/trex/hello/?name=Alice"
```

Expected output:

```json
{
  "message": "Hello, Alice!",
  "role": "admin",
  "receivedAt": "2026-05-07T10:00:00.000Z"
}
```

Without an `Authorization` header the route returns `401 Unauthorized` —
the auth-context middleware applies to every plugin route. To make a
route public, register it under a path explicitly excluded from the
middleware (advanced; see [Plugins → Function Plugins](../plugins/function-plugins)).

## 6. Add roles and scopes (optional)

If only certain users should hit your endpoint, add to `package.json`:

```json
{
  "trex": {
    "functions": {
      "roles": {
        "hello-user": ["hello:read"]
      },
      "scopes": [
        { "path": "/plugins/trex/hello/", "scopes": ["hello:read"] }
      ],
      "api": [ ... ]
    }
  }
}
```

After restart, the role `hello-user` is auto-created in `trex.role`. Admins
still bypass the check; assign `hello-user` to non-admin users via the admin
UI or the `user-role-assign` MCP tool.

## What just happened

The plugin loader read your `package.json`, dispatched to the function and UI
loaders, registered an Express route at `/plugins/trex/hello/*`, mounted the
function inside a Deno EdgeRuntime worker, and updated the admin shell's nav
JSON. The whole lifecycle is in [Concepts → Plugin System](../concepts/plugin-system).

## Next steps

- **More function options**: env substitution, init hooks, ESZIP bundles,
  Deno permissions — [Plugins → Function Plugins](../plugins/function-plugins).
- **A real UI**: ship a built React/Vue app under `dist/` and reference it
  from `trex.ui.routes` — [Plugins → UI Plugins](../plugins/ui-plugins).
- **Schema migrations**: call `trex_migration_run_schema()` against your
  plugin's `migrations/` directory — [SQL Reference → migration](../sql-reference/migration).
- **Publish**: when stable, publish to your npm registry and install via
  `trex_plugin_install_with_deps()` — [SQL Reference → tpm](../sql-reference/tpm).
