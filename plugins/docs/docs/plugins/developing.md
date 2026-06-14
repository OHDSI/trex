---
sidebar_position: 2
---

# Developing Plugins

This guide covers creating a trexsql plugin from scratch.

## Package Structure

A plugin is an NPM package with a `trex` configuration in `package.json`:

```
my-plugin/
  package.json
  functions/           # API endpoint source files
    index.ts
    deno.json          # Deno config / import map (optional)
  dist/                # Built frontend assets
  migrations/          # SQL migration files
    001_init.sql
```

## package.json

The `trex` key defines what the plugin provides:

```json
{
  "name": "@trex/my-plugin",
  "version": "1.0.0",
  "trex": {
    "functions": {
      "env": {
        "_shared": {
          "DATABASE_URL": "${DATABASE_URL}"
        }
      },
      "api": [
        {
          "source": "/my-plugin",
          "function": "/functions",
          "imports": "/functions/deno.json"
        }
      ]
    },
    "ui": {
      "routes": [
        { "path": "/my-plugin", "dir": "dist" }
      ],
      "uiplugins": {
        "sidebar": [
          { "route": "/my-plugin", "label": "My Plugin", "icon": "LayoutDashboard" }
        ]
      }
    },
    "migrations": {
      "schema": "my_plugin",
      "database": "_config"
    }
  }
}
```

The `imports` field is optional — most function plugins omit it and rely on a
`deno.json` discovered by the runtime. `eszip` is an advanced field for shipping
a prebuilt bundle and is rarely set.

## Environment Variable Substitution

Function plugins support environment variable expansion in the `env` block:

| Pattern | Behavior |
|---------|----------|
| `${VAR}` | Value of env var (empty string if unset) |
| `${VAR:-default}` | Value or default if unset/empty |
| `${VAR-default}` | Value or default if unset |
| `${VAR:?error}` | Throw error if unset/empty |
| `${VAR:+alternate}` | Alternate value if set and non-empty |

## Init Functions

Run one-time setup tasks at plugin startup:

```json
{
  "trex": {
    "functions": {
      "init": [
        {
          "function": "/functions/setup.ts",
          "env": "production",
          "imports": "/functions/deno.json",
          "waitfor": "http://localhost:5432",
          "delay": 1000
        }
      ]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `function` | Path to init script. |
| `env` | Environment block to merge with `_shared`. |
| `imports` | _(optional)_ Path to a Deno config / import map (e.g. `deno.json`). |
| `eszip` | _(optional, advanced)_ Path to a prebuilt ESZIP bundle (alternative to source). |
| `waitfor` | URL to poll before running. |
| `waitforEnvVar` | Env var containing URL to poll. |
| `delay` | Milliseconds to wait after init. |

## Development Workflow

1. Create your plugin directory in `plugins-dev/` (always auto-discovered, dev-first)
2. Add your `package.json` with the `trex` configuration
3. Start the server with `docker compose up` — volume mounts enable hot reload
4. Access function endpoints at `${PLUGINS_BASE_PATH}<scope>/<source>/*` — i.e. under `/plugins` (not `/trex`) including the package scope segment, e.g. `/plugins/trex/devx-api` for `@trex/...` with `source: "/devx-api"`
5. Access UI routes at the configured paths

## Publishing

Plugins are published as NPM packages to the configured registry and can be installed via:

```sql
SELECT * FROM trex_plugin_install_with_deps('@trex/my-plugin@1.0.0', './plugins');
```
