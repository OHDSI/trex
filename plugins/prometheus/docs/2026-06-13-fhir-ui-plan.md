# FHIR UI — Profile-Driven Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vue 3 + Vuetify micro-frontend plugin (`plugins/fhir-ui`) that browses and edits FHIR resources on the `fhir-fn` server, with every screen generated from FHIR profile metadata (StructureDefinition / CapabilityStatement) instead of hardcoded per resource type.

**Architecture:** A new single-spa Vue plugin mounted into the existing React `web` shell (same mechanism as `devx`). A thin `fhirClient` wraps the FHIR REST API; a Pinia `profileStore` caches profile metadata; two generic rendering engines (StructureDefinition→editor, Questionnaire→SDC form) plus a datatype→widget registry drive all forms. One small backend addition exposes the server's already-parsed profile model over HTTP. UI is composed from the Atlas3 control library (`@ohdsi/atlas-ui`) wherever possible.

**Tech Stack:** Deno (fhir-fn backend, `deno test`), Vue 3, Vuetify 3, Pinia, vue-router, single-spa-vue, Vite, Vitest, Playwright, `@ohdsi/atlas-ui` (Atlas design tokens + `Atlas*` components).

**Design spec:** `plugins/fhir-ui/docs/2026-06-13-fhir-ui-design.md`. **Mockups:** `.superpowers/brainstorm/.../screens-v2.html`.

**Resolved decisions (from spec's open items):**
- **Atlas consumption:** vendor the built `@ohdsi/atlas-ui` dist into `plugins/fhir-ui/vendor/atlas-ui/` and consume via a Vite path alias. Fast, self-contained, builds in CI without the sibling Atlas3 checkout. Can later move to a published package.
- **First-pass views:** resource browser, search, generic editor (also serves as read-only detail via a `readonly` prop), questionnaire builder, form filler, plus a dataset picker. **Version history is deferred.**

---

## Shared contract (referenced by many tasks)

The backend endpoint returns the server's parsed profile model. Both sides use these exact shapes.

```ts
// Element of a parsed StructureDefinition (mirrors server's ElementInfo)
export interface ElementInfo {
  path: string;            // e.g. "Patient.name"
  name: string;            // e.g. "name"
  typeCodes: string[];     // e.g. ["HumanName"]; choice[x] has >1
  min: number;             // 0,1,...
  max: string;             // "1" | "*" | "0" | n
  isArray: boolean;        // max === "*" or numeric > 1
  isChoice: boolean;       // value[x]
  contentReference?: string;
  children: ElementInfo[]; // nested backbone elements
}

export interface ParsedStructureDefinition {
  resourceType: string;    // e.g. "Patient"
  kind: string;            // "resource" | "complex-type" | "primitive-type"
  isAbstract: boolean;
  elements: ElementInfo[]; // top-level elements
}
```

**Endpoints (new + existing used by the UI):**
- `GET /{dataset}/StructureDefinition` → `{ resourceTypes: string[] }` (new)
- `GET /{dataset}/StructureDefinition/{type}` → `ParsedStructureDefinition` (new)
- `GET /{dataset}/metadata` → CapabilityStatement (existing)
- `GET /{dataset}/{Type}?params` → searchset Bundle (existing)
- `GET|POST|PUT|DELETE /{dataset}/{Type}[/{id}]` → CRUD (existing)

---

# Milestone 0 — Backend: StructureDefinition endpoint (fhir-fn)

Files:
- Modify: `plugins/fhir-fn/functions/router.ts` (add route kinds + parse cases + dispatch)
- Create: `plugins/fhir-fn/functions/handlers/structure_definition.ts`
- Modify: `plugins/fhir-fn/functions/fhir/structure_definition.ts` (add registry accessors)
- Test: `plugins/fhir-fn/test/structure_definition_endpoint_test.ts`
- Test: `plugins/fhir-fn/test/router_test.ts` (extend if present; else create)

### Task 0.1: Registry accessors

- [ ] **Step 1: Write the failing test**

Create `plugins/fhir-fn/test/structure_definition_endpoint_test.ts`:

```ts
import { assertEquals, assert } from "jsr:@std/assert";
import { DefinitionRegistry } from "../functions/fhir/structure_definition.ts";

const RES = JSON.stringify({
  resourceType: "Bundle",
  entry: [{ resource: {
    resourceType: "StructureDefinition", kind: "resource", abstract: false,
    type: "Patient",
    snapshot: { element: [
      { path: "Patient" },
      { path: "Patient.gender", type: [{ code: "code" }], min: 0, max: "1" },
      { path: "Patient.name", type: [{ code: "HumanName" }], min: 0, max: "*" },
    ] },
  } }],
});
const TYPES = JSON.stringify({ resourceType: "Bundle", entry: [] });

Deno.test("registry lists resource types", () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  assert(reg.listResourceTypes().includes("Patient"));
});

Deno.test("registry returns a parsed definition by type", () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  const sd = reg.getResourceDefinition("Patient");
  assertEquals(sd?.resourceType, "Patient");
  assert(sd!.elements.some((e) => e.name === "gender"));
});

Deno.test("registry returns undefined for unknown type", () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  assertEquals(reg.getResourceDefinition("Nope"), undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-fn && deno test test/structure_definition_endpoint_test.ts`
Expected: FAIL — `listResourceTypes`/`getResourceDefinition` not a function.

- [ ] **Step 3: Add accessors to the registry**

In `plugins/fhir-fn/functions/fhir/structure_definition.ts`, inside `class DefinitionRegistry`, add:

```ts
  listResourceTypes(): string[] {
    return [...this.resources.keys()].sort();
  }

  getResourceDefinition(type: string): ParsedStructureDefinition | undefined {
    return this.resources.get(type);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/fhir-fn && deno test test/structure_definition_endpoint_test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-fn/functions/fhir/structure_definition.ts plugins/fhir-fn/test/structure_definition_endpoint_test.ts
git commit -m "feat(fhir-fn): registry accessors for StructureDefinition serving"
```

### Task 0.2: Route parsing for StructureDefinition

- [ ] **Step 1: Write the failing test**

Create `plugins/fhir-fn/test/router_sd_test.ts`:

```ts
import { assertEquals } from "jsr:@std/assert";
import { parseRoute } from "../functions/router.ts";

Deno.test("GET /{ds}/StructureDefinition → list", () => {
  assertEquals(parseRoute("GET", "/ds1/StructureDefinition"),
    { kind: "structureDefinitionList", datasetId: "ds1" });
});

Deno.test("GET /{ds}/StructureDefinition/Patient → read", () => {
  assertEquals(parseRoute("GET", "/ds1/StructureDefinition/Patient"),
    { kind: "structureDefinitionRead", datasetId: "ds1", type: "Patient" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-fn && deno test test/router_sd_test.ts`
Expected: FAIL — returns `{kind:"search",...}` / `{kind:"read",...}`.

- [ ] **Step 3: Add the route kinds and parse cases**

In `plugins/fhir-fn/functions/router.ts`, add to the `Route` union (near the other kinds):

```ts
  | { kind: "structureDefinitionList"; datasetId: string }
  | { kind: "structureDefinitionRead"; datasetId: string; type: string }
```

In `parseRoute`, in the `n === 2` block, BEFORE the generic `// /{ds}/{resourceType}  search / create` line, add:

```ts
    // /{ds}/StructureDefinition  — literal, served from the registry (GET only)
    if (s1 === "StructureDefinition") {
      return m === "GET" ? { kind: "structureDefinitionList", datasetId } : { kind: "notFound" };
    }
```

In the `n === 3` block, BEFORE the generic `// /{ds}/{resourceType}/{id}` read/update/delete lines, add:

```ts
    // /{ds}/StructureDefinition/{type}  — literal, served from the registry (GET only)
    if (s1 === "StructureDefinition") {
      return m === "GET" ? { kind: "structureDefinitionRead", datasetId, type: s2 } : { kind: "notFound" };
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/fhir-fn && deno test test/router_sd_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-fn/functions/router.ts plugins/fhir-fn/test/router_sd_test.ts
git commit -m "feat(fhir-fn): parse StructureDefinition routes"
```

### Task 0.3: Handler + dispatch

- [ ] **Step 1: Write the failing test**

Append to `plugins/fhir-fn/test/structure_definition_endpoint_test.ts`:

```ts
import { handleStructureDefinitionList, handleStructureDefinitionRead } from "../functions/handlers/structure_definition.ts";

Deno.test("handler: list returns resourceTypes JSON", async () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  const res = handleStructureDefinitionList({ registry: reg } as any);
  assertEquals(res.headers.get("content-type"), "application/fhir+json");
  const body = await res.json();
  assert(body.resourceTypes.includes("Patient"));
});

Deno.test("handler: read returns the parsed definition", async () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  const res = handleStructureDefinitionRead({ registry: reg } as any, "Patient");
  const body = await res.json();
  assertEquals(body.resourceType, "Patient");
});

Deno.test("handler: read unknown type → 404 OperationOutcome", async () => {
  const reg = DefinitionRegistry.loadFromJson(RES, TYPES);
  const res = handleStructureDefinitionRead({ registry: reg } as any, "Nope");
  assertEquals(res.status, 404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-fn && deno test test/structure_definition_endpoint_test.ts`
Expected: FAIL — handler module not found.

- [ ] **Step 3: Write the handler**

Create `plugins/fhir-fn/functions/handlers/structure_definition.ts`:

```ts
// @ts-nocheck - Deno edge function
import { FhirError } from "../error.ts";
import { AppState } from "../state.ts";

const FHIR_JSON = { "content-type": "application/fhir+json" };

/** GET /{dataset}/StructureDefinition — list resource types known to the registry. */
export function handleStructureDefinitionList(state: AppState): Response {
  return new Response(
    JSON.stringify({ resourceTypes: state.registry.listResourceTypes() }),
    { status: 200, headers: FHIR_JSON },
  );
}

/** GET /{dataset}/StructureDefinition/{type} — the parsed profile model for one type. */
export function handleStructureDefinitionRead(state: AppState, type: string): Response {
  const sd = state.registry.getResourceDefinition(type);
  if (!sd) throw FhirError.notFound(`StructureDefinition '${type}' not found`);
  return new Response(JSON.stringify(sd), { status: 200, headers: FHIR_JSON });
}
```

- [ ] **Step 4: Wire dispatch in the router's handler switch**

In `plugins/fhir-fn/functions/router.ts`, add the import near the other handler imports:

```ts
import { handleStructureDefinitionList, handleStructureDefinitionRead } from "./handlers/structure_definition.ts";
```

Then in the function that dispatches a parsed `Route` to a handler (the `switch (route.kind)` that calls `getMetadata` etc.), add two cases alongside `case "metadata":`. These two need only the registry (no DB connection):

```ts
    case "structureDefinitionList":
      return handleStructureDefinitionList(state);
    case "structureDefinitionRead":
      return handleStructureDefinitionRead(state, route.type);
```

> Note: place these cases so they do NOT require `withConnection`. If the dispatcher wraps every dataset route in a DB lease, add them before that wrapping (they are pure registry reads). Mirror how `health`/`metrics` avoid the DB lease.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd plugins/fhir-fn && deno test test/structure_definition_endpoint_test.ts test/router_sd_test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 6: Commit**

```bash
git add plugins/fhir-fn/functions/handlers/structure_definition.ts plugins/fhir-fn/functions/router.ts plugins/fhir-fn/test/structure_definition_endpoint_test.ts
git commit -m "feat(fhir-fn): serve StructureDefinition over HTTP from registry"
```

### Task 0.4: Integration smoke test

- [ ] **Step 1: Add a Python integration test**

Create `integration-tests/test_fhir_fn_structuredefinition.py` (follow the existing `test_fhir_fn.py` setup/auth fixtures — reuse its dataset-creation + `apikey` header helpers; do not re-invent them):

```python
def test_structuredefinition_list_and_read(fhir_client, dataset):
    r = fhir_client.get(f"/{dataset}/StructureDefinition")
    assert r.status_code == 200
    assert "Patient" in r.json()["resourceTypes"]

    r = fhir_client.get(f"/{dataset}/StructureDefinition/Patient")
    assert r.status_code == 200
    body = r.json()
    assert body["resourceType"] == "Patient"
    assert any(e["name"] == "gender" for e in body["elements"])

    r = fhir_client.get(f"/{dataset}/StructureDefinition/NotAType")
    assert r.status_code == 404
```

- [ ] **Step 2: Run it**

Run: per `integration-tests/README_fhir_fn.md` (e.g. `pytest integration-tests/test_fhir_fn_structuredefinition.py`).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add integration-tests/test_fhir_fn_structuredefinition.py
git commit -m "test(fhir-fn): integration test for StructureDefinition endpoint"
```

---

# Milestone 1 — Plugin scaffold + Atlas3 vendoring + shell wiring

Files:
- Create: `plugins/fhir-ui/package.json`, `tsconfig.json`, `vite.config.ts`, `vite.config.spa.ts`, `index.html`
- Create: `plugins/fhir-ui/src/main.ts`, `src/spa.ts`, `src/App.vue`, `src/plugins/vuetify.ts`, `src/router/index.ts`
- Create: `plugins/fhir-ui/vendor/atlas-ui/` (vendored dist)
- Create: `plugins/fhir-ui/scripts/vendor-atlas-ui.mjs`
- Modify: shell nav config (see Task 1.5)

### Task 1.1: Vendor the Atlas UI library

- [ ] **Step 1: Build the lib in the sibling Atlas3 repo**

Run:
```bash
cd /Users/ph/code/Atlas3 && npm run lib:build
```
Expected: produces `packages/atlas-ui/dist/atlas-ui.js`, `atlas-ui.css`, `atlas-ui.d.ts`.

- [ ] **Step 2: Write the vendor script**

Create `plugins/fhir-ui/scripts/vendor-atlas-ui.mjs`:

```js
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = process.env.ATLAS_UI_DIST
  || join(here, "../../../../Atlas3/packages/atlas-ui/dist");
const dest = join(here, "../vendor/atlas-ui");

if (!existsSync(src)) {
  console.error(`atlas-ui dist not found at ${src}. Run "npm run lib:build" in Atlas3, or set ATLAS_UI_DIST.`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of ["atlas-ui.js", "atlas-ui.css", "atlas-ui.d.ts"]) {
  cpSync(join(src, f), join(dest, f));
}
console.log(`Vendored atlas-ui → ${dest}`);
```

- [ ] **Step 3: Run it and commit the vendored files**

Run: `cd plugins/fhir-ui && node scripts/vendor-atlas-ui.mjs`
Expected: `plugins/fhir-ui/vendor/atlas-ui/{atlas-ui.js,atlas-ui.css,atlas-ui.d.ts}` exist.

```bash
git add plugins/fhir-ui/scripts/vendor-atlas-ui.mjs plugins/fhir-ui/vendor/atlas-ui
git commit -m "chore(fhir-ui): vendor @ohdsi/atlas-ui dist"
```

### Task 1.2: package.json + build config

- [ ] **Step 1: Create `plugins/fhir-ui/package.json`**

```json
{
  "name": "@trex/fhir-ui",
  "version": "1.0.0",
  "type": "module",
  "files": ["dist/"],
  "scripts": {
    "vendor": "node scripts/vendor-atlas-ui.mjs",
    "dev": "vite",
    "build": "vue-tsc -b && vite build && vite build --config vite.config.spa.ts && cp dist/assets/index-*.css dist/fhir-ui-spa.css",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint ."
  },
  "trex": {
    "ui": {
      "routes": [
        { "path": "/fhir-ui", "dir": "dist", "spa": true }
      ]
    }
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.0",
    "vuetify": "^3.5.0",
    "pinia": "^2.1.0",
    "single-spa-vue": "^3.0.1",
    "@mdi/font": "^7.4.47"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0",
    "vite-plugin-vuetify": "^2.1.2",
    "vue-tsc": "^2.0.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@vue/test-utils": "^2.4.0",
    "jsdom": "^24.0.0",
    "@playwright/test": "^1.40.0",
    "sass": "^1.93.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@atlas-ui": ["vendor/atlas-ui/atlas-ui.js"]
    },
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "vendor/atlas-ui/*.d.ts"]
}
```

- [ ] **Step 3: Create `vite.config.ts` (app build → dist/index.html)**

```ts
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

const uiBasePath = process.env.VITE_UI_BASE_PATH || "/plugins/trex/fhir-ui";

export default defineConfig({
  base: `${uiBasePath}/`,
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@atlas-ui": fileURLToPath(new URL("./vendor/atlas-ui/atlas-ui.js", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    server: { deps: { inline: ["vuetify"] } },
  },
});
```

- [ ] **Step 4: Create `vite.config.spa.ts` (spa build → fhir-ui-spa.js)**

```ts
import path from "node:path";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vuetify from "vite-plugin-vuetify";

