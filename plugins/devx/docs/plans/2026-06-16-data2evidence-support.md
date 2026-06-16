# DevX Data2Evidence Support — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class "Data2Evidence" app type to devx that clones a d2e repo, auto-detects its runnable sub-apps (UIs, functions, flows), lets the user select and run one sub-app's dev server with live preview, and gives the agent deep d2e-specific context (a d2e skill + a per-sub-app `TREX.md` + d2e-docs knowledge base).

**Architecture:** Reuse the existing `POST /apps {git_url}` git-clone path, tagging the app `kind:"d2e"`. After clone, a **detection module** parses the monorepo into a *sub-app registry* stored in `devx.apps.config` (JSONB — no schema migration). A **run-spec resolver** maps each detected sub-app to a concrete `{cwd, installCommand, devCommand, port, portStyle}`. The **dev server manager** is extended to run an arbitrary sub-dir + command (today it only runs the workspace root with one command). The frontend gains a "Data2Evidence" create option and a sub-app selector. Context is delivered via a new `plugins/devx/skills/d2e` skill plus a generated `TREX.md`. Because devx runs **one subprocess per app inside the trex container** (no Docker access), v1 runs a single selected sub-app's standalone dev server and proxies backend calls to an **externally-running d2e stack**.

**Tech Stack:** Deno edge functions (`@ts-nocheck`), the Rust `devx_ext` process manager (`trex_devx_process_start/_run_command/_process_status/_process_output` via `duckdb()`), React SPA (`plugins/devx/src`), Postgres-backed `devx.*` schema, `Dockerfile.dx` for image deps.

**Verification model (read first):** This codebase has **no JS unit-test harness** for the devx edge functions (no `test` script, no vitest/jest, no `*.test.ts`). Do **not** invent one. Verify every task with the **integration recipe** proven in memory [[trex-dx-api-smoke-test-recipe]]: bring up the dx stack, `docker cp` changed files into `trex-dx-trex-1:/usr/src/plugins-dev/devx/`, `chown -R node:node`, `docker restart trex-dx-trex-1`, mint a **UUID-sub** HS256 JWT (`AUTH_JWT_SECRET` from `secrets/derived.env`), and `curl` `http://localhost:9001/plugins/trex/devx-api/...`. Pure logic helpers (detection, run-spec resolver) additionally get a **standalone Deno smoke script** run in the container (`docker exec -u node ... deno run --allow-read /tmp/x.ts`) as shown per task.

---

## Glossary of the moving parts (so a task can be read out of order)

- **Sub-app**: one runnable unit inside a cloned d2e repo. Three `type`s: `ui`, `function`, `flow`.
- **Sub-app registry**: `config.d2e.subApps: SubApp[]` stored on the app row. Built by detection.
- **Run spec**: the concrete commands/dir/port for a sub-app — `SubApp.run`.
- **Active sub-app**: `config.d2e.activeSubApp` — the `key` the dev server runs and that `TREX.md` describes.
- **External d2e API**: `config.d2e.externalApiBase` — a URL (e.g. `https://localhost:41100`) of a separately-running d2e stack that UI/function backends call. Optional; preview still loads without it, backend calls just fail until set.

### The `config.d2e` shape (the contract every task depends on)

```ts
// plugins/devx/functions/d2e/types.ts
export type SubAppType = "ui" | "function" | "flow";
export type PortStyle = "vite" | "webpack" | "cra" | "nx" | "deno" | "none";

export interface SubAppRun {
  installCwd: string;      // workspace-relative dir to run install in (monorepo root for Nx)
  installCommand: string;  // e.g. "yarn install" | "npm install" | "deno cache index.ts"
  devCwd: string;          // workspace-relative dir to run the dev server in
  devCommand: string;      // e.g. "npx nx start portal" | "npm run dev"
  port: number | null;     // conventional/preferred port (informational; runtime port is allocated)
  portStyle: PortStyle;    // how to inject the allocated --port/--base
  needsGithubToken?: boolean;
  env?: Record<string, string>;
}

export interface SubApp {
  key: string;             // stable id: "ui:flow" | "fn:alpdb" | "flow:data_load_plugin"
  type: SubAppType;
  name: string;            // display name
  dir: string;             // workspace-relative path to the sub-app
  framework: string;       // "react-cra" | "react-webpack" | "vue-vite" | "react-vite" | "deno-express" | "prefect"
  run: SubAppRun;
  notes?: string;          // surfaced to the UI (e.g. "module-federation remote; run portal too")
}

export interface D2EConfig {
  repo: string;            // git url cloned
  repoKind: "ui" | "functions" | "flows" | "platform" | "unknown";
  detectedAt: string;      // ISO
  subApps: SubApp[];
  activeSubApp?: string;   // key
  externalApiBase?: string;
}
```

`config` is already `JSONB DEFAULT '{}'` on `devx.apps` (`migrations/V1__initial_schema.sql:75-91`) and `config` is one of the few PATCH-able fields (`functions/index.ts` app PATCH handler), so **no migration is required**.

---

## File Structure

**New files:**
- `plugins/devx/functions/d2e/types.ts` — the interfaces above (single source of truth).
- `plugins/devx/functions/d2e/detect.ts` — `detectD2E(wsPath, repoUrl): Promise<D2EConfig>`; parses a cloned repo into a registry.
- `plugins/devx/functions/d2e/recipes.ts` — static run-recipe table for known d2e UIs + generic resolvers per framework.
- `plugins/devx/functions/d2e/trex_md.ts` — `renderD2ETrexMd(cfg, subApp): string`; builds the per-sub-app `TREX.md`.
- `plugins/devx/functions/routes/d2e_routes.ts` — `handleD2ERoutes(...)`: `GET /apps/:id/d2e`, `POST /apps/:id/d2e/select`, `POST /apps/:id/d2e/redetect`, `PATCH /apps/:id/d2e/external-api`.
- `plugins/devx/skills/d2e/SKILL.md` — the d2e architecture/conventions skill.
- `plugins/devx/src/components/d2e/D2ESubAppPanel.tsx` — sub-app selector + run/stop UI.

**Modified files:**
- `plugins/devx/functions/index.ts` — `POST /apps` d2e branch (clone → detect → store); wire `handleD2ERoutes`; make `server/start` resolve the active sub-app run spec.
- `plugins/devx/functions/dev_server.ts` — extend `start()` with a `RunOverride` opt (cwd / installCwd / portStyle / env) and add `python`/`python3`/`uv`/`prefect` to the allowlist.
- `plugins/devx/src/lib/api.ts` + `src/lib/types.ts` — `createApp` `kind` param, `D2EConfig` type, d2e API calls.
- `plugins/devx/src/components/AppCreateDialog.tsx` — "Data2Evidence" create mode.
- `Dockerfile.dx` — enable `yarn` (corepack) and add Python+Prefect+uv for flows; bundle `d2e-docs` as a KB source.

