---
name: testing-atlas3-locally
description: Use when running, previewing or verifying Atlas3 / OHDSI ATLAS v3 locally — starting its dev server, checking that a plugin actually loads and mounts, or deciding which Atlas check to run (type-check, unit, e2e, check-all) before calling a change done.
---

# Testing Atlas3 locally

Atlas3 is a standalone Vue 3 + Vite app in its own git repository, **not** a
d2e app served through trex. `testing-d2e-ui` and `d2e-ui-preview` are about
building a d2e app and overwriting the resources trex serves on :41100 — they
do not apply here. Plugin authoring lives in **`writing-atlas3-plugins`**,
which also covers checking the repo out.

## Run it

```bash
# Same checkout writing-atlas3-plugins uses; clone it there if it's missing.
ATLAS3_DIR="${ATLAS3_DIR:-$HOME/code/Atlas3}"
cd "$ATLAS3_DIR"
npm install                       # first time
BROWSER=none npm run dev          # http://localhost:5173 (strictPort)
```

- `predev` runs `tokens:build` + `vendor:build` automatically. Never invoke
  `vite` directly — you skip it, and the app boots with missing
  `src/ui/tokens.css` output and an empty `public/vendor/`.
- `server.open` is `true`; `BROWSER=none` suppresses the browser launch on a
  headless box (it otherwise just logs a failure).
- **Backend:** the dev server proxies `/WebAPI` to `http://localhost:8080`
  (override with `WEBAPI_URL`). With no WebAPI, run
  `npm run dev -- --mode test`: that swaps the proxy for a stub that answers
  503, so the shell renders and plugin loading works while data calls fail.
  This is exactly what the e2e suite's `webServer` starts.
- Routing is **hash-based** (`createWebHashHistory`) — URLs look like
  `http://localhost:5173/#/datasources`, and a plugin route is
  `#/plugins/<plugin-id>/…`.

## The plugin loop

```bash
npm run lib:build                                   # once per checkout — builds packages/atlas-ui/dist
cd plugins-dev/<plugin-id> && npm run build         # → public/plugins/<plugin-id>/index.system.js
# edit public/config/plugins.json (and the src/config/ copy) if registration changed
# hard-reload the browser
```

Vite serves `public/` at the web root, so the bundle needs no dev-server
restart — a reload is enough. Registration changes are fetched once at app
init, so they also need a reload, not just a route change.

Verify in this order, stopping at the first thing that fails:

```bash
curl -sI http://localhost:5173/plugins/<plugin-id>/index.system.js   # 200 = built + served
curl -s  http://localhost:5173/config/plugins.json | grep <plugin-id> # registered
```

Then load the app and check the browser console: `PluginFramework` logs
`Loaded N plugin(s)`, `PluginConfig` logs manifest validation errors, and
`PluginLoader` logs the resolved bundle URL and any lifecycle failure. These
failures are console-only — nothing surfaces in the UI.

## Which check to run

| Situation | Command |
|---|---|
| Touched `.ts`/`.vue` in `src/` | `npm run type-check` |
| Changed logic with unit tests | `npm run test:unit:run` (`test:unit` watches) |
| Changed plugin loading, manifest schema, mount points | `npx vitest run tests/unit/plugins tests/unit/models/PluginModels.spec.ts` |
| Changed a user-visible flow | `npm run test:e2e` (`:headed`, `:ui`, `:report`) |
| Changed shared styling/layout | `npm run test:visual` |
| Before declaring a change done | `npm run check-all` (type-check + lint + unit + build) |

Playwright starts its own dev server on :5173 with `reuseExistingServer` off CI,
so a dev server you already started is reused — kill a stale one if the suite
behaves oddly. E2E mocks WebAPI (`tests/e2e/helpers/api-mocks.ts`); it does not
need a backend.

Plugin e2e specs (`tests/e2e/plugin-framework.spec.ts`,
`plugin-mount-points.spec.ts`) deliberately serve a **stub parcel** rather than
your built bundle, because `public/plugins/` and `packages/atlas-ui/dist/` are
gitignored. Passing e2e therefore does **not** prove your plugin loads — check
that manually with the loop above.

## Failure modes

| Symptom | Cause |
|---|---|
| Plugin absent, no console error | Built but not registered — no entry in `public/config/plugins.json` |
| Entry edited, still absent | Edited `src/config/plugins.json` only; the app fetches `public/config/plugins.json` |
| Whole manifest ignored, defaults used | One invalid entry fails zod validation for the file — check the console for the validation error |
| 404 on the bundle | `entryPoint` ≠ `<plugin-id>/index.system.js`, or `vite.config.mjs` `outDir` writes to a different directory |
| Old UI after a rebuild | Stale bundle in `public/plugins/<id>/` (or browser cache) — `rm -rf public/plugins/<id>` and rebuild, then hard-reload |
| Plugin build: *Failed to resolve entry for package @ohdsi/atlas-ui* | `npm run lib:build` never ran |
| App boots unstyled / vendor 404s | `vite` invoked directly, skipping `predev` |
| Menu item present but route 404s | `menuItems[].route` does not start with `/plugins/<plugin-id>/` |
| Mount point silently dropped | `surface: "main-nav"` in `mountPoints` — rejected; use `menuItems` |
| Every data panel empty | No WebAPI at :8080 — expected in `--mode test`; not a bug in your change |

## Channel mode (no ask tool)

Driven from a chat channel you cannot ask whether a backend is available.
Default to `npm run dev -- --mode test`, verify the plugin loads and mounts,
and state in your reply that data panels were empty because no WebAPI was
running — don't stall waiting for one.
