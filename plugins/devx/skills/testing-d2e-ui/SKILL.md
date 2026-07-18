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
2. Build it: `cd apps/<app> && npm run build` (vite, ~1–3 s for small apps) or
   `PUBLIC_URL=/d2e/portal npx nx build portal` (CRA, minutes).
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

**Reaching the changed view.** Navigate the way a user does. After login, select the
dataset (e.g. click "Demo dataset"); the embedded apps mount at portal routes —
`/d2e/portal/researcher/concepts` (concept-sets), `…/researcher/notebook`
(notebook-ui), `…/researcher/analysis` (analysis-ui), etc. Deep-linking a
feature-flagged micro-frontend (e.g. `…/portal/wizards/`) may render blank because
single-spa hasn't mounted it and/or no dataset is selected.

**Verified reliably only for `portal`.** The self-contained CRA shell rebuilds and
renders the edit end-to-end (confirmed: a banner change showed on the authenticated
portal with live data). The **portal-embedded micro-frontends are NOT reliable via a
bare `vite build` + overwrite**: even when the build succeeds and the served file set
matches the original, the freshly-built bundle may fail to mount in the portal (blank
content pane) — likely because the real d2e build configures module-federation shared
singletons / base / API that a plain `vite build` doesn't reproduce. So for a
micro-frontend, build it with its real production build (the `nx build <app>` d2e uses,
with the right env), not an ad-hoc `vite build`, and verify it mounts before trusting
the screenshot. Also note some apps' `npm run build` runs `vitest` first (e.g.
concept-sets: `vitest run && vite build`) — a failing test blocks the build.

## Other
- Unit tests: `npm run test:unit` (vitest) in the app dir — no server/login needed.
- No `ps`/`pkill` in the trex image: scan `/proc/<pid>/cmdline` + `kill` builtin; match
  a vite worker on `.bin/vite` (its cmdline may lack `--port`).
- Interactive hot-reload preview panel (not for screenshots): see **`d2e-ui-preview`**.