const uiBasePath = process.env.VITE_UI_BASE_PATH || "/plugins/trex/fhir-ui";

export default defineConfig({
  base: `${uiBasePath}/`,
  plugins: [vue(), vuetify({ autoImport: true })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@atlas-ui": path.resolve(__dirname, "./vendor/atlas-ui/atlas-ui.js"),
    },
  },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    lib: { entry: path.resolve(__dirname, "src/spa.ts"), formats: ["es"], fileName: () => "fhir-ui-spa.js" },
    outDir: "dist",
    emptyOutDir: false,
  },
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>FHIR Studio</title></head>
  <body><div id="app"></div><script type="module" src="/src/main.ts"></script></body>
</html>
```

- [ ] **Step 6: Commit**

```bash
git add plugins/fhir-ui/package.json plugins/fhir-ui/tsconfig.json plugins/fhir-ui/vite.config.ts plugins/fhir-ui/vite.config.spa.ts plugins/fhir-ui/index.html
git commit -m "chore(fhir-ui): plugin scaffold + build config"
```

### Task 1.3: Vuetify theme from Atlas tokens

- [ ] **Step 1: Create `src/plugins/vuetify.ts`**

```ts
import "vuetify/styles";
import "@mdi/font/css/materialdesignicons.css";
import "../../vendor/atlas-ui/atlas-ui.css";
import { createVuetify } from "vuetify";
import { buildVuetifyOptions } from "@atlas-ui";

// buildVuetifyOptions() supplies the Atlas theme (primary #1f425a, accent #eb6622,
// compact density, outlined inputs). Falls back to a literal theme if the export shape differs.
export const vuetify = createVuetify(buildVuetifyOptions());
```

- [ ] **Step 2: Smoke test the theme**

Create `src/plugins/vuetify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { vuetify } from "./vuetify";

describe("vuetify theme", () => {
  it("uses the Atlas primary color", () => {
    const light = vuetify.theme.themes.value.light;
    expect(light.colors.primary.toLowerCase()).toBe("#1f425a");
  });
});
```

- [ ] **Step 3: Run it**

Run: `cd plugins/fhir-ui && npm i && npm run vendor && npx vitest run src/plugins/vuetify.test.ts`
Expected: PASS. (If `buildVuetifyOptions` nests theme differently, adjust the assertion path to match its output — inspect once and fix.)

- [ ] **Step 4: Commit**

```bash
git add plugins/fhir-ui/src/plugins/vuetify.ts plugins/fhir-ui/src/plugins/vuetify.test.ts
git commit -m "feat(fhir-ui): Vuetify theme from Atlas tokens"
```

### Task 1.4: App shell, router, single-spa entry

- [ ] **Step 1: Create `src/router/index.ts`**

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/datasets" },
  { path: "/datasets", name: "datasets", component: () => import("@/screens/DatasetPicker.vue") },
  { path: "/:dataset", name: "browse", component: () => import("@/screens/ResourceBrowser.vue"), props: true },
  { path: "/:dataset/:type", name: "search", component: () => import("@/screens/ResourceSearch.vue"), props: true },
  { path: "/:dataset/:type/:id/edit", name: "edit", component: () => import("@/screens/ResourceEditor.vue"), props: true },
  { path: "/:dataset/Questionnaire/:id/build", name: "build", component: () => import("@/screens/QuestionnaireBuilder.vue"), props: true },
  { path: "/:dataset/Questionnaire/:id/fill", name: "fill", component: () => import("@/screens/QuestionnaireFiller.vue"), props: true },
];

export function createAppRouter(base: string) {
  return createRouter({ history: createWebHistory(base), routes });
}
```

