---
sidebar_position: 3
---

# UI Plugins

UI plugins serve static frontend assets and register navigation items in the
admin web app. The web shell uses [single-spa](https://single-spa.js.org/) to
host plugin micro-frontends, but plain static apps are also supported.

## Configuration

```json
{
  "trex": {
    "ui": {
      "routes": [
        { "path": "/my-plugin", "dir": "dist", "spa": true }
      ],
      "uiplugins": {
        "sidebar": [
          {
            "route": "/my-plugin",
            "label": "My Plugin",
            "icon": "LayoutDashboard",
            "children": [
              { "route": "/my-plugin/settings", "label": "Settings" }
            ]
          }
        ]
      }
    }
  }
}
```

## Static Routes

Each `routes` entry maps a URL path to a directory of static files inside the
plugin package:

| Field | Description |
|-------|-------------|
| `path` (or `source`) | URL path relative to `${PLUGINS_BASE_PATH}` (default `/plugins`). With the default, an entry of `path: "/my-plugin"` is reachable at `/plugins/my-plugin`. For scoped packages, the scope segment (e.g. `/trex` for `@trex/...`) is inserted between `${PLUGINS_BASE_PATH}` and the route path, consistent with function routes. |
| `dir` (or `target`) | Directory containing built assets, relative to the plugin root. |
| `spa` | When `true`, serves `index.html` as a fallback for any sub-path so client-side routers (React Router, Vue Router) work. |

Routes register through Deno's native `op_register_static_route` operation. If
the native op is unavailable (e.g. running outside the Trex runtime) the loader
falls back to `express.static`.

## Sidebar Navigation

The `uiplugins.sidebar` array contributes entries to the admin shell's main
navigation:

| Field | Description |
|-------|-------------|
| `route` | Navigation route. |
| `label` | Display label. |
| `icon` | Lucide icon name. |
| `children` | Nested navigation items. |

Items are merged by route — if the same route already exists, the existing entry
is updated; otherwise a new entry is appended.

## FQDN Substitution

Use `$$FQDN$$` anywhere in the `uiplugins` JSON and it will be replaced with the
`PUBLIC_FQDN` environment variable when the navigation config is rendered. Useful
for plugins that need to inject the public-facing URL of the deployment into
client-side config.

## single-spa Integration

The web shell (`plugins/web`) bootstraps single-spa and mounts plugin sub-apps
declared via `uiplugins.singleSpa`. A plugin can register itself as a single-spa
application by adding:

```json
{
  "trex": {
    "ui": {
      "uiplugins": {
        "singleSpa": [
          {
            "name": "@trex/my-plugin",
            "activeWhen": "/my-plugin",
            "appURL": "/plugins/my-plugin/main.js"
          }
        ]
      }
    }
  }
}
```

Plain static-asset plugins (no single-spa wiring) still work — they simply load
inside an `<iframe>` shell when navigated to.

## Building UI Plugins

UI plugins typically use a frontend framework (React, Vue, etc.) that builds to
static HTML/JS/CSS:

```bash
cd my-plugin
npm run build   # outputs to dist/
```

The built `dist/` directory is what gets referenced in the `routes` config.