---

## Phase 0 — Plumbing: types, detection, registry, create option, selector (no run yet)

Phase 0 is a complete, demoable increment: you can create a Data2Evidence app, it clones and detects sub-apps, and the UI lists them. Nothing runs yet.

### Task 0.1: Define the d2e config types

**Files:**
- Create: `plugins/devx/functions/d2e/types.ts`

- [ ] **Step 1: Write `types.ts`** with the exact `SubAppType`, `PortStyle`, `SubAppRun`, `SubApp`, `D2EConfig` interfaces from the "config.d2e shape" section above. Prefix the file with `// @ts-nocheck - Deno edge function`.

- [ ] **Step 2: Verify it imports cleanly** in the container Deno:

```bash
docker exec -u node trex-dx-trex-1 sh -c 'echo "import * as t from \"/usr/src/plugins-dev/devx/functions/d2e/types.ts\"; console.log(typeof t)" > /tmp/t.ts'
docker cp plugins/devx/functions/d2e/types.ts trex-dx-trex-1:/usr/src/plugins-dev/devx/functions/d2e/types.ts
docker exec -u node trex-dx-trex-1 /usr/local/bin/deno run --allow-read /tmp/t.ts
```
Expected: prints `object` with no import error.

- [ ] **Step 3: Commit**

```bash
git add plugins/devx/functions/d2e/types.ts
git commit -m "feat(devx/d2e): add d2e config/sub-app types"
```

### Task 0.2: Run-recipe table for known d2e sub-apps

**Files:**
- Create: `plugins/devx/functions/d2e/recipes.ts`

The detector needs to translate a discovered directory into a `SubAppRun`. d2e-ui is an Nx + yarn-workspaces monorepo; install happens once at the repo root, dev runs per app. Ports/frameworks are known (from investigation):

| key | dir | framework | dev command | port | portStyle | needs token |
|---|---|---|---|---|---|---|
| `ui:portal` | `apps/portal` | react-cra | `npx nx start portal` | 4000 | nx | yes |
| `ui:flow` | `apps/flow` | react-webpack | `npm start` | 4900 | webpack | yes |
| `ui:analysis` | `apps/analysis` | react-webpack | `npm start` | 4800 | webpack | yes |
| `ui:jobs` | `apps/jobs` | vue-vite | `npx nx dev jobs` | 5173 | vite | yes |
| `ui:mapping` | `apps/mapping` | react-vite | `npm start` | 5173 | vite | yes |
| `ui:vue-mri` | `apps/vue-mri-ui-lib` | vue-cli | `npx nx serve vue-mri` | 8081 | nx | yes |

- [ ] **Step 1: Write the recipe table + helpers**

```ts
// @ts-nocheck - Deno edge function
import type { SubAppRun, PortStyle } from "./types.ts";

/** Known per-sub-app run recipes for the d2e-ui monorepo. Keyed by app dir name
 * under apps/. install runs ONCE at the monorepo root (Nx + yarn workspaces). */
export const UI_RECIPES: Record<string, { name: string; framework: string; devCommand: string; port: number; portStyle: PortStyle; notes?: string }> = {
  portal:          { name: "Portal (shell)",        framework: "react-cra",     devCommand: "npx nx start portal",   port: 4000, portStyle: "nx" },
  flow:            { name: "Flow (dataflow)",        framework: "react-webpack", devCommand: "npm start",             port: 4900, portStyle: "webpack", notes: "module-federation remote; usually loaded inside Portal" },
  analysis:        { name: "Analysis (Strategus)",   framework: "react-webpack", devCommand: "npm start",             port: 4800, portStyle: "webpack", notes: "module-federation remote; usually loaded inside Portal" },
  jobs:            { name: "Jobs (Prefect UI)",      framework: "vue-vite",      devCommand: "npx nx dev jobs",       port: 5173, portStyle: "vite" },
  mapping:         { name: "Mapping",                framework: "react-vite",    devCommand: "npm start",             port: 5173, portStyle: "vite", notes: "module-federation remote; usually loaded inside Portal" },
  "vue-mri-ui-lib":{ name: "Patient Analytics (MRI)",framework: "vue-cli",       devCommand: "npx nx serve vue-mri",  port: 8081, portStyle: "nx" },
};

/** Build a UI sub-app run spec. installCwd is the monorepo root (uiRoot). */
export function uiRun(uiRoot: string, appDirName: string): SubAppRun {
  const r = UI_RECIPES[appDirName];
  return {
    installCwd: uiRoot,
    installCommand: "yarn install",
    devCwd: `${uiRoot}/apps/${appDirName}`,
    devCommand: r?.devCommand ?? "npm start",
    port: r?.port ?? null,
    portStyle: r?.portStyle ?? "vite",
    needsGithubToken: true,
  };
}

/** A d2e edge function (Deno/Express). Runs standalone via deno; talks to an
 * external d2e DB/API through env. */
export function functionRun(fnDir: string): SubAppRun {
  return {
    installCwd: fnDir,
    installCommand: "deno cache index.ts",
    devCwd: fnDir,
    devCommand: "deno run --allow-all index.ts",
    port: 8000,
    portStyle: "deno",
  };
}

/** A Prefect flow. v1: validate/test via the test harness; no long-running server. */
export function flowRun(flowDir: string, entrypoint: string): SubAppRun {
  return {
    installCwd: flowDir,
    installCommand: "echo 'flows: deps are baked into the d2e flow image; see SKILL'",
    devCwd: flowDir,
    devCommand: `echo 'run: prefect flow-run execute / prefect_test_harness for ${entrypoint}'`,
    port: null,
    portStyle: "none",
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/devx/functions/d2e/recipes.ts
git commit -m "feat(devx/d2e): run-recipe table for d2e ui/function/flow sub-apps"
```

### Task 0.3: Detection module

**Files:**
- Create: `plugins/devx/functions/d2e/detect.ts`