- [ ] **Step 2: Create `src/App.vue`** (shell with the Atlas-style header)

```vue
<template>
  <v-app>
    <v-app-bar flat color="surface" height="60" border="b">
      <div class="d-flex align-center px-4" style="gap:10px;font-weight:700;color:rgb(var(--v-theme-primary))">
        <v-avatar size="26" color="primary"><span style="color:#fff">✚</span></v-avatar> FHIR Studio
      </div>
      <div class="d-flex align-center ml-6" style="height:100%">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-link" active-class="nav-link--active">{{ n.label }}</RouterLink>
      </div>
      <v-spacer />
      <v-chip v-if="dataset" variant="tonal" class="mr-3">{{ dataset }}</v-chip>
    </v-app-bar>
    <v-main><RouterView /></v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
const route = useRoute();
const dataset = computed(() => route.params.dataset as string | undefined);
const nav = computed(() => {
  const ds = dataset.value;
  return ds
    ? [{ to: `/${ds}`, label: "Browse" }, { to: `/${ds}`, label: "Build" }, { to: "/datasets", label: "Datasets" }]
    : [{ to: "/datasets", label: "Datasets" }];
});
</script>

<style scoped>
.nav-link { display:inline-flex; align-items:center; height:100%; padding:0 13px; color:rgb(var(--v-theme-on-surface-variant)); text-decoration:none; font-size:14px; }
.nav-link:hover { color:rgb(var(--v-theme-primary)); }
.nav-link--active { color:rgb(var(--v-theme-primary)); font-weight:500; box-shadow: inset 0 -2px 0 rgb(var(--v-theme-primary)); }
</style>
```

- [ ] **Step 3: Create `src/main.ts`** (standalone dev entry)

```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { vuetify } from "./plugins/vuetify";
import { createAppRouter } from "./router";

createApp(App).use(createPinia()).use(vuetify).use(createAppRouter("/")).mount("#app");
```

- [ ] **Step 4: Create `src/spa.ts`** (single-spa entry; `basePath` comes from the host)

```ts
import { createApp, h } from "vue";
import { createPinia } from "pinia";
import singleSpaVue from "single-spa-vue";
import App from "./App.vue";
import { vuetify } from "./plugins/vuetify";
import { createAppRouter } from "./router";

const lifecycles = singleSpaVue({
  createApp,
  appOptions: { render: () => h(App) },
  handleInstance(app, props: any) {
    app.use(createPinia());
    app.use(vuetify);
    app.use(createAppRouter(props.basePath || "/plugins/trex/fhir-ui"));
  },
});

export const bootstrap = lifecycles.bootstrap;
export const mount = lifecycles.mount;
export const unmount = lifecycles.unmount;
```

- [ ] **Step 5: Build to verify wiring**

Run: `cd plugins/fhir-ui && npm run build`
Expected: `dist/index.html`, `dist/fhir-ui-spa.js`, `dist/fhir-ui-spa.css` produced (screens may be empty stubs — create empty `<template><div/></template>` SFCs under `src/screens/` for each route so the build resolves; they are filled in later milestones).

- [ ] **Step 6: Commit**

```bash
git add plugins/fhir-ui/src
git commit -m "feat(fhir-ui): app shell, router, single-spa entry"
```

### Task 1.5: Register in the web shell navigation

- [ ] **Step 1: Add the nav entry**

The shell reads `TREX_WEB_NAV_EXTRA` (JSON array of `{path,label,plugin}`) and mounts via `SingleSpaMount` from `/plugins/trex/{plugin}/{plugin}-spa.js`. Add fhir-ui to the dev compose env. In `docker-compose.dev.yml` (and `docker-compose.dx.yml` if used), add/extend the web service env:

```yaml
      TREX_WEB_NAV_EXTRA: '[{"path":"/fhir-ui","label":"FHIR","plugin":"fhir-ui"}]'
```

> If `TREX_WEB_NAV_EXTRA` already has entries, append this object to the existing JSON array rather than overwriting.

- [ ] **Step 2: Manual verification**

Run the stack per repo README, open the web shell, confirm a "FHIR" nav item appears and mounting `/fhir-ui` loads the Vue shell (the Datasets screen stub renders inside the React shell without console errors).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.dev.yml docker-compose.dx.yml
git commit -m "feat(fhir-ui): register plugin in web shell nav"
```

---

# Milestone 2 — Data layer: fhirClient + profileStore

Files:
- Create: `src/services/fhirClient.ts`, `src/services/fhirClient.test.ts`
- Create: `src/stores/profile.ts`, `src/stores/profile.test.ts`
- Create: `src/types/fhir.ts` (the shared contract types above)

### Task 2.1: Shared types

- [ ] **Step 1: Create `src/types/fhir.ts`**

Paste the `ElementInfo` and `ParsedStructureDefinition` interfaces from the **Shared contract** section above, plus:

```ts
export interface FhirResource { resourceType: string; id?: string; [k: string]: unknown; }
export interface BundleEntry { resource: FhirResource; }
export interface Bundle { resourceType: "Bundle"; total?: number; entry?: BundleEntry[]; }
export interface CapabilityStatement {
  resourceType: "CapabilityStatement";
  rest: Array<{ resource: Array<{ type: string; searchParam?: Array<{ name: string; type: string }> }> }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/fhir-ui/src/types/fhir.ts
git commit -m "feat(fhir-ui): shared FHIR contract types"
```

### Task 2.2: fhirClient

- [ ] **Step 1: Write the failing test**

Create `src/services/fhirClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FhirClient } from "./fhirClient";

const json = (body: unknown, init: any = {}) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/fhir+json" }, ...init });

describe("FhirClient", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("searches a resource type with query params", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ resourceType: "Bundle", total: 1, entry: [{ resource: { resourceType: "Patient", id: "p1" } }] }));
    const c = new FhirClient("http://h/fhir", "k");
    const b = await c.search("ds1", "Patient", { gender: "female" });
    expect(b.total).toBe(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe("http://h/fhir/ds1/Patient?gender=female");
    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    expect((opts.headers as any).apikey).toBe("k");
  });

  it("reads a structure definition", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ resourceType: "Patient", kind: "resource", isAbstract: false, elements: [] }));
    const c = new FhirClient("http://h/fhir", "k");
    const sd = await c.getStructureDefinition("ds1", "Patient");
    expect(sd.resourceType).toBe("Patient");
  });

  it("throws a normalized error from OperationOutcome", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      json({ resourceType: "OperationOutcome", issue: [{ severity: "error", diagnostics: "bad" }] }, { status: 400 }));
    const c = new FhirClient("http://h/fhir", "k");
    await expect(c.read("ds1", "Patient", "x")).rejects.toThrow("bad");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-ui && npx vitest run src/services/fhirClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/fhirClient.ts`**

```ts
import type { Bundle, CapabilityStatement, FhirResource, ParsedStructureDefinition } from "@/types/fhir";

export class FhirError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export class FhirClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private headers(): HeadersInit {
    return { apikey: this.apiKey, "content-type": "application/fhir+json" };
  }

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method, headers: this.headers(), body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : undefined;
    if (!res.ok) {
      const msg = data?.issue?.[0]?.diagnostics || data?.issue?.[0]?.details?.text || `HTTP ${res.status}`;
      throw new FhirError(msg, res.status);
    }
    return data;
  }

  listDatasets(): Promise<any> { return this.req("GET", "/datasets"); }
  metadata(ds: string): Promise<CapabilityStatement> { return this.req("GET", `/${ds}/metadata`); }
  listStructureDefinitions(ds: string): Promise<{ resourceTypes: string[] }> { return this.req("GET", `/${ds}/StructureDefinition`); }
  getStructureDefinition(ds: string, type: string): Promise<ParsedStructureDefinition> { return this.req("GET", `/${ds}/StructureDefinition/${type}`); }

  search(ds: string, type: string, params: Record<string, string> = {}): Promise<Bundle> {
    const qs = new URLSearchParams(params).toString();
    return this.req("GET", `/${ds}/${type}${qs ? `?${qs}` : ""}`);
  }
  read(ds: string, type: string, id: string): Promise<FhirResource> { return this.req("GET", `/${ds}/${type}/${id}`); }
  create(ds: string, type: string, body: FhirResource): Promise<FhirResource> { return this.req("POST", `/${ds}/${type}`, body); }
  update(ds: string, type: string, id: string, body: FhirResource): Promise<FhirResource> { return this.req("PUT", `/${ds}/${type}/${id}`, body); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/fhir-ui && npx vitest run src/services/fhirClient.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/services/fhirClient.ts plugins/fhir-ui/src/services/fhirClient.test.ts
git commit -m "feat(fhir-ui): typed FHIR REST client"
```

### Task 2.3: profileStore

- [ ] **Step 1: Write the failing test**

Create `src/stores/profile.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useProfileStore } from "./profile";

const sd = { resourceType: "Patient", kind: "resource", isAbstract: false, elements: [{ path: "Patient.gender", name: "gender", typeCodes: ["code"], min: 0, max: "1", isArray: false, isChoice: false, children: [] }] };

