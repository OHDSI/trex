---
name: testing-d2e-ui
description: Use when verifying or screenshotting a Data2Evidence (d2e) UI change locally — the default flow is build the app + overwrite the served resources at :41100, then screenshot the real route with Playwright + Logto login. (For the interactive hot-reload preview panel, see d2e-ui-preview instead.)
---

# Testing / screenshotting d2e UI changes

For what the UI monorepo IS (frameworks, module federation, portal context props,
styling), see the `d2e` skill. **Default flow for verifying a change: build the app
and overwrite the served resources, then screenshot the real `:41100` route.** This is
faithful (real config, backend data, login, portal shell, module-federation wiring —
byte-for-byte what ships) and uniform across every app. The only cost is a build per
change. Do NOT reach for a standalone dev server to take screenshots — most d2e apps
render blank/404 on their own; the dev server is only for the interactive preview panel
(`d2e-ui-preview`).

## 0. Build the shared libs once (prerequisite)
`@portal/components` (`libs/portal-components`) and `@portal/plugin`
(`libs/portal-plugin`) ship as build output only. Apps won't compile/start until
they're built. From `plugins/ui`:
```
bunx nx run-many --targets=build --projects=@portal/components,@portal/plugin
```

## 1. Build + overwrite the served resources (the default)
trex serves each app's built assets from
`/usr/src/bundled-plugins/d2e-ui/resources/<app>/` (writable). Each app's production
build outputs to the workspace `plugins/ui/resources/<app>/` (see the app's
`vite.config` `build.outDir`; portal is CRA and needs `PUBLIC_URL=/d2e/portal`).

1. Edit the app source in the workspace (`plugins/ui/apps/<app>`).
2. Build it with **bun** and **`NODE_ENV=production`** (both matter — see below):
   - Vite apps: `cd apps/<app> && NODE_ENV=production bunx vite build`
   - portal (CRA): `PUBLIC_URL=/d2e/portal bunx nx build portal` (react-scripts sets
     production itself; minutes to build)
   Use `bunx vite build` (not `npm run build`) — some apps' `build` script runs
   `vitest` first (e.g. concept-sets: `vitest run && vite build`) and a failing test
   blocks the build.

   **Why `NODE_ENV=production` is mandatory for the micro-frontends.** `@vitejs/plugin-react`
   keys its dev/prod JSX transform on `process.env.NODE_ENV`, NOT on vite's `mode` — so
   `vite build` / `bunx vite build` / even `--mode production` still emit **`jsxDEV`**
   calls unless `NODE_ENV=production` is set (vite's `mode` only drives `isProduction`
   for outDir/minify). The portal host shares its **production** React, which has no
   `jsxDEV`, so a dev-JSX bundle crashes at mount with `TypeError: …jsxDEV is not a
   function` → blank content pane. Verify with `grep -c jsxDEV resources/<app>/lifecycles*.js`
   (must be 0). The d2e CI sets `NODE_ENV=production` globally; ad-hoc builds must set it.
3. **Back up + overwrite** the served dir:
   `cp -r /usr/src/bundled-plugins/d2e-ui/resources/<app>{,.bak}` then copy the fresh
   `plugins/ui/resources/<app>/*` over `/usr/src/bundled-plugins/d2e-ui/resources/<app>/`.
4. Screenshot the served route (§2).
5. **Restore**: move the `.bak` back. Leave the served tree as you found it.

Verify the overwrite took by grepping the served bundle for a unique string from your
change before screenshotting.

**New code, not stale (verified).** trex serves these bundles from
`https://localhost:41100/resources/<app>/…` (portal at `/d2e/portal/`, jobs at
`/d2e/jobs/`) with `Cache-Control: public, max-age=0` + ETag, so browsers revalidate
every load and get the fresh file after an overwrite — confirmed end-to-end that the
overwritten bytes are served (not a stale server cache) for the fixed-name bundles
`wizards`/`analysis-ui`/`notebook-ui` `lifecycles.js` and `concept-mapping/module.js`.
portal/jobs use content-hashed filenames (new build → new names) so they can't go
stale by construction. Use a **fresh Playwright context** (no persistent profile) so
there's no client-side cache either. If you ever DO see old code, hard-reload / clear
the context — don't assume the overwrite failed.

## 2. Screenshot the served route (Playwright + login)
Apps are served under the portal, e.g. portal shell at
`https://localhost:41100/d2e/portal/`, micro-frontends at
`…/d2e/portal/<route>/`. Playwright is at `/usr/src/node_modules`; launch chromium with
`executablePath: "/usr/lib/playwright-browsers/chromium-1217/chrome-linux64/chrome"`,
`args: ["--no-sandbox"]`, context `ignoreHTTPSErrors: true`; run the script from
`/usr/src` so bare `import { chromium } from "playwright"` resolves. Save shots into
`trex/screenshots/` (claw relays them with `postScreenshots`).

The d2e + Logto flow is hardwired to `https://localhost:41100`, which in-container is
the container itself — start a TCP proxy to caddy first (TLS passes through,
SNI=`localhost`):
```
node -e 'const n=require("net");n.createServer(c=>{const u=n.connect(443,"alp-caddy");c.pipe(u);u.pipe(c);c.on("error",()=>u.destroy());u.on("error",()=>c.destroy())}).listen(41100,"127.0.0.1")' &
```
Then `goto` the route → it redirects to the Logto sign-in → fill the username + password
fields with **`admin` / `Updatepassword12345`** → **Sign in** → back on the route
authenticated (a `logout` control appears). Verified end-to-end (Atlas login; wizards
build→overwrite→served-bundle-replaced).