Detection reads the cloned tree and classifies it. Rules (derived from investigation):
- **UI repo**: a dir containing `apps/` whose children have `package.json` AND a root `nx.json` (or root `package.json` with `workspaces` including `apps/*`). Each `apps/<x>` with a `package.json` → a `ui` sub-app via `uiRun`. The monorepo root is the dir holding `nx.json`. d2e-ui may be at the workspace root (cloned d2e-ui) or under `ui/` (a `d2e` clone's submodule — empty unless inited; skip if empty).
- **Functions repo / d2e platform**: a dir `plugins/functions/` whose children (excluding `_shared`) have an `index.ts` or `src/main.ts` → each is a `function` sub-app via `functionRun`. Also `functions/` (legacy) the same way.
- **Flows repo**: a dir `flows/` containing `**/package.json` with a `.trex.flow` key. Each entry in `trex.flow.flows[]` → a `flow` sub-app via `flowRun(dir, entry.entrypoint)`.
- `repoKind`: `ui` if any ui found and no functions/flows; `functions` if functions only; `flows` if flows only; `platform` if more than one type (e.g. a full `d2e` clone); else `unknown`.

- [ ] **Step 1: Write `detect.ts`**

```ts
// @ts-nocheck - Deno edge function
import type { D2EConfig, SubApp } from "./types.ts";
import { UI_RECIPES, uiRun, functionRun, flowRun } from "./recipes.ts";

async function exists(p: string): Promise<boolean> {
  try { await Deno.stat(p); return true; } catch { return false; }
}
async function isDir(p: string): Promise<boolean> {
  try { return (await Deno.stat(p)).isDirectory; } catch { return false; }
}
async function readJson(p: string): Promise<any | null> {
  try { return JSON.parse(await Deno.readTextFile(p)); } catch { return null; }
}

/** Find an Nx/yarn-workspaces UI monorepo root at or below wsPath (depth<=1). */
async function findUiRoot(wsPath: string): Promise<string | null> {
  const candidates = [wsPath, `${wsPath}/ui`, `${wsPath}/d2e-ui`];
  for (const c of candidates) {
    if (await exists(`${c}/nx.json`) && await isDir(`${c}/apps`)) return c;
    const pkg = await readJson(`${c}/package.json`);
    const ws = pkg?.workspaces?.packages ?? pkg?.workspaces;
    if (Array.isArray(ws) && ws.some((w) => String(w).startsWith("apps")) && await isDir(`${c}/apps`)) return c;
  }
  return null;
}

async function detectUi(wsPath: string, subApps: SubApp[]): Promise<boolean> {
  const uiRoot = await findUiRoot(wsPath);
  if (!uiRoot) return false;
  let found = false;
  for await (const e of Deno.readDir(`${uiRoot}/apps`)) {
    if (!e.isDirectory) continue;
    if (!await exists(`${uiRoot}/apps/${e.name}/package.json`)) continue;
    const r = UI_RECIPES[e.name];
    const rel = uiRoot.replace(wsPath + "/", "").replace(wsPath, "") || ".";
    subApps.push({
      key: `ui:${e.name}`,
      type: "ui",
      name: r?.name ?? e.name,
      dir: `${rel === "." ? "" : rel + "/"}apps/${e.name}`,
      framework: r?.framework ?? "unknown",
      run: uiRun(uiRoot.replace(wsPath, "").replace(/^\//, "") || ".", e.name),
      notes: r?.notes,
    });
    found = true;
  }
  return found;
}

async function detectFunctions(wsPath: string, subApps: SubApp[]): Promise<boolean> {
  let found = false;
  for (const base of ["plugins/functions", "functions"]) {
    const dir = `${wsPath}/${base}`;
    if (!await isDir(dir)) continue;
    for await (const e of Deno.readDir(dir)) {
      if (!e.isDirectory || e.name.startsWith("_")) continue;
      const fnDir = `${dir}/${e.name}`;
      if (!(await exists(`${fnDir}/index.ts`)) && !(await exists(`${fnDir}/src/main.ts`))) continue;
      subApps.push({
        key: `fn:${e.name}`, type: "function", name: e.name,
        dir: `${base}/${e.name}`, framework: "deno-express",
        run: functionRun(`${base}/${e.name}`),
        notes: "trex edge function; needs an external d2e DB/API (set External API).",
      });
      found = true;
    }
  }
  return found;
}

async function detectFlows(wsPath: string, subApps: SubApp[]): Promise<boolean> {
  const root = `${wsPath}/flows`;
  if (!await isDir(root)) return false;
  let found = false;
  // Walk flows/** for package.json with trex.flow
  const stack = [root];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: Deno.DirEntry[] = [];
    try { for await (const e of Deno.readDir(d)) entries.push(e); } catch { continue; }
    for (const e of entries) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory) { stack.push(p); continue; }
      if (e.name !== "package.json") continue;
      const pkg = await readJson(p);
      const flows = pkg?.trex?.flow?.flows;
      if (!Array.isArray(flows)) continue;
      const rel = d.replace(wsPath + "/", "");
      for (const f of flows) {
        subApps.push({
          key: `flow:${f.name}`, type: "flow", name: f.name,
          dir: rel, framework: "prefect",
          run: flowRun(rel, f.entrypoint ?? f.name),
          notes: "Prefect flow; v1 supports context + local test harness, not a long-running server.",
        });
        found = true;
      }
    }
  }
  return found;
}

export async function detectD2E(wsPath: string, repoUrl: string): Promise<D2EConfig> {
  const subApps: SubApp[] = [];
  const hasUi = await detectUi(wsPath, subApps);
  const hasFn = await detectFunctions(wsPath, subApps);
  const hasFlow = await detectFlows(wsPath, subApps);
  const kinds = [hasUi && "ui", hasFn && "functions", hasFlow && "flows"].filter(Boolean);
  const repoKind = kinds.length > 1 ? "platform" : (kinds[0] as any) ?? "unknown";
  return { repo: repoUrl, repoKind, detectedAt: new Date().toISOString(), subApps };
}
```

- [ ] **Step 2: Standalone smoke test against the real cloned repos.** Clone d2e-ui into the container's workspace area and run the detector:

```bash
docker cp plugins/devx/functions/d2e trex-dx-trex-1:/usr/src/plugins-dev/devx/functions/d2e
docker exec -u node trex-dx-trex-1 sh -c '
  git clone --depth 1 https://github.com/data2evidence/d2e-ui /tmp/det/d2e-ui 2>/dev/null || true
  cat > /tmp/det.ts <<EOF
import { detectD2E } from "/usr/src/plugins-dev/devx/functions/d2e/detect.ts";
const c = await detectD2E("/tmp/det/d2e-ui", "https://github.com/data2evidence/d2e-ui");
console.log(c.repoKind, c.subApps.map(s => s.key));
EOF
  /usr/local/bin/deno run --allow-read /tmp/det.ts'
```
Expected: `ui [ "ui:portal", "ui:flow", "ui:analysis", "ui:jobs", "ui:mapping", ... ]` (order may vary).

- [ ] **Step 3: Commit**

```bash
git add plugins/devx/functions/d2e/detect.ts
git commit -m "feat(devx/d2e): detect ui/function/flow sub-apps in a cloned d2e repo"
```

### Task 0.4: `POST /apps` Data2Evidence branch (clone → detect → store)

**Files:**
- Modify: `plugins/devx/functions/index.ts` (the `POST /apps` handler, around the existing `git_url` branch ~line 1170-1240)

Reuse the existing clone flow. Add: when `body.kind === "d2e"` (and a `git_url` is present), after a successful clone run `detectD2E` and persist `config.d2e`. Set `tech_stack = "d2e"`.

- [ ] **Step 1: Add the import** near the other `./d2e/...`-free imports at the top of `index.ts`:

```ts
import { detectD2E } from "./d2e/detect.ts";
```

- [ ] **Step 2: In the `git_url` branch, after the clone + tech-stack detection succeeds and before `return Response.json(app, ...)`, add:**

```ts
// Data2Evidence: detect runnable sub-apps and persist the registry.
if (body.kind === "d2e") {
  try {
    const d2e = await detectD2E(wsPath, gitUrl);
    const cfg = { ...(app.config || {}), d2e };
    await sql(`UPDATE devx.apps SET config = $1, tech_stack = 'd2e' WHERE id = $2`,
      [JSON.stringify(cfg), app.id]);
    app.config = cfg;
    app.tech_stack = "d2e";
  } catch (e) {
    console.error("[d2e] detection failed:", e);
  }
}
```

- [ ] **Step 3: Integration verify.** Patch in, restart, create a d2e app, confirm registry persisted:

```bash
# (cp functions/ + restart per the recipe, then:)
JWT=$(cat /tmp/dx_jwt.txt)
curl -sS -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"name":"d2e-ui","kind":"d2e","git_url":"https://github.com/data2evidence/d2e-ui"}' \
  http://localhost:9001/plugins/trex/devx-api/apps | python3 -m json.tool | grep -E 'tech_stack|"key"' | head
```
Expected: `"tech_stack": "d2e"` and several `"key": "ui:..."` entries under `config.d2e.subApps`.

- [ ] **Step 4: Commit**

```bash
git add plugins/devx/functions/index.ts
git commit -m "feat(devx/d2e): POST /apps d2e branch clones + detects sub-apps"
```

### Task 0.5: d2e routes — read registry, select active, set external API, redetect

**Files:**
- Create: `plugins/devx/functions/routes/d2e_routes.ts`
- Modify: `plugins/devx/functions/index.ts` (dispatch to `handleD2ERoutes` alongside the other route handlers; find where `handlePlanRoutes`/route handlers are called and add a sibling call early, returning its result if non-null)

- [ ] **Step 1: Write `d2e_routes.ts`**

```ts
// @ts-nocheck - Deno edge function
async function loadCfg(appId, userId, sql) {
  const r = await sql(`SELECT config FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
  if (r.rows.length === 0) return null;
  return r.rows[0].config || {};
}
async function saveCfg(appId, cfg, sql) {
  await sql(`UPDATE devx.apps SET config = $1, updated_at = NOW() WHERE id = $2`, [JSON.stringify(cfg), appId]);
}