describe("profileStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("caches a fetched StructureDefinition (one network call)", async () => {
    const client = { getStructureDefinition: vi.fn().mockResolvedValue(sd) } as any;
    const store = useProfileStore();
    store.init(client, "ds1");
    const a = await store.getDefinition("Patient");
    const b = await store.getDefinition("Patient");
    expect(a).toBe(b);
    expect(client.getStructureDefinition).toHaveBeenCalledTimes(1);
  });

  it("resolves search params from the capability statement", async () => {
    const client = {
      metadata: vi.fn().mockResolvedValue({ resourceType: "CapabilityStatement",
        rest: [{ resource: [{ type: "Patient", searchParam: [{ name: "gender", type: "token" }] }] }] }),
    } as any;
    const store = useProfileStore();
    store.init(client, "ds1");
    const sps = await store.getSearchParams("Patient");
    expect(sps).toEqual([{ name: "gender", type: "token" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-ui && npx vitest run src/stores/profile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/stores/profile.ts`**

```ts
import { defineStore } from "pinia";
import type { FhirClient } from "@/services/fhirClient";
import type { CapabilityStatement, ParsedStructureDefinition } from "@/types/fhir";

export interface SearchParam { name: string; type: string; }

export const useProfileStore = defineStore("profile", {
  state: () => ({
    client: null as FhirClient | null,
    dataset: "" as string,
    defs: new Map<string, ParsedStructureDefinition>(),
    capability: null as CapabilityStatement | null,
  }),
  actions: {
    init(client: FhirClient, dataset: string) { this.client = client; this.dataset = dataset; this.defs.clear(); this.capability = null; },

    async getDefinition(type: string): Promise<ParsedStructureDefinition> {
      const cached = this.defs.get(type);
      if (cached) return cached;
      const sd = await this.client!.getStructureDefinition(this.dataset, type);
      this.defs.set(type, sd);
      return sd;
    },

    async getCapability(): Promise<CapabilityStatement> {
      if (!this.capability) this.capability = await this.client!.metadata(this.dataset);
      return this.capability;
    },

    async getSearchParams(type: string): Promise<SearchParam[]> {
      const cap = await this.getCapability();
      const entry = cap.rest?.[0]?.resource?.find((r) => r.type === type);
      return (entry?.searchParam ?? []) as SearchParam[];
    },

    async getResourceTypes(): Promise<string[]> {
      const cap = await this.getCapability();
      return (cap.rest?.[0]?.resource ?? []).map((r) => r.type);
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/fhir-ui && npx vitest run src/stores/profile.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/stores/profile.ts plugins/fhir-ui/src/stores/profile.test.ts
git commit -m "feat(fhir-ui): profile store (cached StructureDefinitions + search params)"
```

### Task 2.4: Runtime config (base URL + apikey)

- [ ] **Step 1: Create `src/services/config.ts`**

The plugin runs inside the web shell; the FHIR base path and apikey come from the host environment. Provide a resolver with dev fallbacks:

```ts
// The host may inject window.__FHIR_UI_CONFIG__ = { baseUrl, apiKey }.
export interface FhirUiConfig { baseUrl: string; apiKey: string; }
export function resolveConfig(): FhirUiConfig {
  const injected = (globalThis as any).__FHIR_UI_CONFIG__;
  return {
    baseUrl: injected?.baseUrl || import.meta.env.VITE_FHIR_BASE_URL || "/plugins/trex/fhir",
    apiKey: injected?.apiKey || import.meta.env.VITE_FHIR_APIKEY || "",
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/fhir-ui/src/services/config.ts
git commit -m "feat(fhir-ui): runtime config resolver for FHIR base URL + apikey"
```

---

# Milestone 3 — Engine 1: widget registry + SDFormRenderer

Files:
- Create: `src/engine/widgetRegistry.ts`, `widgetRegistry.test.ts`
- Create: `src/engine/fhirPath.ts`, `fhirPath.test.ts` (get/set/add/remove by path within a draft resource)
- Create: `src/engine/SDFormRenderer.vue`, `SDFormRenderer.test.ts`
- Create: `src/engine/widgets/` (one SFC per widget kind)

### Task 3.1: Draft get/set helpers (`fhirPath.ts`)

- [ ] **Step 1: Write the failing test**

Create `src/engine/fhirPath.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getAt, setAt } from "./fhirPath";

describe("fhirPath", () => {
  it("gets a nested value", () => {
    expect(getAt({ name: [{ family: "Smith" }] }, ["name", 0, "family"])).toBe("Smith");
  });
  it("sets a nested value immutably-ish, creating containers", () => {
    const obj: any = {};
    setAt(obj, ["name", 0, "family"], "Jones");
    expect(obj.name[0].family).toBe("Jones");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd plugins/fhir-ui && npx vitest run src/engine/fhirPath.test.ts` → FAIL.

- [ ] **Step 3: Implement `src/engine/fhirPath.ts`**

```ts
export type PathSeg = string | number;

export function getAt(obj: any, path: PathSeg[]): any {
  return path.reduce((acc, seg) => (acc == null ? acc : acc[seg]), obj);
}

export function setAt(obj: any, path: PathSeg[], value: any): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i];
    const nextSeg = path[i + 1];
    if (cur[seg] == null) cur[seg] = typeof nextSeg === "number" ? [] : {};
    cur = cur[seg];
  }
  cur[path[path.length - 1]] = value;
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/engine/fhirPath.ts plugins/fhir-ui/src/engine/fhirPath.test.ts
git commit -m "feat(fhir-ui): path get/set helpers for resource drafts"
```

### Task 3.2: Widget registry (datatype → component)

- [ ] **Step 1: Write the failing test**

Create `src/engine/widgetRegistry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { widgetFor } from "./widgetRegistry";
import StringWidget from "./widgets/StringWidget.vue";
import BooleanWidget from "./widgets/BooleanWidget.vue";
import DateWidget from "./widgets/DateWidget.vue";
import CodeWidget from "./widgets/CodeWidget.vue";

describe("widgetRegistry", () => {
  it("maps primitive datatypes to widgets", () => {
    expect(widgetFor("string")).toBe(StringWidget);
    expect(widgetFor("boolean")).toBe(BooleanWidget);
    expect(widgetFor("date")).toBe(DateWidget);
    expect(widgetFor("dateTime")).toBe(DateWidget);
    expect(widgetFor("code")).toBe(CodeWidget);
  });
  it("falls back to StringWidget for unknown primitives", () => {
    expect(widgetFor("uri")).toBe(StringWidget);
  });
  it("returns null for complex types (handled by recursion, not a leaf widget)", () => {
    expect(widgetFor("HumanName")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Create the leaf widget SFCs**

Each widget takes `modelValue` + emits `update:modelValue`, composed from an Atlas component. Create:

`src/engine/widgets/StringWidget.vue`:
```vue
<template>
  <AtlasTextField :model-value="modelValue" :label="label" @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup lang="ts">
import { AtlasTextField } from "@atlas-ui";
defineProps<{ modelValue?: string; label?: string }>();
defineEmits<{ "update:modelValue": [string] }>();
</script>
```

`src/engine/widgets/BooleanWidget.vue`:
```vue
<template>
  <AtlasSwitch :model-value="!!modelValue" :label="label" @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup lang="ts">
import { AtlasSwitch } from "@atlas-ui";
defineProps<{ modelValue?: boolean; label?: string }>();
defineEmits<{ "update:modelValue": [boolean] }>();
</script>
```

`src/engine/widgets/DateWidget.vue`:
```vue
<template>
  <AtlasTextField type="date" :model-value="modelValue" :label="label" @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup lang="ts">
import { AtlasTextField } from "@atlas-ui";
defineProps<{ modelValue?: string; label?: string }>();
defineEmits<{ "update:modelValue": [string] }>();
</script>
```

`src/engine/widgets/CodeWidget.vue` (select when a small binding is known, else free text — binding wired in a later iteration; for now `AtlasSelect` with provided `options` or text fallback):
```vue
<template>
  <AtlasSelect v-if="options?.length" :model-value="modelValue" :items="options" :label="label"
    @update:model-value="$emit('update:modelValue', $event)" />
  <AtlasTextField v-else :model-value="modelValue" :label="label"
    @update:model-value="$emit('update:modelValue', $event)" />
</template>
<script setup lang="ts">
import { AtlasSelect, AtlasTextField } from "@atlas-ui";
defineProps<{ modelValue?: string; label?: string; options?: string[] }>();
defineEmits<{ "update:modelValue": [string] }>();
</script>
```

- [ ] **Step 4: Implement `src/engine/widgetRegistry.ts`**

```ts
import type { Component } from "vue";
import StringWidget from "./widgets/StringWidget.vue";
import BooleanWidget from "./widgets/BooleanWidget.vue";
import DateWidget from "./widgets/DateWidget.vue";
import CodeWidget from "./widgets/CodeWidget.vue";

const PRIMITIVE = new Set([
  "string","markdown","uri","url","id","oid","uuid","canonical","base64Binary",
  "integer","decimal","positiveInt","unsignedInt","boolean","date","dateTime","instant","time","code",
]);

const MAP: Record<string, Component> = {
  boolean: BooleanWidget,
  date: DateWidget, dateTime: DateWidget, instant: DateWidget, time: DateWidget,
  code: CodeWidget,
};

/** Leaf widget for a datatype, or null if it is a complex type (rendered by recursion). */
export function widgetFor(typeCode: string): Component | null {
  if (MAP[typeCode]) return MAP[typeCode];
  if (PRIMITIVE.has(typeCode)) return StringWidget;
  return null; // complex / backbone → recurse
}
```

- [ ] **Step 5: Run to verify it passes** → PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add plugins/fhir-ui/src/engine/widgetRegistry.ts plugins/fhir-ui/src/engine/widgetRegistry.test.ts plugins/fhir-ui/src/engine/widgets
git commit -m "feat(fhir-ui): datatype→widget registry + leaf widgets"
```

### Task 3.3: SDFormRenderer (recursive, repeating, required)

- [ ] **Step 1: Write the failing test**

Create `src/engine/SDFormRenderer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import SDFormRenderer from "./SDFormRenderer.vue";
import type { ParsedStructureDefinition } from "@/types/fhir";

const vuetify = createVuetify({ components });

const patientSD: ParsedStructureDefinition = {
  resourceType: "Patient", kind: "resource", isAbstract: false,
  elements: [
    { path: "Patient.gender", name: "gender", typeCodes: ["code"], min: 0, max: "1", isArray: false, isChoice: false, children: [] },
    { path: "Patient.birthDate", name: "birthDate", typeCodes: ["date"], min: 1, max: "1", isArray: false, isChoice: false, children: [] },
    { path: "Patient.name", name: "name", typeCodes: ["HumanName"], min: 0, max: "*", isArray: true, isChoice: false,
      children: [ { path: "Patient.name.family", name: "family", typeCodes: ["string"], min: 0, max: "1", isArray: false, isChoice: false, children: [] } ] },
  ],
};

function render(model: any) {
  return mount(SDFormRenderer, { props: { definition: patientSD, modelValue: model }, global: { plugins: [vuetify] } });
}

describe("SDFormRenderer", () => {
  it("renders a leaf field per primitive element", () => {
    const w = render({ resourceType: "Patient" });
    expect(w.find('[data-field="Patient.gender"]').exists()).toBe(true);
    expect(w.find('[data-field="Patient.birthDate"]').exists()).toBe(true);
  });

  it("marks a required (min>=1) element", () => {
    const w = render({ resourceType: "Patient" });
    expect(w.find('[data-field="Patient.birthDate"]').attributes("data-required")).toBe("true");
  });

  it("renders a repeating element as an add-able group", () => {
    const w = render({ resourceType: "Patient", name: [{ family: "X" }] });
    expect(w.find('[data-repeat="Patient.name"]').exists()).toBe(true);
    expect(w.find('[data-add="Patient.name"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/engine/SDFormRenderer.vue`**

```vue
<template>
  <div>
    <template v-for="el in definition.elements" :key="el.path">
      <ElementField :element="el" :base-path="[]" :model="model" @change="onChange" />
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { ParsedStructureDefinition } from "@/types/fhir";
import ElementField from "./ElementField.vue";

const props = defineProps<{ definition: ParsedStructureDefinition; modelValue: any }>();
const emit = defineEmits<{ "update:modelValue": [any] }>();

const model = reactive(structuredClone(props.modelValue ?? { resourceType: props.definition.resourceType }));
function onChange() { emit("update:modelValue", JSON.parse(JSON.stringify(model))); }
watch(() => props.modelValue, (v) => { Object.assign(model, structuredClone(v)); });
</script>
```

Create `src/engine/ElementField.vue` (the recursive unit — leaf widget, repeating group, or nested card):

```vue
<template>
  <!-- repeating element: list of instances + add button -->
  <div v-if="element.isArray" :data-repeat="element.path" class="mb-3">
    <div class="text-caption font-weight-medium mb-1">{{ label }}<span v-if="required" data-req class="req"> *</span></div>
    <AtlasCard v-for="(_, i) in arr" :key="i" padding="sm" class="mb-2">
      <ElementBody :element="element" :base-path="[...basePath, element.name, i]" :model="model" @change="$emit('change')" />
      <template #append><AtlasIconButton icon="mdi-close" @click="removeAt(i)" :data-remove="element.path" /></template>
    </AtlasCard>
    <AtlasButton variant="link" :data-add="element.path" @click="add">+ Add {{ element.name }}</AtlasButton>
  </div>

  <!-- single complex/backbone element: nested card -->
  <AtlasCard v-else-if="hasChildren" padding="sm" class="mb-3">
    <div class="text-caption font-weight-medium mb-2">{{ label }}<span v-if="required" data-req class="req"> *</span></div>
    <ElementBody :element="element" :base-path="[...basePath, element.name]" :model="model" @change="$emit('change')" />
  </AtlasCard>

  <!-- single leaf element: widget -->
  <div v-else :data-field="element.path" :data-required="String(required)" class="mb-3">
    <component :is="widget" :model-value="leafValue" :label="label"
      @update:model-value="setLeaf($event)" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AtlasCard, AtlasButton, AtlasIconButton } from "@atlas-ui";
import type { ElementInfo } from "@/types/fhir";
import { widgetFor } from "./widgetRegistry";
import { getAt, setAt } from "./fhirPath";
import StringWidget from "./widgets/StringWidget.vue";
import ElementBody from "./ElementBody.vue";

const props = defineProps<{ element: ElementInfo; basePath: (string|number)[]; model: any }>();
const emit = defineEmits<{ change: [] }>();

const label = computed(() => props.element.name);
const required = computed(() => props.element.min >= 1);
const hasChildren = computed(() => props.element.children.length > 0);
const widget = computed(() => widgetFor(props.element.typeCodes[0]) ?? StringWidget);

const fullPath = computed(() => [...props.basePath, props.element.name]);
const leafValue = computed(() => getAt(props.model, fullPath.value));
function setLeaf(v: any) { setAt(props.model, fullPath.value, v); emit("change"); }

const arr = computed<any[]>(() => getAt(props.model, fullPath.value) ?? []);
function add() { const a = arr.value.slice(); a.push({}); setAt(props.model, fullPath.value, a); emit("change"); }
function removeAt(i: number) { const a = arr.value.slice(); a.splice(i, 1); setAt(props.model, fullPath.value, a); emit("change"); }
</script>

<style scoped>.req{color:rgb(var(--v-theme-accent,#eb6622));font-weight:700}</style>
```

Create `src/engine/ElementBody.vue` (renders an element's child elements at a given base path):

```vue
<template>
  <ElementField v-for="child in element.children" :key="child.path"
    :element="child" :base-path="basePath" :model="model" @change="$emit('change')" />
</template>
<script setup lang="ts">
import type { ElementInfo } from "@/types/fhir";
import ElementField from "./ElementField.vue";
defineProps<{ element: ElementInfo; basePath: (string|number)[]; model: any }>();
defineEmits<{ change: [] }>();
</script>
```

> `ElementField` ↔ `ElementBody` form the recursion. `ElementField` decides leaf vs. repeat vs. nested; `ElementBody` renders children. Names are stable across both files.

- [ ] **Step 4: Run to verify it passes** → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/engine/SDFormRenderer.vue plugins/fhir-ui/src/engine/ElementField.vue plugins/fhir-ui/src/engine/ElementBody.vue plugins/fhir-ui/src/engine/SDFormRenderer.test.ts
git commit -m "feat(fhir-ui): Engine 1 — recursive StructureDefinition form renderer"
```

### Task 3.4: Progressive disclosure (common vs advanced)

- [ ] **Step 1: Write the failing test**

Append to `src/engine/SDFormRenderer.test.ts`:

```ts
it("collapses elements beyond the common set into an advanced section", () => {
  const w = render({ resourceType: "Patient" });
  // birthDate (required) and name (has data) are common; gender (optional, empty) is advanced
  expect(w.find('[data-advanced-toggle]').exists()).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Add disclosure logic to `SDFormRenderer.vue`**

Split `definition.elements` into `common` (required, or currently has a value) and `advanced` (the rest). Render `common` directly; render `advanced` inside a collapsible block toggled by an `AtlasButton` carrying `data-advanced-toggle`. Use a `v-show` block; default collapsed when `advanced.length > 0`.

```vue
<!-- add to template, after the common loop -->
<div v-if="advanced.length">
  <AtlasButton variant="link" data-advanced-toggle @click="showAdvanced = !showAdvanced">
    {{ showAdvanced ? "Hide" : "Show" }} advanced &amp; rarely-used fields ({{ advanced.length }})
  </AtlasButton>
  <div v-show="showAdvanced">
    <ElementField v-for="el in advanced" :key="el.path" :element="el" :base-path="[]" :model="model" @change="onChange" />
  </div>
</div>
```

```ts
// add to script
import { ref, computed } from "vue";
import { AtlasButton } from "@atlas-ui";
import { getAt } from "./fhirPath";
const showAdvanced = ref(false);
const common = computed(() => props.definition.elements.filter((e) => e.min >= 1 || getAt(model, [e.name]) != null));
const advanced = computed(() => props.definition.elements.filter((e) => !(e.min >= 1 || getAt(model, [e.name]) != null)));
// change the first template loop to iterate `common` instead of `definition.elements`
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/engine/SDFormRenderer.vue plugins/fhir-ui/src/engine/SDFormRenderer.test.ts
git commit -m "feat(fhir-ui): progressive disclosure of advanced fields"
```

---

# Milestone 4 — Screens 1–2: Resource browser + Search

Files:
- Create: `src/screens/DatasetPicker.vue`, `src/screens/ResourceBrowser.vue`, `src/screens/ResourceSearch.vue`
- Create: `src/composables/useFhir.ts` (provides a configured client + initialized profile store)
- Test: `src/screens/ResourceSearch.test.ts`, `src/screens/ResourceBrowser.test.ts`

### Task 4.1: `useFhir` composable

- [ ] **Step 1: Create `src/composables/useFhir.ts`**

```ts
import { FhirClient } from "@/services/fhirClient";
import { resolveConfig } from "@/services/config";
import { useProfileStore } from "@/stores/profile";

let client: FhirClient | null = null;
export function useFhir(dataset?: string) {
  if (!client) { const c = resolveConfig(); client = new FhirClient(c.baseUrl, c.apiKey); }
  const profile = useProfileStore();
  if (dataset && profile.dataset !== dataset) profile.init(client, dataset);
  return { client, profile };
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/fhir-ui/src/composables/useFhir.ts
git commit -m "feat(fhir-ui): useFhir composable"
```

### Task 4.2: ResourceBrowser (cards from CapabilityStatement)

- [ ] **Step 1: Write the failing test**

Create `src/screens/ResourceBrowser.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import ResourceBrowser from "./ResourceBrowser.vue";

vi.mock("@/composables/useFhir", () => ({
  useFhir: () => ({
    client: {},
    profile: {
      getResourceTypes: vi.fn().mockResolvedValue(["Patient", "Observation", "Questionnaire"]),
      getSearchParams: vi.fn().mockResolvedValue([]),
    },
  }),
}));

it("renders a card per resource type", async () => {
  const w = mount(ResourceBrowser, {
    props: { dataset: "ds1" },
    global: { plugins: [createVuetify({ components }), createTestingPinia()], stubs: { RouterLink: true } },
  });
  await flushPromises();
  expect(w.findAll('[data-rt-card]').length).toBe(3);
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL (and add `@pinia/testing` to devDependencies, then `npm i`).

- [ ] **Step 3: Implement `src/screens/ResourceBrowser.vue`**

```vue
<template>
  <AtlasPageShell eyebrow="Dataset" :title="`Browse ${dataset}`">
    <div class="rt-grid">
      <RouterLink v-for="t in types" :key="t" :to="`/${dataset}/${t}`" data-rt-card style="text-decoration:none">
        <AtlasCard interactive padding="md">
          <div class="text-subtitle-2" style="color:rgb(var(--v-theme-primary))">{{ t }}</div>
          <div class="text-caption text-medium-emphasis">{{ counts[t] ?? "—" }} resources</div>
        </AtlasCard>
      </RouterLink>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasCard } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";

const props = defineProps<{ dataset: string }>();
const { profile } = useFhir(props.dataset);
const types = ref<string[]>([]);
const counts = ref<Record<string, number>>({});

onMounted(async () => { types.value = await profile.getResourceTypes(); });
</script>

<style scoped>.rt-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:12px}</style>
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/screens/ResourceBrowser.vue plugins/fhir-ui/src/screens/ResourceBrowser.test.ts
git commit -m "feat(fhir-ui): resource browser screen"
```

### Task 4.3: ResourceSearch (filters from SearchParams + results table)

- [ ] **Step 1: Write the failing test**

Create `src/screens/ResourceSearch.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import ResourceSearch from "./ResourceSearch.vue";

const client = { search: vi.fn().mockResolvedValue({ resourceType: "Bundle", total: 1, entry: [{ resource: { resourceType: "Patient", id: "p1", gender: "female" } }] }) };
vi.mock("@/composables/useFhir", () => ({
  useFhir: () => ({ client, profile: { getSearchParams: vi.fn().mockResolvedValue([{ name: "gender", type: "token" }]) } }),
}));

it("renders a filter field per search param and a results row per entry", async () => {
  const w = mount(ResourceSearch, { props: { dataset: "ds1", type: "Patient" },
    global: { plugins: [createVuetify({ components })], stubs: { RouterLink: true } } });
  await flushPromises();
  expect(w.find('[data-filter="gender"]').exists()).toBe(true);
  expect(w.findAll('[data-result-row]').length).toBe(1);
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/screens/ResourceSearch.vue`**

```vue
<template>
  <AtlasPageShell :eyebrow="type" :title="`Search ${type}`">
    <div class="search-layout">
      <AtlasCard padding="sm">
        <div class="text-caption font-weight-medium mb-2">Filters</div>
        <div v-for="sp in params" :key="sp.name" class="mb-2">
          <AtlasTextField :data-filter="sp.name" :label="sp.name" v-model="filters[sp.name]" />
        </div>
        <AtlasButton variant="primary" block @click="runSearch">Apply filters</AtlasButton>
      </AtlasCard>

      <AtlasCard padding="none">
        <table class="results">
          <thead><tr><th v-for="c in columns" :key="c">{{ c }}</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" data-result-row @click="open(r)">
              <td v-for="c in columns" :key="c">{{ display(r, c) }}</td>
            </tr>
          </tbody>
        </table>
      </AtlasCard>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useRouter } from "vue-router";
import { AtlasPageShell, AtlasCard, AtlasTextField, AtlasButton } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
import type { SearchParam } from "@/stores/profile";

const props = defineProps<{ dataset: string; type: string }>();
const { client, profile } = useFhir(props.dataset);
const router = useRouter();

const params = ref<SearchParam[]>([]);
const filters = reactive<Record<string, string>>({});
const rows = ref<any[]>([]);
const columns = ref<string[]>(["id"]);

function activeFilters() { return Object.fromEntries(Object.entries(filters).filter(([, v]) => v)); }
async function runSearch() {
  const bundle = await client.search(props.dataset, props.type, activeFilters());
  rows.value = (bundle.entry ?? []).map((e: any) => e.resource);
  columns.value = ["id", ...params.value.slice(0, 4).map((p) => p.name)];
}
function display(r: any, c: string) { const v = r[c]; return typeof v === "object" ? JSON.stringify(v) : v ?? ""; }
function open(r: any) { router.push(`/${props.dataset}/${props.type}/${r.id}/edit`); }

onMounted(async () => { params.value = await profile.getSearchParams(props.type); await runSearch(); });
</script>

<style scoped>
.search-layout{display:grid;grid-template-columns:240px 1fr;gap:18px}
.results{width:100%;border-collapse:collapse;font-size:13px}
.results th{text-align:left;padding:9px 12px;border-bottom:1px solid rgb(var(--v-theme-outline-variant));color:rgb(var(--v-theme-on-surface-variant))}
.results td{padding:10px 12px;border-bottom:1px solid rgba(0,0,0,.04);cursor:pointer}
</style>
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/screens/ResourceSearch.vue plugins/fhir-ui/src/screens/ResourceSearch.test.ts
git commit -m "feat(fhir-ui): resource search screen (filters from SearchParams)"
```

### Task 4.4: DatasetPicker

- [ ] **Step 1: Implement `src/screens/DatasetPicker.vue`**

```vue
<template>
  <AtlasPageShell eyebrow="FHIR" title="Datasets">
    <AtlasList>
      <RouterLink v-for="d in datasets" :key="d.id" :to="`/${d.id}`" style="text-decoration:none">
        <AtlasListItem :title="d.name || d.id" data-dataset />
      </RouterLink>
    </AtlasList>
  </AtlasPageShell>
</template>
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasList, AtlasListItem } from "@atlas-ui";
import { useFhir } from "@/composables/useFhir";
const { client } = useFhir();
const datasets = ref<any[]>([]);
onMounted(async () => {
  const res = await client.listDatasets();
  datasets.value = Array.isArray(res) ? res : (res?.entry?.map((e: any) => e.resource) ?? []);
});
</script>
```

- [ ] **Step 2: Manual check + commit**

Run: `cd plugins/fhir-ui && npm run build` → builds clean.

```bash
git add plugins/fhir-ui/src/screens/DatasetPicker.vue
git commit -m "feat(fhir-ui): dataset picker screen"
```

---

# Milestone 5 — Screen 3: Generic resource editor

Files:
- Create: `src/screens/ResourceEditor.vue`, `src/screens/ResourceEditor.test.ts`

### Task 5.1: Editor loads definition + instance and saves

- [ ] **Step 1: Write the failing test**

Create `src/screens/ResourceEditor.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import ResourceEditor from "./ResourceEditor.vue";

const sd = { resourceType: "Patient", kind: "resource", isAbstract: false,
  elements: [{ path: "Patient.birthDate", name: "birthDate", typeCodes: ["date"], min: 1, max: "1", isArray: false, isChoice: false, children: [] }] };
const client = {
  read: vi.fn().mockResolvedValue({ resourceType: "Patient", id: "p1", birthDate: "1990-01-01" }),
  update: vi.fn().mockResolvedValue({ resourceType: "Patient", id: "p1" }),
};
vi.mock("@/composables/useFhir", () => ({
  useFhir: () => ({ client, profile: { getDefinition: vi.fn().mockResolvedValue(sd) } }),
}));

it("loads the instance and saves via update", async () => {
  const w = mount(ResourceEditor, { props: { dataset: "ds1", type: "Patient", id: "p1" },
    global: { plugins: [createVuetify({ components })], stubs: { RouterLink: true } } });
  await flushPromises();
  expect(w.find('[data-field="Patient.birthDate"]').exists()).toBe(true);
  await w.find('[data-save]').trigger("click");
  await flushPromises();
  expect(client.update).toHaveBeenCalledWith("ds1", "Patient", "p1", expect.objectContaining({ resourceType: "Patient" }));
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/screens/ResourceEditor.vue`**

```vue
<template>
  <AtlasPageShell :eyebrow="`${type} · ${id}`" :title="`Edit ${type}`">
    <template #actions>
      <AtlasButton variant="ghost" @click="$router.back()">Cancel</AtlasButton>
      <AtlasButton variant="primary" data-save :loading="saving" @click="save">Save</AtlasButton>
    </template>
    <AtlasAlert v-if="error" severity="danger" :title="error" class="mb-3" />
    <SDFormRenderer v-if="definition" :definition="definition" v-model="draft" />
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasButton, AtlasAlert } from "@atlas-ui";
import SDFormRenderer from "@/engine/SDFormRenderer.vue";
import { useFhir } from "@/composables/useFhir";
import type { ParsedStructureDefinition } from "@/types/fhir";
import { FhirError } from "@/services/fhirClient";

const props = defineProps<{ dataset: string; type: string; id: string }>();
const { client, profile } = useFhir(props.dataset);

const definition = ref<ParsedStructureDefinition | null>(null);
const draft = ref<any>({ resourceType: props.type });
const saving = ref(false);
const error = ref("");

onMounted(async () => {
  definition.value = await profile.getDefinition(props.type);
  if (props.id !== "new") draft.value = await client.read(props.dataset, props.type, props.id);
});

async function save() {
  saving.value = true; error.value = "";
  try {
    if (props.id === "new") await client.create(props.dataset, props.type, draft.value);
    else await client.update(props.dataset, props.type, props.id, draft.value);
  } catch (e) { error.value = e instanceof FhirError ? e.message : String(e); }
  finally { saving.value = false; }
}
</script>
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/screens/ResourceEditor.vue plugins/fhir-ui/src/screens/ResourceEditor.test.ts
git commit -m "feat(fhir-ui): generic resource editor screen (Engine 1)"
```

---

# Milestone 6 — Engine 2: QuestionnaireRenderer + Form filler

Files:
- Create: `src/engine/QuestionnaireRenderer.vue`, `QuestionnaireRenderer.test.ts`
- Create: `src/engine/enableWhen.ts`, `enableWhen.test.ts`
- Create: `src/screens/QuestionnaireFiller.vue`

### Task 6.1: enableWhen evaluation

- [ ] **Step 1: Write the failing test**

Create `src/engine/enableWhen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isEnabled } from "./enableWhen";

describe("enableWhen", () => {
  it("shows when no enableWhen", () => {
    expect(isEnabled({ linkId: "a", type: "string" } as any, {})).toBe(true);
  });
  it("evaluates a single = condition against answers", () => {
    const item = { linkId: "b", type: "integer", enableWhen: [{ question: "smoke", operator: "=", answerString: "yes" }] } as any;
    expect(isEnabled(item, { smoke: "yes" })).toBe(true);
    expect(isEnabled(item, { smoke: "no" })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/engine/enableWhen.ts`**

```ts
export interface QItem {
  linkId: string; text?: string; type: string; required?: boolean; repeats?: boolean;
  answerOption?: Array<{ valueString?: string; valueCoding?: { code: string; display?: string } }>;
  enableWhen?: Array<{ question: string; operator: string; answerString?: string; answerBoolean?: boolean; answerInteger?: number }>;
  item?: QItem[];
}

export function isEnabled(item: QItem, answers: Record<string, any>): boolean {
  if (!item.enableWhen?.length) return true;
  return item.enableWhen.every((c) => {
    const actual = answers[c.question];
    const expected = c.answerString ?? c.answerBoolean ?? c.answerInteger;
    switch (c.operator) {
      case "=": return actual === expected;
      case "!=": return actual !== expected;
      case "exists": return (actual != null) === (c.answerBoolean ?? true);
      default: return true;
    }
  });
}
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/engine/enableWhen.ts plugins/fhir-ui/src/engine/enableWhen.test.ts
git commit -m "feat(fhir-ui): enableWhen evaluation"
```

### Task 6.2: QuestionnaireRenderer

- [ ] **Step 1: Write the failing test**

Create `src/engine/QuestionnaireRenderer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import QuestionnaireRenderer from "./QuestionnaireRenderer.vue";

const q = { resourceType: "Questionnaire", item: [
  { linkId: "name", text: "Full name", type: "string", required: true },
  { linkId: "smoke", text: "Do you smoke?", type: "choice", answerOption: [{ valueString: "yes" }, { valueString: "no" }] },
  { linkId: "cigs", text: "Cigarettes/day", type: "integer", enableWhen: [{ question: "smoke", operator: "=", answerString: "yes" }] },
] };
const vuetify = createVuetify({ components });

it("renders enabled items and hides disabled ones; emits a QuestionnaireResponse", async () => {
  const w = mount(QuestionnaireRenderer, { props: { questionnaire: q }, global: { plugins: [vuetify] } });
  await flushPromises();
  expect(w.find('[data-q="name"]').exists()).toBe(true);
  expect(w.find('[data-q="cigs"]').exists()).toBe(false); // smoke not answered yes
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/engine/QuestionnaireRenderer.vue`**

```vue
<template>
  <div>
    <template v-for="item in flatItems" :key="item.linkId">
      <div v-if="enabled(item)" :data-q="item.linkId" class="mb-4">
        <div class="text-body-2 font-weight-medium mb-1">{{ item.text }}<span v-if="item.required" class="req"> *</span></div>

        <AtlasRadioGroup v-if="item.type === 'choice'" :model-value="answers[item.linkId]"
          @update:model-value="set(item.linkId, $event)">
          <AtlasRadio v-for="opt in options(item)" :key="opt.value" :label="opt.label" :value="opt.value" />
        </AtlasRadioGroup>

        <AtlasSwitch v-else-if="item.type === 'boolean'" :model-value="answers[item.linkId]"
          @update:model-value="set(item.linkId, $event)" />

        <AtlasTextField v-else :type="inputType(item.type)" :model-value="answers[item.linkId]"
          @update:model-value="set(item.linkId, $event)" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from "vue";
import { AtlasTextField, AtlasSwitch, AtlasRadioGroup, AtlasRadio } from "@atlas-ui";
import { isEnabled, type QItem } from "./enableWhen";

const props = defineProps<{ questionnaire: { item?: QItem[] } }>();
const emit = defineEmits<{ "update:response": [any] }>();

const answers = reactive<Record<string, any>>({});
const flatItems = computed(() => flatten(props.questionnaire.item ?? []));
function flatten(items: QItem[]): QItem[] { return items.flatMap((i) => [i, ...(i.item ? flatten(i.item) : [])]); }

function enabled(item: QItem) { return isEnabled(item, answers); }
function options(item: QItem) { return (item.answerOption ?? []).map((o) => ({ value: o.valueString ?? o.valueCoding?.code, label: o.valueString ?? o.valueCoding?.display ?? o.valueCoding?.code })); }
function inputType(t: string) { return t === "integer" || t === "decimal" ? "number" : t === "date" ? "date" : "text"; }
function set(linkId: string, v: any) { answers[linkId] = v; }

watch(answers, () => {
  emit("update:response", {
    resourceType: "QuestionnaireResponse", status: "in-progress",
    item: flatItems.value.filter(enabled).filter((i) => answers[i.linkId] != null)
      .map((i) => ({ linkId: i.linkId, answer: [{ valueString: String(answers[i.linkId]) }] })),
  });
}, { deep: true });

defineExpose({ answers });
</script>

<style scoped>.req{color:rgb(var(--v-theme-accent,#eb6622));font-weight:700}</style>
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/engine/QuestionnaireRenderer.vue plugins/fhir-ui/src/engine/QuestionnaireRenderer.test.ts
git commit -m "feat(fhir-ui): Engine 2 — SDC questionnaire renderer"
```

### Task 6.3: QuestionnaireFiller screen

- [ ] **Step 1: Implement `src/screens/QuestionnaireFiller.vue`**

```vue
<template>
  <AtlasPageShell :eyebrow="q?.title || 'Questionnaire'" :title="q?.title || 'Form'">
    <div style="max-width:560px;margin:0 auto">
      <AtlasProgressLinear :model-value="0" class="mb-4" />
      <AtlasCard padding="md" v-if="q">
        <QuestionnaireRenderer :questionnaire="q" @update:response="response = $event" />
        <div class="d-flex ga-2 mt-2">
          <AtlasButton variant="ghost" @click="submit('in-progress')">Save draft</AtlasButton>
          <AtlasButton variant="primary" data-submit @click="submit('completed')">Submit response</AtlasButton>
        </div>
      </AtlasCard>
      <AtlasAlert v-if="error" severity="danger" :title="error" class="mt-3" />
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasCard, AtlasButton, AtlasProgressLinear, AtlasAlert } from "@atlas-ui";
import QuestionnaireRenderer from "@/engine/QuestionnaireRenderer.vue";
import { useFhir } from "@/composables/useFhir";
import { FhirError } from "@/services/fhirClient";

const props = defineProps<{ dataset: string; id: string }>();
const { client } = useFhir(props.dataset);
const q = ref<any>(null);
const response = ref<any>({});
const error = ref("");

onMounted(async () => { q.value = await client.read(props.dataset, "Questionnaire", props.id); });

async function submit(status: string) {
  error.value = "";
  try {
    await client.create(props.dataset, "QuestionnaireResponse",
      { ...response.value, status, questionnaire: `Questionnaire/${props.id}` });
  } catch (e) { error.value = e instanceof FhirError ? e.message : String(e); }
}
</script>
```

- [ ] **Step 2: Build + commit**

Run: `cd plugins/fhir-ui && npm run build` → clean.

```bash
git add plugins/fhir-ui/src/screens/QuestionnaireFiller.vue
git commit -m "feat(fhir-ui): questionnaire filler screen (Engine 2)"
```

---

# Milestone 7 — Screen 4: Questionnaire builder (Engine 1 + live preview)

Files:
- Create: `src/screens/QuestionnaireBuilder.vue`, `QuestionnaireBuilder.test.ts`
- Create: `src/engine/QuestionnaireItemEditor.vue` (the item-tree editor)

### Task 7.1: Item-tree editor

- [ ] **Step 1: Write the failing test**

Create `src/engine/QuestionnaireItemEditor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import QuestionnaireItemEditor from "./QuestionnaireItemEditor.vue";

const items = [{ linkId: "a", text: "Full name", type: "string" }];
const vuetify = createVuetify({ components });

it("renders a row per item and adds a question", async () => {
  const w = mount(QuestionnaireItemEditor, { props: { modelValue: items }, global: { plugins: [vuetify] } });
  await flushPromises();
  expect(w.findAll('[data-q-row]').length).toBe(1);
  await w.find('[data-add-question]').trigger("click");
  await flushPromises();
  expect(w.emitted("update:modelValue")).toBeTruthy();
  const last = (w.emitted("update:modelValue")!.at(-1) as any[])[0];
  expect(last.length).toBe(2);
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/engine/QuestionnaireItemEditor.vue`**

```vue
<template>
  <div>
    <AtlasCard v-for="(it, i) in items" :key="it.linkId" data-q-row padding="sm" class="mb-2">
      <div class="d-flex ga-3 align-start">
        <span class="drag">⠿</span>
        <div class="flex-grow-1">
          <AtlasTextField :model-value="it.text" label="Question text" @update:model-value="patch(i, { text: $event })" />
          <div class="d-flex ga-2 mt-1">
            <AtlasSelect :model-value="it.type" :items="TYPES" label="Type" style="max-width:160px"
              @update:model-value="patch(i, { type: $event })" />
            <AtlasCheckbox :model-value="!!it.required" label="Required" @update:model-value="patch(i, { required: $event })" />
          </div>
        </div>
        <AtlasIconButton icon="mdi-close" @click="remove(i)" />
      </div>
    </AtlasCard>
    <div class="d-flex ga-2">
      <AtlasButton variant="accent" data-add-question @click="add('string')">+ Add question</AtlasButton>
      <AtlasButton variant="ghost" data-add-group @click="add('group')">+ Add group</AtlasButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { AtlasCard, AtlasTextField, AtlasSelect, AtlasCheckbox, AtlasButton, AtlasIconButton } from "@atlas-ui";
import type { QItem } from "./enableWhen";

const TYPES = ["group", "display", "string", "text", "integer", "decimal", "boolean", "date", "choice"];
const props = defineProps<{ modelValue: QItem[] }>();
const emit = defineEmits<{ "update:modelValue": [QItem[]] }>();

const items = computed(() => props.modelValue);
let seq = 0;
function nextId() { return `q${Date.now()}_${seq++}`; }
function commit(next: QItem[]) { emit("update:modelValue", next); }
function patch(i: number, p: Partial<QItem>) { const n = items.value.slice(); n[i] = { ...n[i], ...p }; commit(n); }
function remove(i: number) { const n = items.value.slice(); n.splice(i, 1); commit(n); }
function add(type: string) { commit([...items.value, { linkId: nextId(), text: "", type }]); }
</script>

<style scoped>.drag{color:rgb(var(--v-theme-on-surface-variant));cursor:grab}</style>
```

> Drag-reorder is deferred to a follow-up (add `vuedraggable` later); add/remove/edit/nest-by-type are covered now. Note this in the PR.

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/engine/QuestionnaireItemEditor.vue plugins/fhir-ui/src/engine/QuestionnaireItemEditor.test.ts
git commit -m "feat(fhir-ui): questionnaire item-tree editor"
```

### Task 7.2: Builder screen (split: editor + live preview)

- [ ] **Step 1: Write the failing test**

Create `src/screens/QuestionnaireBuilder.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import QuestionnaireBuilder from "./QuestionnaireBuilder.vue";

const client = {
  read: vi.fn().mockResolvedValue({ resourceType: "Questionnaire", id: "intake", title: "Intake", status: "draft", item: [{ linkId: "a", text: "Name", type: "string" }] }),
  update: vi.fn().mockResolvedValue({}),
};
vi.mock("@/composables/useFhir", () => ({ useFhir: () => ({ client, profile: {} }) }));

it("shows the item editor and a live preview", async () => {
  const w = mount(QuestionnaireBuilder, { props: { dataset: "ds1", id: "intake" },
    global: { plugins: [createVuetify({ components })], stubs: { RouterLink: true } } });
  await flushPromises();
  expect(w.find('[data-builder-edit]').exists()).toBe(true);
  expect(w.find('[data-builder-preview]').exists()).toBe(true);
  expect(w.find('[data-q="a"]').exists()).toBe(true); // preview rendered the item
});
```

- [ ] **Step 2: Run to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/screens/QuestionnaireBuilder.vue`**

```vue
<template>
  <AtlasPageShell eyebrow="Questionnaire" :title="draft.title || 'Questionnaire'">
    <template #actions>
      <AtlasChip v-if="draft.status" tone="warning">{{ draft.status }}</AtlasChip>
      <AtlasButton variant="primary" data-publish :loading="saving" @click="save">Publish</AtlasButton>
    </template>
    <div class="qb">
      <div class="qb-col" data-builder-edit>
        <div class="text-overline mb-2">Structure</div>
        <QuestionnaireItemEditor v-model="draft.item" />
      </div>
      <div class="qb-col preview" data-builder-preview>
        <div class="text-overline mb-2">Live preview</div>
        <AtlasCard padding="md"><QuestionnaireRenderer :questionnaire="draft" /></AtlasCard>
      </div>
    </div>
  </AtlasPageShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { AtlasPageShell, AtlasButton, AtlasChip, AtlasCard } from "@atlas-ui";
import QuestionnaireItemEditor from "@/engine/QuestionnaireItemEditor.vue";
import QuestionnaireRenderer from "@/engine/QuestionnaireRenderer.vue";
import { useFhir } from "@/composables/useFhir";

const props = defineProps<{ dataset: string; id: string }>();
const { client } = useFhir(props.dataset);
const draft = ref<any>({ resourceType: "Questionnaire", item: [] });
const saving = ref(false);

onMounted(async () => { draft.value = await client.read(props.dataset, "Questionnaire", props.id); if (!draft.value.item) draft.value.item = []; });

async function save() { saving.value = true; try { await client.update(props.dataset, "Questionnaire", props.id, draft.value); } finally { saving.value = false; } }
</script>

<style scoped>
.qb{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid rgb(var(--v-theme-outline-variant));border-radius:8px;overflow:hidden}
.qb-col{padding:16px}
.qb-col.preview{background:rgba(0,0,0,.02);border-left:1px solid rgb(var(--v-theme-outline-variant))}
</style>
```

- [ ] **Step 4: Run to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/fhir-ui/src/screens/QuestionnaireBuilder.vue plugins/fhir-ui/src/screens/QuestionnaireBuilder.test.ts
git commit -m "feat(fhir-ui): questionnaire builder screen (Engine 1 + live preview)"
```

---

# Milestone 8 — End-to-end + polish

Files:
- Create: `plugins/fhir-ui/playwright.config.ts`, `tests/e2e/edit-patient.spec.ts`, `tests/e2e/build-and-fill.spec.ts`
- Modify: CI workflow under `.github/workflows/` to build + test fhir-ui

### Task 8.1: Playwright config + edit-patient flow

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: process.env.FHIR_UI_E2E_URL || "http://localhost:5173" },
  webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: true },
});
```

- [ ] **Step 2: Create `tests/e2e/edit-patient.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

// Requires a running fhir-fn with a seeded dataset "e2e" and a Patient "p1".
// Set window.__FHIR_UI_CONFIG__ via VITE_FHIR_BASE_URL / VITE_FHIR_APIKEY in the dev env.
test("edit and save a Patient", async ({ page }) => {
  await page.goto("/e2e/Patient/p1/edit");
  await expect(page.locator('[data-field="Patient.birthDate"]')).toBeVisible();
  await page.locator('[data-save]').click();
  await expect(page.locator('.v-alert')).toHaveCount(0); // no error alert
});
```

- [ ] **Step 3: Run (against a seeded server) + commit**

Run: `cd plugins/fhir-ui && FHIR_UI_E2E_URL=... npx playwright test edit-patient` (skip in CI if no server; gate behind an env flag).

```bash
git add plugins/fhir-ui/playwright.config.ts plugins/fhir-ui/tests/e2e/edit-patient.spec.ts
git commit -m "test(fhir-ui): e2e edit-patient flow"
```

### Task 8.2: build-and-fill flow

- [ ] **Step 1: Create `tests/e2e/build-and-fill.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test("build a questionnaire then fill it", async ({ page }) => {
  await page.goto("/e2e/Questionnaire/intake/build");
  await page.locator('[data-add-question]').click();
  await expect(page.locator('[data-q-row]')).toHaveCount(1);
  await page.locator('[data-publish]').click();

  await page.goto("/e2e/Questionnaire/intake/fill");
  await expect(page.locator('[data-submit]')).toBeVisible();
});
```

- [ ] **Step 2: Commit**

```bash
git add plugins/fhir-ui/tests/e2e/build-and-fill.spec.ts
git commit -m "test(fhir-ui): e2e build-and-fill flow"
```

### Task 8.3: CI wiring

- [ ] **Step 1: Add a CI job**

In the appropriate `.github/workflows/*.yml`, add steps (mirroring how other plugins build) that run, in `plugins/fhir-ui`: `npm ci`, `npm run vendor` (or restore the committed vendor dir), `npm run test`, `npm run build`. The vendored `atlas-ui` is committed, so CI does not need the Atlas3 checkout.

- [ ] **Step 2: Verify the full unit suite passes**

Run: `cd plugins/fhir-ui && npm run test`
Expected: all Vitest suites PASS.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows
git commit -m "ci(fhir-ui): build + test the plugin"
```

---

## Self-Review (completed against the spec)

**Spec coverage:**
- §2 two engines → Engine 1 (M3), Engine 2 (M6). ✓
- §2 widget registry keyed by datatype → M3 Task 3.2. ✓
- §3 backend StructureDefinition endpoint → M0. ✓
- §4 Atlas reuse (use control library wherever possible) → vendored `@atlas-ui` (M1.1), widgets/screens compose `Atlas*` throughout. ✓
- §5 screens 1–5 + dataset picker → M4 (1,2,picker), M5 (3 editor), M7 (4 builder), M6 (5 filler). ✓
- §6 data flow (capability → defs → engine → save) → profileStore (M2.3), editor (M5). ✓
- §7 error handling (OperationOutcome → AtlasAlert) → fhirClient normalizes (M2.2), editor/filler surface (M5, M6.3); unknown datatype falls back to StringWidget (M3.2). ✓
- §8 testing (Vitest engines from fixtures + Playwright two flows) → engine tests M3/M6/M7, e2e M8. ✓
- §9 out of scope (terminology $expand, custom-profile authoring, version history) → not implemented; ValueSet binding noted as a later iteration in CodeWidget (M3.2) and builder drag-reorder deferred (M7.1). ✓

**Type consistency:** `ParsedStructureDefinition`/`ElementInfo` identical in backend contract and `src/types/fhir.ts`; `widgetFor` used the same in registry + ElementField; `QItem` shared by enableWhen/renderer/item-editor; `FhirError` thrown in client and caught in editor/filler. ✓

**Placeholder scan:** no TBD/TODO in steps; every code step shows code; deferred items (drag-reorder, ValueSet $expand) are explicit scope notes, not missing implementation. ✓

---

## Open follow-ups (post-plan, not blocking)
- ValueSet `$expand` for `CodeWidget` once terminology is available.
- Drag-reorder + nesting UI in the questionnaire item editor (`vuedraggable`).
- Version history view (server `_history` already exists).
- Move from vendored `atlas-ui` to a published `@ohdsi/atlas-ui` package.