**Reaching the changed view.** Navigate the way a user does: after login, click
"Demo dataset" to enter the researcher context, THEN go to the app's route. Deep-linking
before a dataset is selected (or with the app's feature flag off) renders blank.

## Per-app render map (where each UI mounts + how to screenshot it)
Verified end-to-end (edit → `NODE_ENV=production bunx vite build` → overwrite →
Playwright, marker rendered): **portal, concept-sets, analysis-ui, notebook-ui,
wizards, jobs, vue-mri-ui-lib, webr-notebook, flow, mapping, concept-mapping** —
i.e. every runnable app (`mri-pa-ui` is a library with no UI).

| app | serves | how to reach for a screenshot | prereq |
|---|---|---|---|
| `portal` | `resources/portal` | `/d2e/portal/` (renders directly after login) | build with `PUBLIC_URL=/d2e/portal` |
| `concept-sets` | `resources/concept-sets` | login → Demo dataset → `/d2e/portal/researcher/concepts` | `conceptSets` flag (on) |
| `analysis-ui` | `resources/analysis-ui` | → `/d2e/portal/researcher/analysis` | `strategus` flag (on) |
| `webr-notebook` = **Notebooks** | `resources/notebook` | → `/d2e/portal/researcher/notebook` | `notebook` flag (on) |
| `notebook-ui` | `resources/notebook-ui` | → `/d2e/portal/researcher/starboard` | **`starboard` flag (enable, off by default)** |
| `wizards` | `resources/wizards` | → `/d2e/portal/researcher/wizards` | **`wizards` flag (enable, off by default)** |
| `jobs` | `resources/jobs` | `/d2e/portal/systemadmin/jobs/runs` (Prefect UI, real job runs) | — |
| `vue-mri-ui-lib` = **Cohorts** | `resources/mri` | Demo dataset → `/d2e/portal/researcher/cohort` | — |
| `flow` = the **ETL dataflow editor** | `resources/flow` | `/d2e/portal/systemadmin/etl` → open a dataflow (toolbar `Add node`/`Create subflow` are flow strings) | — |
| `mapping` | `resources/mapping` (`module.js`) | ETL → dataflow → Show experimental → **Rabbit in a Hat** → `.node__setting` | — |
| `concept-mapping` | `resources/concept-mapping` (`module.js`) | same, pick **Concept mapping**; select "Demo dataset" first | a dataset must exist |
| `mri-pa-ui` | — | a library, no runnable UI | — |

Notes:
- **`webr-notebook` builds to `resources/notebook`** and IS the **Notebooks** tab
  (`/researcher/notebook`). `notebook-ui` (`resources/notebook-ui`) is a DIFFERENT app,
  the `starboard` route.
- `vue-mri-ui-lib` is **Cohorts** (NOT Atlas — Atlas is a separate `/atlas` plugin);
  builds to `resources/mri`, edit strings in `src/lib/i18n.ts`.
- **`mapping` / `concept-mapping`** — verified end-to-end; **no data scan is required**.
  Both mount inside the flow editor's node drawer. Path: `/systemadmin/etl` → create a
  dataflow → the "Select node type" dialog opens → tick **Show experimental** → pick the
  node → click `.node__setting` on the node to open its drawer. Confirm the remote
  actually mounted by watching for a `…/module.js` response.
  - **`mapping` → use the "Rabbit in a Hat" node** (NOT White Rabbit). `rabbit_in_a_hat`
    maps to `DataMappingNode`, whose `DataMappingDrawer` renders
    `<PluginRenderer path="/mapping/module.js">` **directly**. With nothing connected
    upstream it falls through to the remote's own `TableSourceNode`, which renders
    "Please scan data or open mapping to see Source tables" + SCAN DATA / OPEN MAPPING
    (and the CDM-version panel). Edit target: `mapping/src/Nodes/TableSourceNode.tsx`.
    **"White Rabbit" is a trap** — its "Configure White Rabbit" drawer and Scan Data
    wizard are flow's OWN bundled components (`flow/src/components/Dialog/ScanDataDialog`);
    flow ships a duplicate, so editing `apps/mapping` never changes them.
  - **`concept-mapping` → the "Concept mapping" node.** Its drawer renders the remote
    (dataset selector, Save to database, MAPPING / SAVED MAPPINGS tabs, CSV dropzone).
    It needs a **dataset to exist**: `Overview.tsx` early-returns `null` when
    `!selectedDatasetId`, so click "Demo dataset" once before navigating. Edit target:
    `concept-mapping/src/Context/state/translation-state.ts` (capital `Context`).
    Two independent blank-render traps to distinguish from a mount failure: no dataset,
    and empty `pluginMetadata` (logs "Plugin metadata is empty" and returns null).

## Enabling a feature flag (for `starboard` / `wizards` / etc.)
Flags live in Postgres `portal.feature` (`feature`, `is_enabled`, plus NOT-NULL
`created_by`/`modified_by`); an ABSENT flag = off. There's no `psql` in the image —
use deno + `npm:pg` with the superuser (`PG_SUPER_USER`/`PG_SUPER_PASSWORD`, db
`PG__DB_NAME` on `PG__HOST`):
```ts
await c.query(`insert into portal.feature (feature, is_enabled, created_by, modified_by)
  values ($1, true, 'devx', 'devx') on conflict (feature) do update set is_enabled=true`, [flag]);
```
(or `POST /d2e/system-portal/feature` with an admin session). Delete the row again to
restore the instance when done. A flag change takes effect on the next portal load.

## Other
- Unit tests: `npm run test:unit` (vitest) in the app dir — no server/login needed.
- No `ps`/`pkill` in the trex image: scan `/proc/<pid>/cmdline` + `kill` builtin; match
  a vite worker on `.bin/vite` (its cmdline may lack `--port`).
- Interactive hot-reload preview panel (not for screenshots): see **`d2e-ui-preview`**.