export async function handleD2ERoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /apps/:id/d2e
  let m = path.match(/\/apps\/([^/]+)\/d2e$/);
  if (m && method === "GET") {
    const cfg = await loadCfg(m[1], userId, sql);
    if (!cfg) return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    return Response.json(cfg.d2e ?? null, { headers: corsHeaders });
  }
  // POST /apps/:id/d2e/select  { key }
  m = path.match(/\/apps\/([^/]+)\/d2e\/select$/);
  if (m && method === "POST") {
    const { key } = await req.json();
    const cfg = await loadCfg(m[1], userId, sql);
    if (!cfg?.d2e) return Response.json({ error: "Not a d2e app" }, { status: 400, headers: corsHeaders });
    if (!cfg.d2e.subApps.some((s) => s.key === key))
      return Response.json({ error: "Unknown sub-app" }, { status: 400, headers: corsHeaders });
    cfg.d2e.activeSubApp = key;
    await saveCfg(m[1], cfg, sql);
    // TREX.md regeneration is wired in Phase 2 (Task 2.2).
    return Response.json({ ok: true, activeSubApp: key }, { headers: corsHeaders });
  }
  // PATCH /apps/:id/d2e/external-api  { externalApiBase }
  m = path.match(/\/apps\/([^/]+)\/d2e\/external-api$/);
  if (m && method === "PATCH") {
    const { externalApiBase } = await req.json();
    const cfg = await loadCfg(m[1], userId, sql);
    if (!cfg?.d2e) return Response.json({ error: "Not a d2e app" }, { status: 400, headers: corsHeaders });
    cfg.d2e.externalApiBase = externalApiBase || undefined;
    await saveCfg(m[1], cfg, sql);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }
  return null;
}
```
(`/redetect` is added in Task 0.6.)

- [ ] **Step 2: Wire dispatch in `index.ts`.** Near the other route-handler calls (e.g. where `handlePlanRoutes(...)` is invoked), add:

```ts
import { handleD2ERoutes } from "./routes/d2e_routes.ts";
// ... inside the request handler, after auth, alongside other handlers:
const d2eRes = await handleD2ERoutes(path, method, req, userId, sql, corsHeaders);
if (d2eRes) return d2eRes;
```

- [ ] **Step 3: Integration verify**

```bash
JWT=$(cat /tmp/dx_jwt.txt); APP=$(cat /tmp/d2e_appid.txt)
curl -sS -H "Authorization: Bearer $JWT" http://localhost:9001/plugins/trex/devx-api/apps/$APP/d2e | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["repoKind"],len(d["subApps"]))'
curl -sS -XPOST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"key":"ui:jobs"}' http://localhost:9001/plugins/trex/devx-api/apps/$APP/d2e/select
```
Expected: `ui 6` (or similar) then `{"ok":true,"activeSubApp":"ui:jobs"}`.

- [ ] **Step 4: Commit**

```bash
git add plugins/devx/functions/routes/d2e_routes.ts plugins/devx/functions/index.ts
git commit -m "feat(devx/d2e): routes to read registry, select active sub-app, set external API"
```

### Task 0.6: Redetect endpoint

**Files:**
- Modify: `plugins/devx/functions/routes/d2e_routes.ts`

- [ ] **Step 1: Add `POST /apps/:id/d2e/redetect`** (re-runs detection against the workspace; preserves `activeSubApp`/`externalApiBase`). Import `detectD2E` and `getAppWorkspacePath`:

```ts
import { detectD2E } from "../d2e/detect.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";
// ... in handleD2ERoutes:
m = path.match(/\/apps\/([^/]+)\/d2e\/redetect$/);
if (m && method === "POST") {
  const cfg = await loadCfg(m[1], userId, sql);
  if (!cfg?.d2e) return Response.json({ error: "Not a d2e app" }, { status: 400, headers: corsHeaders });
  const wsPath = getAppWorkspacePath(userId, m[1]);
  const fresh = await detectD2E(wsPath, cfg.d2e.repo);
  fresh.activeSubApp = cfg.d2e.activeSubApp;
  fresh.externalApiBase = cfg.d2e.externalApiBase;
  cfg.d2e = fresh;
  await saveCfg(m[1], cfg, sql);
  return Response.json(fresh, { headers: corsHeaders });
}
```

- [ ] **Step 2: Verify** `curl -XPOST .../d2e/redetect` returns the registry. **Commit:**

```bash
git add plugins/devx/functions/routes/d2e_routes.ts
git commit -m "feat(devx/d2e): redetect endpoint"
```

### Task 0.7: Frontend — "Data2Evidence" create option

**Files:**
- Modify: `plugins/devx/src/lib/types.ts` (add `D2EConfig`/`SubApp` mirrors of `functions/d2e/types.ts`)
- Modify: `plugins/devx/src/lib/api.ts` (`createApp` accepts `{ kind?: "d2e" }`; add `getD2E`, `selectD2ESubApp`, `setD2EExternalApi`, `redetectD2E`)
- Modify: `plugins/devx/src/components/AppCreateDialog.tsx`

- [ ] **Step 1: `types.ts`** — add TS mirrors of `SubApp`/`D2EConfig` (copy the shape from `functions/d2e/types.ts`).

- [ ] **Step 2: `api.ts`** — thread `kind` into the existing create call body, and add the d2e calls. The create dialog already supports `gitUrl` (per the git-integration work); extend its body:

```ts
export async function createApp(name: string, opts: { template?: string; gitUrl?: string; kind?: "d2e" } = {}) {
  const res = await fetch(`${API_BASE}/apps`, {
    method: "POST", headers: authHeaders(), credentials: "include",
    body: JSON.stringify({ name, template: opts.template, git_url: opts.gitUrl, kind: opts.kind }),
  });
  if (!res.ok) throw new Error((await res.json()).error || "Failed to create app");
  return res.json();
}
export const getD2E = (appId: string) => apiGet(`/apps/${appId}/d2e`);
export const selectD2ESubApp = (appId: string, key: string) => apiPost(`/apps/${appId}/d2e/select`, { key });
export const setD2EExternalApi = (appId: string, externalApiBase: string) => apiPatch(`/apps/${appId}/d2e/external-api`, { externalApiBase });
export const redetectD2E = (appId: string) => apiPost(`/apps/${appId}/d2e/redetect`, {});
```
(Use whatever `apiGet/apiPost/apiPatch` helpers exist in `api.ts`; if not present, inline `fetch` like `createApp`.)

- [ ] **Step 3: `AppCreateDialog.tsx`** — add a third creation mode `"d2e"` alongside template + import-from-git. The mode shows: a **repo select** with known options (`https://github.com/data2evidence/d2e-ui`, `https://github.com/data2evidence/d2e-flows`, `https://github.com/OHDSI/d2e`) plus a free-text URL field, and a one-line helper ("Clones the repo and detects runnable UIs, functions, and flows."). On submit call `createApp(name, { gitUrl, kind: "d2e" })`.

