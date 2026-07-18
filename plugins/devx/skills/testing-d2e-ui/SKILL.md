---
name: testing-d2e-ui
description: Use when running or testing a Data2Evidence (d2e) UI app locally — building the shared libs first, the per-app dev-server command and base path, Logto login, and Playwright screenshots of changed views (including the in-container login shim), plus vitest unit tests.
---

# Testing d2e UIs locally

For what the UI monorepo IS (frameworks, module federation, portal context props,
styling), see the `d2e` skill. This covers how to **run** a UI app and
**screenshot** your changes against a full local d2e stack. All steps below are
verified in-container against the live stack.

## 0. Build the shared libs FIRST (the #1 gotcha)
The apps import two workspace libs — `@portal/components` (`libs/portal-components`)
and `@portal/plugin` (`libs/portal-plugin`) — that ship **only as build output**
(`dist/`). If they're not built, dependent apps fail hard: `portal` (CRA) won't
compile (`Can't resolve '@portal/components'`), `mapping`/`concept-mapping` vite
won't even start (`Failed to resolve entry for package "@portal/plugin"`), and
`concept-sets`/`analysis-ui`/`notebook-ui` show the vite HMR overlay
`Failed to resolve @portal/components`. Build them once from `plugins/ui`:
```
bunx nx run-many --targets=build --projects=@portal/components,@portal/plugin
```
Root deps are usually already installed (`plugins/ui/node_modules`); if not, `yarn`
once at the repo root (needs `GITHUB_TOKEN` for `@portal/*`).

## 1. Per-app dev server
Run from `plugins/ui/apps/<app>`; the `start` script is authoritative. Most apps are
Vite (default 5173 — pass `--port <n>` so several don't collide); `portal` is CRA.
**Each app serves under its own base path** (e.g. `jobs` at `/jobs/`) — don't assume
`/`; read the exact `Local:` URL the dev server prints and use that.

| app | command | standalone render (tested) |
|---|---|---|
| `vue-mri-ui-lib` | `npx vite --port 8081 --host 0.0.0.0` | ✅ renders (Atlas), login works |
| `wizards` | `npx vite --port <n>` | ✅ renders fully (no backend needed for landing) |
| `analysis-ui` `concept-sets` `notebook-ui` | `npx vite --port <n>` | ⚠️ compiles + serves, but **blank / 404 / data errors** standalone — has a "Standalone Development" harness yet still needs portal context (token/datasetId/apiBase) + backend |
| `mapping` `concept-mapping` | `npx vite --port <n>` | ⚠️ start only after the libs are built; render needs portal context |
| `jobs` | `npx vite --port 5173` | ⚠️ renders a mock shell but routes to a portal path → 404; needs `portal` |
| `flow` | `npx vite --port <n>` | ⚠️ module-fed remote — root 404 standalone; needs `portal` |
| `portal` | `npm start` (react-scripts, :4000) | ⚠️ compiles + serves but **blank** — needs trex-injected runtime config; screenshot portal-hosted views via the **served** portal, not a bare dev server |
| `mri-pa-ui` | (no dev server) | library, not a runnable app |
| `webr-notebook` | `build` + `bun preview` | preview of a build, not a live dev server |

**Bottom line:** only `vue-mri-ui-lib` and `wizards` render meaningfully as bare dev
servers. The portal-embedded apps compile and serve once the libs are built, but for
a faithful view of a change you either provide the portal context they read or view
the change through the **served** portal at `https://localhost:41100/d2e/portal`
(through the proxy in §3), whose backend + config are live.

Point `apiBase` / `VITE_D2E_API_BASE` (app `.env`) at the local backend —
in-container `http://localhost:33001`.

## 2. Auth / OIDC
Vite apps read `VITE_CLIENT_ID`; it must be the local Logto app client (`alp-app` =
`LOGTO__ALP_APP__CLIENT_ID`, e.g. `xfkpim00zdhwmo26kla1q`) — if empty, Logto rejects
login with `invalid_client`. (`portal` is CRA and uses `REACT_APP_*` runtime config
instead, injected by trex when served — hence blank as a bare dev server.) The
dev-server origin (e.g. `https://localhost:8081`) must be a registered redirect URI
on that client; register missing dev ports via the Logto management API (M2M creds
`LOGTO_API_M2M_*`, token from `alp-logto:3001/oidc/token`, then
`PATCH alp-logto:3001/api/applications/<id>` merging into
`oidcClientMetadata.redirectUris`). Local login: **`admin` / `Updatepassword12345`**.

## 3. Screenshot the changed view with Playwright (works in-container)
Playwright is at `/usr/src/node_modules`; launch chromium with
`executablePath: "/usr/lib/playwright-browsers/chromium-1217/chrome-linux64/chrome"`,
`args: ["--no-sandbox"]`, context `ignoreHTTPSErrors: true`. Run the script from
`/usr/src` so bare `import { chromium } from "playwright"` resolves. Navigate to the
**served `Local:` URL** (base path included) for the view you changed, then screenshot
into `trex/screenshots/` (claw relays them with `postScreenshots`).

- **No-auth views** render directly against `https://localhost:<devport>/<base>/`.
- **Authenticated / data views need one shim.** The d2e + Logto flow is hardwired to
  `https://localhost:41100`, which in-container is the container itself. Start a TCP
  proxy that forwards it to caddy (TLS passes through, SNI=`localhost` so caddy
  serves it):
  ```
  node -e 'const n=require("net");n.createServer(c=>{const u=n.connect(443,"alp-caddy");c.pipe(u);u.pipe(c);c.on("error",()=>u.destroy());u.on("error",()=>c.destroy())}).listen(41100,"127.0.0.1")' &
  ```
  Then `goto` the app → it redirects to the Logto sign-in → fill the username +
  password fields with **`admin` / `Updatepassword12345`** → click **Sign in** → it
  lands back on the app authenticated (a `logout` control appears). No
  client-credentials or session injection needed. **Verified** end-to-end against
  `vue-mri-ui-lib` on `:8081` (Atlas loaded, authenticated).

## Container notes / gotchas
- No `ps`/`pkill`/`pgrep` in the trex image — find PIDs by scanning `/proc/<pid>/cmdline`
  and use the `kill` builtin. Note a vite server's real worker is `node .../.bin/vite`
  (the port may not appear in its cmdline), so match on `.bin/vite`, not `--port <n>`,
  or you leak servers that keep holding the port.
- Several apps' vite serve **http** (not https) — take the scheme from the printed URL.

## Unit tests
`npm run test:unit` (vitest) in the app dir — no server/login needed. Iterate logic
there; use the dev server + screenshot only for the real visual/integration check.
