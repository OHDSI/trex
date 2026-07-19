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

`devCommand` is **`bun run start`** for most apps (d2e-ui is a bun workspace — always
use bun): it runs the app's own `start` script, so there's no coupling to nx project
names. Install runs once at the monorepo root (`bun install`). Two apps have **no
`start` script** and need their own command:
- `vue-mri-ui-lib` → **`bun run serve`**
- `webr-notebook` → **`bun x vite`** — note `bun x`, NOT `bunx`: the process manager's
  allowlist (`devx-ext/src/validation.rs`) only permits a `bun` first word, so a bare
  `bunx …` is rejected and the server never starts.

**How to drive it manually**: mint a trex token (`signAccessToken`, subject = the devx
user), then `POST /plugins/trex/devx-api/apps/<id>/server/start`, poll
`…/server/status` until `"running"`, and `GET …/proxy/`. Send a browser-like
`Accept: text/html` — see the portal note under Troubleshooting.

**Measured state (after the fixes below): 11/11 servers start, 9/11 previews render.**

| app | preview |
|---|---|
| `concept-sets` `notebook-ui` `analysis-ui` `wizards` `jobs` `mapping` `webr-notebook` `vue-mri-ui-lib` `portal` | **200 + app shell** |
| `flow` | **404 — expected, not a bug** (see below) |
| `concept-mapping` | intermittent 502 (TLS class that self-resolves on a clean worker) |

**`flow` has no standalone dev entry, by design.** Its only html is a stub
`src/index.html` with no `<script>`, `public/` sits at the app root, and
`src/lifecycles.tsx` exports only `{bootstrap, mount, unmount}` rendering
`<FlowApp isStandalone={false}/>`. It is built as a SystemJS library
(`lifecycles.js`), so vite genuinely has no document to serve at the base — the 404 is
accurate. Preview flow through the portal via `testing-d2e-ui` instead. Making the dev
preview work would mean *adding* an entry (`index.html` + a `main.tsx` mounting
`isStandalone={true}`) plus supplying portal props — a product change, not a config fix.

## Prerequisites (or the preview won't render)
1. **Build the shared libs first**: `@portal/components` + `@portal/plugin` ship as
   build output only. From `plugins/ui`:
   `bunx nx run-many --targets=build --projects=@portal/components,@portal/plugin`.
   Without them portal won't compile and `mapping`/`concept-mapping` vite won't start.
2. **A sub-app must be selected** — a d2e app has many; the manager refuses to run
   without an active sub-app (the repo-root script would boot the whole platform).
3. **A served preview is not a fully working app.** The proxy returning 200 + the app
   shell means the dev server is reachable; the micro-frontends still need portal
   context (token/datasetId/apiBase) for real content, so expect blank panes or
   data errors inside an otherwise-loading page. Each app's own vite `server.proxy`
   forwards its backend paths to the served instance, but that's per-app and partial.

## Troubleshooting (each of these was a real bug — check them in this order)
- **Preview 502 on every sub-app except the first one you opened.** The proxy caches its
  HTTPS client; it must be keyed per sub-app (`appId + devCwd`), because every vite dev
  server mints its own basic-ssl cert. Keyed by `appId` alone, the first sub-app's CA
  poisons all the others and TLS validation fails. (Fixed in `index.ts`.)
- **Server reports `stopped` immediately, or binds the wrong port.** The manager appends
  `-- --port … --base …`. The `--` is only correct for a *script runner*
  (`bun run start -- …`); for a direct binary (`bun x vite`) it is passed through, vite
  ignores the trailing flags and silently binds its **config default port**, so the
  allocated port never comes up. (Fixed in `dev_server.ts` via an `isDirectBinary` check.)
- **Server never starts at all.** The app probably has no `start` script — check
  `package.json` before assuming the recipe is right.
- **portal preview 401s.** CRA's `package.json` has `"proxy": "https://localhost:41100"`,
  so it forwards anything that isn't an HTML navigation back to trex, which answers 401.
  It serves `index.html` only for `Accept: text/html` — a real iframe sends that, but a
  bare `curl`/`fetch` with `*/*` will look broken when it isn't.
- **portal loads but pulls assets from the baked app.** `portStyle:"cra"` gets no
  `--base` (react-scripts ignores it), so it emits its `homepage` base
  (`<base href="/d2e/portal">`). devx writes `PUBLIC_URL=<proxyBase>` into `.env.local`
  (CRA's equivalent of vite's `--base`) to fix this.
- **An app 401s even with `Accept: text/html`.** Its dev server likely has a catch-all
  proxy whose bypass doesn't know about the injected base. `vue-mri-ui-lib` had exactly
  this (`proxy: {'/': …}` bypassing only `/`, `/index.html`, `/@*`, `/src/*`); the fix
  was in the app's own vite config — pass through anything matching
  `^/plugins/[^/]+/devx-api/apps/[^/]+/proxy(/|$)`.

## Editing the recipes
When apps are added/renamed or a framework changes, update `UI_RECIPES`. The recipes
drift from reality (they once said `flow`/`analysis` were webpack — they're Vite now,
and `jobs` pointed at a non-existent `nx dev` target). Keep keys equal to the **app dir
name** under `apps/`, `portStyle: "cra"` only for portal, `"vite"` for the rest, and
`devCommand: "bun run start"` — except apps with no `start` script (`vue-mri-ui-lib`
→ `bun run serve`, `webr-notebook` → `bun x vite`). Note the run spec is captured into each app's
`config.d2e.subApps[].run` at **detection** time, so a recipes.ts change only reaches
existing apps on re-detection (or a direct `devx.apps` config update). Verify a change
by running, in the app dir,
`bun run start -- --port <p> --base /plugins/trex/devx-api/apps/x/proxy/` (vite) or
`PORT=<p> bun run start` (portal) and confirming it binds and serves the base path.

## Container notes
No `ps`/`pkill` in the trex image — the manager tracks processes via the Rust side;
if you clean up manually, scan `/proc/<pid>/cmdline` and use the `kill` builtin, and
match on `.bin/vite` (a vite worker's cmdline may not contain `--port`).