```tsx
// sketch — adapt to the dialog's existing mode state machine
{mode === "d2e" && (
  <div className="space-y-2">
    <Label>Data2Evidence repository</Label>
    <select value={d2eRepo} onChange={(e) => setD2eRepo(e.target.value)} className="...">
      <option value="https://github.com/data2evidence/d2e-ui">d2e-ui (portal, flow, analysis, jobs, mapping)</option>
      <option value="https://github.com/data2evidence/d2e-flows">d2e-flows (Prefect flows)</option>
      <option value="https://github.com/OHDSI/d2e">d2e (platform: functions + compose)</option>
      <option value="__custom__">Custom URL…</option>
    </select>
    {d2eRepo === "__custom__" && (
      <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://github.com/org/repo" className="..." />
    )}
    <p className="text-xs text-muted-foreground">Clones the repo and detects runnable UIs, functions, and flows.</p>
  </div>
)}
```

- [ ] **Step 4: Build + verify in the running UI.** Rebuild the SPA into the container (the dx image serves `dist/`; for a quick check run `npm run build` in `plugins/devx`, `docker cp dist/. trex-dx-trex-1:/usr/src/plugins-dev/devx/dist/`), open `http://localhost:9001/plugins/trex/devx/`, create a Data2Evidence app, confirm it clones and the app lands with `tech_stack=d2e`.

- [ ] **Step 5: Commit**

```bash
git add plugins/devx/src/lib/types.ts plugins/devx/src/lib/api.ts plugins/devx/src/components/AppCreateDialog.tsx
git commit -m "feat(devx/d2e): Data2Evidence create option in the new-app dialog"
```

### Task 0.8: Frontend — sub-app selector panel

**Files:**
- Create: `plugins/devx/src/components/d2e/D2ESubAppPanel.tsx`
- Modify: wherever the app workspace view renders side panels/tabs (search `src` for where `tech_stack`/app tabs are rendered) to mount `<D2ESubAppPanel app={app} />` when `app.tech_stack === "d2e"`.

- [ ] **Step 1: Write `D2ESubAppPanel.tsx`** — fetch `getD2E(app.id)`, render sub-apps grouped by `type` (UI / Functions / Flows), each row showing `name`, `framework`, `notes`, and a radio to set active (calls `selectD2ESubApp`). Include an **External API** text field (calls `setD2EExternalApi`) and a **Redetect** button. A "Run / Stop" button is added in Phase 1 (Task 1.4) — leave a placeholder disabled button for now.

- [ ] **Step 2: Verify** the panel lists sub-apps and selecting one persists (reload shows the same active). **Commit:**

```bash
git add plugins/devx/src/components/d2e/D2ESubAppPanel.tsx plugins/devx/src/<mounting-file>.tsx
git commit -m "feat(devx/d2e): sub-app selector panel"
```

---

## Phase 1 — Run a UI sub-app's dev server with preview

This phase makes the **UI** sub-apps actually runnable through devx's existing preview pipeline.

### Task 1.1: Extend `dev_server.start()` with a run override

**Files:**
- Modify: `plugins/devx/functions/dev_server.ts:90-180`

