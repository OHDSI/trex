---
name: d2e-ui-preview
description: Use ONLY to run the devx live-preview dev server for a Data2Evidence (d2e) UI app (the in-app preview panel with hot reload). For screenshots/visual verification of a change, do NOT use this — use testing-d2e-ui (build + overwrite the served resources) instead.
---

# d2e UI live preview (dev server)

This skill is for driving the **devx in-app preview** — the live dev server with hot
reload shown in the devx UI. It is NOT the way to take screenshots or verify a change
looks right; for that use **`testing-d2e-ui`** (build + overwrite the served
resources), which is the default and far more reliable. Reach for the dev server only
when a human wants the interactive, hot-reloading preview panel.

## How the preview works
The devx dev-server manager (`plugins/devx/functions/dev_server.ts`) starts **one dev
server per sub-app** via the Rust process manager, allocates a port in 3001–3999, and
reverse-proxies it into trex at `/plugins/trex/devx-api/apps/<appId>/proxy/`. That
proxy base is why the dev command must serve under `--base <proxyBase>`.

Per-app run specs live in `plugins/devx/functions/d2e/recipes.ts` (`UI_RECIPES`). The
manager injects the allocated port/base by `portStyle`:
- **vite** → appends `-- --port <p> --base <proxyBase>` (every d2e UI app except portal).
- **cra** → passes **no flags**; the Rust manager injects `PORT` env (portal only —
  react-scripts ignores `--port`/`--base`).
- `webpack`/`nx`/`deno`/`none` also exist; d2e UIs today are all vite or cra.

`devCommand` is `npm start` for every app — it runs the app's own `start` script, so
there's no coupling to nx project names. Install runs once at the monorepo root
(`bun install`).

## Prerequisites (or the preview won't render)
1. **Build the shared libs first**: `@portal/components` + `@portal/plugin` ship as
   build output only. From `plugins/ui`:
   `bunx nx run-many --targets=build --projects=@portal/components,@portal/plugin`.
   Without them portal won't compile and `mapping`/`concept-mapping` vite won't start.
2. **A sub-app must be selected** — a d2e app has many; the manager refuses to run
   without an active sub-app (the repo-root script would boot the whole platform).
3. **Portal-embedded apps render limited standalone.** Only `vue-mri-ui-lib` and
   `wizards` render meaningfully on their own; the remotes/micro-frontends
   (`flow`, `analysis-ui`, `mapping`, `concept-sets`, `concept-mapping`, `notebook-ui`,
   `jobs`) need portal context (token/datasetId/apiBase) or the portal shell and will
   look blank / 404 / data-error in a bare preview. The app's own vite `server.proxy`
   forwards backend paths to the served instance, but it's per-app and incomplete.

## Editing the recipes
When apps are added/renamed or a framework changes, update `UI_RECIPES`. The recipes
drift from reality (they once said `flow`/`analysis` were webpack — they're Vite now,
and `jobs` pointed at a non-existent `nx dev` target). Keep keys equal to the **app dir
name** under `apps/`, `portStyle: "cra"` only for portal, `"vite"` for the rest, and
`devCommand: "npm start"`. Verify a change by running, in the app dir,
`npm start -- --port <p> --base /plugins/trex/devx-api/apps/x/proxy/` (vite) or
`PORT=<p> npm start` (portal) and confirming it binds and serves the base path.

## Container notes
No `ps`/`pkill` in the trex image — the manager tracks processes via the Rust side;
if you clean up manually, scan `/proc/<pid>/cmdline` and use the `kill` builtin, and
match on `.bin/vite` (a vite worker's cmdline may not contain `--port`).