Today `start(userId, appId, appPath, devCommand, installCommand)` installs in `appPath`, runs in `appPath`, and injects `-- --port --base` only for `npm run`. d2e needs: install in one dir (`installCwd`), run in another (`devCwd`), inject port per `portStyle`, and pass env (e.g. `GITHUB_TOKEN`, `PORT`).

- [ ] **Step 1: Add an optional `override` param and use it.** Change the signature and the three usages of `appPath`:

```ts
interface RunOverride {
  installCwd?: string;     // absolute
  devCwd?: string;         // absolute
  portStyle?: "vite" | "webpack" | "cra" | "nx" | "deno" | "none";
  nxApp?: string;          // for portStyle "nx": the nx project name
  // No `env`: the Rust process manager has no inline-env; deliver env via files.
}

async start(userId, appId, appPath, devCommand, installCommand, override: RunOverride = {}) {
  validateCommand(devCommand);
  validateCommand(installCommand);
  const installCwd = override.installCwd ?? appPath;
  const devCwd = override.devCwd ?? appPath;
  // ...allocate port, build entry (unchanged)...
  // install:
  await Deno.stat(`${installCwd}/node_modules`).catch(async () => { /* run installCommand in installCwd */ });
  // (replace appPath with installCwd in the install block)
}
```

- [ ] **Step 2: Replace the port/base injection with a `portStyle` switch.** No env prefix — the Rust process manager parses argv0 and has no inline-env, so it would reject `KEY='val' cmd`. It DOES inject `PORT` into the child env, so `cra`/`deno`/`none` need no flags. Custom env (`D2E_API_BASE`, GitHub token) is delivered via files (see Task 1.2):

```ts
const proxyBase = `/plugins/trex/devx-api/apps/${appId}/proxy/`;
const style = override.portStyle ?? "vite";
let finalCommand = devCommand;
if (style === "vite") {
  finalCommand = `${devCommand} -- --port ${port} --base ${proxyBase}`;
} else if (style === "nx") {
  finalCommand = `${devCommand} --port ${port}`;
} else if (style === "webpack") {
  finalCommand = `${devCommand} -- --port ${port}`;
} else {
  // "cra" | "deno" | "none": the Rust process manager injects PORT env; pass no extra flags
  finalCommand = devCommand;
}
const configJson = JSON.stringify({ path: devCwd, command: finalCommand, port });
```

> Note: `RunOverride` has no `env` field. The Rust process manager (`devx-ext`) execs `parts[0]` of the whitespace-split command, so an inline `KEY='val'` prefix would be rejected as a disallowed command. Custom env must go in files the dev server reads (`.env.local`, `.npmrc`).

- [ ] **Step 3: Add flow/runtime command prefixes to the allowlist** (line 35):

```ts
const ALLOWED_COMMAND_PREFIXES = ["npm", "npx", "yarn", "pnpm", "node", "deno", "bun", "echo", "python", "python3", "uv", "prefect"];
```
(`validateCommand` validates the **first non-`KEY=val` word** — split on whitespace, skip tokens matching `/^[A-Z_]+=/` — harmless to keep even though we no longer emit env prefixes.)

- [ ] **Step 4: Integration verify** with a plain (non-d2e) app to prove no regression (existing `npm run dev` still gets `-- --port --base`), then move on. **Commit:**

```bash
git add plugins/devx/functions/dev_server.ts
git commit -m "feat(devx): dev server run override (cwd/portStyle/env) + flow command prefixes"
```

### Task 1.2: Resolve the active sub-app run spec in `server/start`

**Files:**
- Modify: `plugins/devx/functions/index.ts` (the `POST /apps/:id/server/start` handler)

- [ ] **Step 1: Before calling `devServerManager.start(...)`, if the app is d2e, resolve the active sub-app and build the override.** Insert:

Custom env is delivered via **files** (the Rust process manager can't take inline env): `D2E_API_BASE` → `.env.local` in `devCwd`; the GitHub token → `.npmrc` in `installCwd`.

```ts
// d2e: run the active sub-app instead of the workspace root.
let startDevCmd = app.dev_command, startInstallCmd = app.install_command;
let override = {};
if (app.tech_stack === "d2e" && app.config?.d2e?.activeSubApp) {
  const d2e = app.config.d2e;
  const sa = d2e.subApps.find((s) => s.key === d2e.activeSubApp);
  if (sa) {
    const wsPath = getAppWorkspacePath(userId, app.id);
    const devCwdAbs = `${wsPath}/${sa.run.devCwd}`.replace(/\/\.$/, "");
    const installCwdAbs = `${wsPath}/${sa.run.installCwd}`.replace(/\/\.$/, "");
    startInstallCmd = sa.run.installCommand;
    startDevCmd = sa.run.devCommand;
    // Custom env is delivered via files (the Rust process manager can't take inline env).
    if (d2e.externalApiBase) {
      try {
        await Deno.writeTextFile(`${devCwdAbs}/.env.local`,
          `D2E_API_BASE=${d2e.externalApiBase}\nVITE_D2E_API_BASE=${d2e.externalApiBase}\n`);
      } catch (e) { console.error("[d2e] .env.local write failed", e); }
    }
    if (sa.run.needsGithubToken) {
      const tok = await getGithubToken(userId, sql).catch(() => null);
      if (tok) {
        try {
          await Deno.writeTextFile(`${installCwdAbs}/.npmrc`,
            `//npm.pkg.github.com/:_authToken=${tok}\n@portal:registry=https://npm.pkg.github.com\n`);
        } catch (e) { console.error("[d2e] .npmrc write failed", e); }
      }
    }
    override = { installCwd: installCwdAbs, devCwd: devCwdAbs, portStyle: sa.run.portStyle, nxApp: sa.key.split(":")[1] };
  }
}
const result = await devServerManager.start(userId, app.id, getAppWorkspacePath(userId, app.id), startDevCmd, startInstallCmd, override);
```

- [ ] **Step 2: Integration verify with the easiest UI (jobs — Vite, `nx dev`).** Select `ui:jobs`, start, poll status, curl the proxy:

```bash
JWT=$(cat /tmp/dx_jwt.txt); APP=$(cat /tmp/d2e_appid.txt)
curl -sS -XPOST -H "Authorization: Bearer $JWT" -d '{"key":"ui:jobs"}' http://localhost:9001/plugins/trex/devx-api/apps/$APP/d2e/select
curl -sS -XPOST -H "Authorization: Bearer $JWT" http://localhost:9001/plugins/trex/devx-api/apps/$APP/server/start
# poll status until running (install of the whole d2e-ui monorepo is slow; allow several minutes)
for i in $(seq 1 60); do curl -sS -H "Authorization: Bearer $JWT" http://localhost:9001/plugins/trex/devx-api/apps/$APP/server/status; echo; sleep 10; done
```
Expected: status transitions `starting`→`running` with a `port`. Then `GET .../proxy/` returns HTML.

> **Known risk (document, don't block):** `yarn install` for d2e-ui needs `GITHUB_TOKEN` for private `@portal/*` packages; without a connected GitHub token the install fails — surface that error clearly in `server/output`. Module-federation remotes (`flow`/`analysis`/`mapping`) render minimally without the Portal shell; `jobs` and `portal` are the best standalone demos.

- [ ] **Step 3: Commit**

```bash
git add plugins/devx/functions/index.ts
git commit -m "feat(devx/d2e): server/start runs the active d2e sub-app (cwd/cmd/token/env)"
```

### Task 1.3: Surface install/run errors to the user

**Files:**
- Modify: `plugins/devx/functions/index.ts` (`server/start` response) and `D2ESubAppPanel.tsx`

- [ ] **Step 1:** Ensure the `server/status` `error` field (already set by `dev_server` on install failure) is rendered in the panel, and add a hint string when `error` contains `401`/`authentication`/`@portal`: *"This d2e UI needs a connected GitHub token (private @portal packages). Connect GitHub in Settings."*

- [ ] **Step 2:** Verify by starting `ui:portal` without a token → panel shows the token hint. **Commit.**

### Task 1.4: Frontend — Run/Stop for the active sub-app

**Files:**
- Modify: `plugins/devx/src/components/d2e/D2ESubAppPanel.tsx`

- [ ] **Step 1:** Replace the placeholder button with Run/Stop wired to the existing `startServer`/`stopServer` api calls, plus a live status badge from `server/status` polling and a link/embed of the existing preview (`/proxy/`). Reuse the app's existing preview component if present.

- [ ] **Step 2:** Verify end-to-end in the browser: select `jobs`, Run, preview renders. **Commit.**

---

## Phase 2 — d2e-specific agent context (skill + TREX.md + KB)

### Task 2.1: The d2e skill

**Files:**
- Create: `plugins/devx/skills/d2e/SKILL.md`

- [ ] **Step 1: Write `SKILL.md`** with frontmatter (`name: d2e`, `description: Use when working in a Data2Evidence app — explains d2e architecture, the three artifact types, conventions, and how to run/iterate each`). Body sections (concrete content drawn from the investigation, mirroring the depth of the existing `templates/d2e_researcher_plugin.ts` TREX.md):
  - **Platform shape**: Caddy (`:41100`) → trex gateway (`:33001`, serves functions + portal) → Postgres/HANA, Logto (OIDC), Prefect (`:41120`). A devx preview runs ONE sub-app and proxies backend calls to an **external** running d2e (`D2E_API_BASE`).
  - **Functions** (`plugins/functions/<name>`): Deno runtime running Node/Express (`deno.json` with `npm:` imports); registered with trex via the parent `package.json` `trex.functions.api`; auth via Logto JWT (`_shared/alp-base-utils/GetUser.ts`), DB via env (`PG__*`, `HANA__*`) and `_shared` libs. How to add a route; how to run locally (`deno run index.ts` + `D2E_API_BASE`/PG env).
  - **UI** (`d2e-ui`, Nx + yarn workspaces): `portal` is the shell (CRA); `flow`/`analysis`/`mapping` are module-federation remotes loaded into portal; `jobs` (Vue/Vite) embeds Prefect UI. Install once at root (`yarn`, needs `GITHUB_TOKEN`), dev per app (`nx start <app>` / `npm start`). single-spa/portal context (`getToken`, `datasetId`, `studyId`, `apiBase`). Styling = MUI (navy `#000080`), no Tailwind.
  - **Flows** (`d2e-flows`, Prefect 3 / Python): one dir per flow with `flow.py` + `types.py` (Pydantic) + `package.json` (`trex.flow`); generate the manifest with `flowinit.py`; test with `prefect_test_harness()`; data via `DBDao`. v1 devx runs the test harness, not a worker.
  - **The devx contract**: you are editing a clone; the active sub-app is what runs; set "External API" to a running d2e for live data; module-federation remotes need portal too.

- [ ] **Step 2: Verify** the skill is materialized by the claude-code sidecar (`server.js materializeSkills()` copies `skills/*/SKILL.md` → `~/.claude/skills`; see [[trex-dx-agent-skills-wiring]]). Restart, start a chat in a d2e app, confirm the agent can invoke the `d2e` skill. **Commit:**

```bash
git add plugins/devx/skills/d2e/SKILL.md
git commit -m "feat(devx/d2e): d2e architecture & conventions skill"
```

### Task 2.2: Per-sub-app TREX.md generation

**Files:**
- Create: `plugins/devx/functions/d2e/trex_md.ts`
- Modify: `plugins/devx/functions/routes/d2e_routes.ts` (on `select`, write `TREX.md`)

- [ ] **Step 1: Write `renderD2ETrexMd(cfg, subApp): string`** — returns markdown that: states this is a Data2Evidence `<type>` sub-app (`<name>`, dir `<dir>`, framework), tells the agent to **invoke the `d2e` skill**, gives the exact run command + port + external-API note, and includes the type-specific conventions block (UI/function/flow) condensed from the skill. Keep it ~40-80 lines.

- [ ] **Step 2: In `d2e_routes.ts` `select`, after persisting, write the file:**

```ts
import { renderD2ETrexMd } from "../d2e/trex_md.ts";
import { getAppWorkspacePath } from "../tools/workspace.ts";
// ...after cfg.d2e.activeSubApp = key; await saveCfg(...):
const sa = cfg.d2e.subApps.find((s) => s.key === key);
try {
  const ws = getAppWorkspacePath(userId, m[1]);
  await Deno.writeTextFile(`${ws}/TREX.md`, renderD2ETrexMd(cfg.d2e, sa));
} catch (e) { console.error("[d2e] TREX.md write failed", e); }
```

- [ ] **Step 3: Verify** selecting a sub-app writes `TREX.md` (`docker exec ... cat <ws>/TREX.md`) and that `readProjectRules` picks it up (it prefers `TREX.md`). **Commit:**

```bash
git add plugins/devx/functions/d2e/trex_md.ts plugins/devx/functions/routes/d2e_routes.ts
git commit -m "feat(devx/d2e): generate per-sub-app TREX.md on select"
```

### Task 2.3: Bundle d2e-docs as a knowledge-base source

**Files:**
- Modify: `Dockerfile.dx` (stage 2, near the existing `COPY plugins/docs/docs/ .../kb-local/trex-docs/`)

- [ ] **Step 1:** Add a build step that vendors the `d2e-docs` content into the claude-code KB (`fn-claude-code/kb-local/d2e`), mirroring how `trex-docs` is bundled. Since `d2e-docs` is a separate repo, add a documented build-arg/clone or a `git submodule`; for the dx dev image, the simplest is a shallow clone in the builder stage guarded by a build-arg (skip if absent). Document that the `kb` MCP `d2e` source already exists (per [[trex-hana-d2e-integration]] context) and this enriches it.

- [ ] **Step 2: Verify** (requires an image rebuild) the agent's `kb` tool lists a `d2e` source with the docs. **Commit.**

> If a rebuild is undesirable now, mark this task **deferred** and rely on the skill (Task 2.1) for context; the KB is additive.

---

## Phase 3 — Functions (best-effort run against an external d2e)

### Task 3.1: Run a d2e function via Deno, pointed at external env

**Files:**
- Modify: `plugins/devx/functions/index.ts` (`server/start` d2e branch already handles non-ui; ensure `function` type uses `portStyle:"deno"` and injects DB/API env)

- [ ] **Step 1:** When the active sub-app `type === "function"`, build `env` from `config.d2e.externalApiBase` plus any `PG__*`/`HANA__*` the user set in `app.config.env` (existing `config` → `.env` mechanism). Start via the existing path (deno `portStyle`). The function binds `PORT`; the proxy already forwards `/proxy/` → `localhost:PORT`.

- [ ] **Step 2: Verify** with a simple function (e.g. `fn:demo` or a health route): select it, Run, `GET /proxy/<health-route>` returns 200 (DB-backed routes will 5xx without a reachable external d2e — that's expected and documented).

- [ ] **Step 3: Commit.**

> **Reality check (document):** most d2e functions hard-depend on `_shared` libs + a live d2e DB/Logto; standalone they mainly serve health/echo routes. v1's value for functions is **context + edit + register**, not full runtime. State this in the panel and skill.

---

## Phase 4 — Flows (context + local test harness)

### Task 4.1: Image deps for Python/Prefect

**Files:**
- Modify: `Dockerfile.dx` (final stage)

- [ ] **Step 1:** Ensure `python3`, `pip`, `uv`, and `prefect` are available for `node` user (add an `apt-get`/`uv` install in the final stage, or document that flows require the d2e flow image). Enable `corepack`/`yarn` here too (needed by Phase 1).

- [ ] **Step 2: Verify** `docker exec -u node trex-dx-trex-1 sh -c 'python3 --version && prefect version && yarn --version'`. **Commit.**

### Task 4.2: Flow "run" = local test harness

**Files:**
- Modify: `plugins/devx/functions/d2e/recipes.ts` (`flowRun`)

- [ ] **Step 1:** Make `flowRun` produce a `devCommand` that runs the flow's test (e.g. `python -m pytest <flow>/tests -q` if tests exist, else `echo` guidance). `portStyle:"none"` means no port/preview; the panel shows test output via `server/output` instead of a preview.

- [ ] **Step 2: Verify** selecting a flow + Run streams test output (or the guidance echo). **Commit.**

> Long-running Prefect server/worker orchestration is **out of scope for v1** (needs Docker + a Prefect server). The skill documents the real platform path; devx gives edit + context + unit test.

---

## Cross-cutting risks & decisions (carry into execution)

1. **Private @portal packages**: d2e-ui `yarn install` needs `GITHUB_TOKEN`. v1 reuses the user's connected GitHub token (`getGithubToken`); if absent, fail loudly with the Settings hint (Task 1.3). Without it, UI sub-apps won't install.
2. **Webpack/CRA dev servers use HTTPS + custom config** (`flow` 4900, `analysis` 4800, `portal` CRA). The devx proxy fetches `http://localhost:PORT`; if a sub-app forces HTTPS, the proxy fetch fails. Mitigation: prefer/verify the Vite sub-apps (`jobs`, `mapping`) first; for webpack apps, set `HTTPS=false`/`WDS_SOCKET` via a `.env.local` file (not inline env) and confirm.
3. **Module-federation remotes** (`flow`/`analysis`/`mapping`) are not standalone apps — they expect the Portal shell. v1 runs one process; document that these render limited UI alone. (Follow-up: multi-process support keyed by `appId+subApp` to run portal + a remote together.)
4. **Monorepo install is heavy** (d2e-ui ~ large; first `yarn` is slow). The `server/status` poll must allow several minutes; surface install progress via `server/output`.
5. **No Docker in the dx container** → no full-stack orchestration. "External API" (`D2E_API_BASE`) is how UIs/functions reach real data; the user points it at a separately-running d2e.
6. **`tech_stack="d2e"`** is new. Confirm nothing keys off the old `d2e-react` value in a way that breaks (the existing `d2e_*_plugin` templates keep `d2e-react`; the new clone-based apps use `d2e`).
7. **Command safety**: extending `ALLOWED_COMMAND_PREFIXES` with `python`/`prefect` widens what the agent/dev server can run. The `validateCommand` change must still reject everything else and handle the `KEY=val` env prefix tokens.
8. **No inline env in the Rust process manager**: The Rust process manager (`devx-ext`) parses argv0 and injects only PORT; it has no inline-env and its allowlist lacks python/prefect. Custom env for sub-apps is delivered via files (`.env.local`, `.npmrc`). Running flows (python/prefect) requires extending the Rust allowlist + an image rebuild — out of scope for v1 (flows are context-only).

---

## Self-review (done by plan author)

- **Spec coverage**: create option (0.4, 0.7) ✓; clone via git URL (0.4) ✓; detect functions+ui+flows (0.3) ✓; select sub-apps (0.5, 0.8) ✓; run UIs (1.x) ✓; functions (3.x) ✓; flows (4.x) ✓; d2e context = skill + TREX.md + KB (2.x) ✓.
- **Type consistency**: `SubApp`/`SubAppRun`/`D2EConfig` defined once (0.1) and referenced everywhere; `start(...override)` signature defined in 1.1 and called in 1.2; `config.d2e` read/written via `loadCfg`/`saveCfg` consistently.
- **Phasing**: each phase is independently shippable (Phase 0 = create+detect+list; Phase 1 = run UIs; Phase 2 = context; Phase 3/4 = functions/flows best-effort).
- **Verification**: integration-only (no fake unit harness), matching the codebase; each task has a concrete curl/deno check.

---

**Plan complete and saved to `plugins/devx/docs/plans/2026-06-16-data2evidence-support.md`.**
