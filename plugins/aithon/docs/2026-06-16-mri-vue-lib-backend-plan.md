# MRI-vue-lib Analytics Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-contained TypeScript Deno function in `plugins/aithon` that serves the mri-vue-lib HTTP contract (config + patientcount + stratified barchart) by auto-generating an MRI config from the dataset's FHIR resources and compiling an IFR→ELM→SQL query against the existing DuckDB FHIR tables.

**Architecture:** New sibling function dir `plugins/aithon/functions-mri/`, mounted at `/analytics-svc` via a second `trex.functions.api` entry. Request flow: decode `mriquery` (base64+zlib) → IFR model → ELM IR (filter retrieves + stratification axes) → SQL (via a bounded TS compiler that mirrors `plugins/fhir/src/cql/compiler.rs` idioms) → execute via `withConnection` on the same per-dataset DuckDB schema → post-process into MRI response shapes. d2e and the existing aithon FHIR function are untouched.

**Tech Stack:** Deno (TypeScript, `// @ts-nocheck`), DuckDB JSON functions (`json_extract_string`), `std/assert` Deno tests, `std/encoding` + `DecompressionStream` for zlib. Reuses `functions/fhir/resource_registry.ts`, `functions/sql_safety.ts`, and the `withConnection`/`Conn` pattern from `functions/db.ts`.

---

## Conventions (read once)

- **Test runner** (from `plugins/aithon/`): `deno test --allow-read test/<file>` (the root `deno.json` provides the `std/` import map). Pure-logic tests need no flags; tests that read the FHIR data files need `--allow-read`.
- **Test file location:** `plugins/aithon/test/`, named `mri_*_test.ts`, importing from `../functions-mri/...` and `std/assert/mod.ts`.
- **Every new source file** starts with `// @ts-nocheck - Deno edge function`.
- **SQL string-building only** (DuckDB params are not used here); escape every interpolated literal with `escapeString` from `../functions/sql_safety.ts`.
- **Schema reference:** `toQualifiedSchema(dbName, datasetId)` → `"memory"."ds1"`; tables are lowercase resource names with columns `_raw` (JSON), `_is_deleted` (BOOL), `id` (VARCHAR).
- **JSON extraction idiom:** `json_extract_string(<alias>._raw, '$.path')`.
- **Patient linkage idiom:** a non-Patient resource links to its patient via `json_extract_string(c._raw,'$.subject.reference') LIKE '%/' || p.id`.
- **Commit after every task** (frequent commits). Branch is `feat/mri-vue-lib-backend`.

---

## File structure

| File | Responsibility |
|---|---|
| `functions-mri/index.ts` | `Deno.serve` entry; exports `handle(req)` |
| `functions-mri/router.ts` | parse MRI URLs → dispatch |
| `functions-mri/state.ts` | cached `AppState` (registry, dbName, mount prefix helpers) |
| `functions-mri/db.ts` | re-export `withConnection`, `Conn` from the existing function |
| `functions-mri/mriquery/decode.ts` | base64+zlib → IFR object |
| `functions-mri/ifr/types.ts` | IFR TypeScript types |
| `functions-mri/config/mapping.ts` | `AttrMapping` / `ConfigMapping` types + curated table |
| `functions-mri/config/generate.ts` | FHIR registry → `{ mriConfig, mapping }` |
| `functions-mri/elm/types.ts` | ELM IR types (`ElmExpr`, `ElmRetrieve`, `ElmAxis`, `ElmQuery`) |
| `functions-mri/ifr/to_elm.ts` | IFR + mapping → `ElmQuery` |
| `functions-mri/elm/compiler.ts` | `ElmQuery` → SQL (count + stratified) |
| `functions-mri/handlers/config.ts` | `getMyConfig`/`getMyConfigList`/`getFrontendConfig` |
| `functions-mri/handlers/patientcount.ts` | patientcount endpoint |
| `functions-mri/handlers/barchart.ts` | barchart endpoint + post-processing |
| `functions-mri/postprocess/barchart.ts` | fill-missing-combos + response assembly |
| `package.json` | add the `/analytics-svc` api mount |

---

## Phase 1 — Scaffold function, routing, manifest mount

### Task 1: Manifest mount + function entrypoint

**Files:**
- Modify: `plugins/aithon/package.json:24-26`
- Create: `plugins/aithon/functions-mri/db.ts`
- Create: `plugins/aithon/functions-mri/state.ts`
- Create: `plugins/aithon/functions-mri/router.ts`
- Create: `plugins/aithon/functions-mri/index.ts`
- Test: `plugins/aithon/test/mri_router_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_router_test.ts
// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { parseMriRoute } from "../functions-mri/router.ts";

Deno.test("parseMriRoute: getMyConfig action", () => {
  assertEquals(parseMriRoute("GET", "/analytics-svc/pa/services/analytics.xsjs", new URLSearchParams("action=getMyConfig&datasetId=ds1")), {
    kind: "getMyConfig",
    datasetId: "ds1",
  });
});

Deno.test("parseMriRoute: patientcount", () => {
  assertEquals(parseMriRoute("GET", "/analytics-svc/api/services/population/json/patientcount", new URLSearchParams("mriquery=abc")), {
    kind: "patientcount",
  });
});

Deno.test("parseMriRoute: barchart", () => {
  assertEquals(parseMriRoute("GET", "/analytics-svc/api/services/population/json/barchart", new URLSearchParams()), {
    kind: "barchart",
  });
});

Deno.test("parseMriRoute: unknown → notFound", () => {
  assertEquals(parseMriRoute("GET", "/analytics-svc/nope", new URLSearchParams()).kind, "notFound");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_router_test.ts`
Expected: FAIL — `Module not found "../functions-mri/router.ts"`.

- [ ] **Step 3: Create db.ts and state.ts**

```ts
// plugins/aithon/functions-mri/db.ts
// @ts-nocheck - Deno edge function
export { withConnection } from "../functions/db.ts";
export type { Conn } from "../functions/db.ts";
```

```ts
// plugins/aithon/functions-mri/state.ts
// @ts-nocheck - Deno edge function
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";

export interface MriState {
  registry: ResourceRegistry;
  dbName: string;
}

let cached: Promise<MriState> | null = null;

export function getMriState(): Promise<MriState> {
  if (cached === null) {
    cached = (async (): Promise<MriState> => {
      const registry = await ResourceRegistry.loadDefault();
      const dbName = Deno.env.get("FHIR_DB_NAME") ?? "memory";
      return { registry, dbName };
    })();
  }
  return cached;
}

/** Strip everything up to and including the "/analytics-svc" mount segment. */
export function stripMriMount(pathname: string): string {
  const m = pathname.match(/^(?:\/[^/]+)*?\/analytics-svc(?=\/|$)/);
  const prefix = m ? m[0] : "";
  return pathname.slice(prefix.length) || "/";
}
```

- [ ] **Step 4: Create router.ts (parse only; dispatch stub)**

```ts
// plugins/aithon/functions-mri/router.ts
// @ts-nocheck - Deno edge function
import { stripMriMount } from "./state.ts";

export type MriRoute =
  | { kind: "getMyConfig"; datasetId: string }
  | { kind: "getMyConfigList"; datasetId: string }
  | { kind: "getFrontendConfig"; configId: string; configVersion: string }
  | { kind: "patientcount" }
  | { kind: "barchart" }
  | { kind: "notFound" };

export function parseMriRoute(method: string, pathname: string, q: URLSearchParams): MriRoute {
  const m = method.toUpperCase();
  const p = stripMriMount(pathname);

  if (m === "GET" && p === "/pa/services/analytics.xsjs") {
    const action = q.get("action") ?? "";
    if (action === "getMyConfig") return { kind: "getMyConfig", datasetId: q.get("datasetId") ?? "" };
    if (action === "getMyConfigList") return { kind: "getMyConfigList", datasetId: q.get("datasetId") ?? "" };
    if (action === "getFrontendConfig") {
      return { kind: "getFrontendConfig", configId: q.get("configId") ?? "", configVersion: q.get("configVersion") ?? "" };
    }
    return { kind: "notFound" };
  }

  if (p === "/api/services/population/json/patientcount") return { kind: "patientcount" };
  if (p === "/api/services/population/json/barchart") return { kind: "barchart" };

  return { kind: "notFound" };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `deno test test/mri_router_test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Create index.ts and add the manifest mount**

```ts
// plugins/aithon/functions-mri/index.ts
// @ts-nocheck - Deno edge function
import { getMriState } from "./state.ts";
import { parseMriRoute } from "./router.ts";

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = parseMriRoute(req.method, url.pathname, url.searchParams);
  if (route.kind === "notFound") {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  // Dispatch wired in later phases.
  await getMriState();
  return Response.json({ error: "not implemented" }, { status: 501 });
}

if (import.meta.main) {
  Deno.serve((req) => handle(req));
}
```

In `plugins/aithon/package.json`, change the `api` array (lines 24-26) from:

```json
      "api": [
        { "source": "/fhir", "function": "/functions" }
      ]
```

to:

```json
      "api": [
        { "source": "/fhir", "function": "/functions" },
        { "source": "/analytics-svc", "function": "/functions-mri" }
      ]
```

- [ ] **Step 7: Commit**

```bash
git add plugins/aithon/functions-mri plugins/aithon/test/mri_router_test.ts plugins/aithon/package.json
git commit -m "feat(mri): scaffold analytics-svc function, routing, manifest mount"
```

---

## Phase 2 — MRI config generation from FHIR registry

### Task 2: Config mapping types + curated table

**Files:**
- Create: `plugins/aithon/functions-mri/config/mapping.ts`
- Test: `plugins/aithon/test/mri_mapping_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_mapping_test.ts
// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { CURATED_ATTRS } from "../functions-mri/config/mapping.ts";

Deno.test("curated Patient attributes include Age and Gender", () => {
  const patient = CURATED_ATTRS["Patient"];
  assertEquals(patient.Age.derive, "ageYears");
  assertEquals(patient.Age.kind, "num");
  assertEquals(patient.Age.binnable, true);
  assertEquals(patient.Gender.kind, "text");
  assertEquals(patient.Gender.jsonPath, "$.gender");
});

Deno.test("curated Condition attribute maps to code", () => {
  assertEquals(CURATED_ATTRS["Condition"].Code.jsonPath, "$.code.coding[0].code");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_mapping_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create mapping.ts**

```ts
// plugins/aithon/functions-mri/config/mapping.ts
// @ts-nocheck - Deno edge function

/** Physical mapping for one MRI attribute → a FHIR resource + JSON path. */
export interface AttrMapping {
  resourceType: string;          // canonical FHIR type, e.g. "Patient"
  jsonPath: string;              // path within _raw, e.g. "$.gender"
  kind: "text" | "num";
  binnable: boolean;             // numeric axes that support binsize
  derive?: "ageYears";           // optional server-side derivation
}

/** configPath (relative) → mapping. The frontend never sees this; the
 *  IFR→ELM translator uses it to resolve attributes to SQL. */
export type ConfigMapping = Record<string, AttrMapping>;

/** Curated defaults for common resources. Keys are display attribute names. */
export const CURATED_ATTRS: Record<string, Record<string, AttrMapping>> = {
  Patient: {
    Age:    { resourceType: "Patient", jsonPath: "$.birthDate", kind: "num", binnable: true, derive: "ageYears" },
    Gender: { resourceType: "Patient", jsonPath: "$.gender", kind: "text", binnable: false },
  },
  Condition: {
    Code:   { resourceType: "Condition", jsonPath: "$.code.coding[0].code", kind: "text", binnable: false },
  },
  Observation: {
    Code:   { resourceType: "Observation", jsonPath: "$.code.coding[0].code", kind: "text", binnable: false },
    Value:  { resourceType: "Observation", jsonPath: "$.valueQuantity.value", kind: "num", binnable: true },
  },
  Procedure: {
    Code:   { resourceType: "Procedure", jsonPath: "$.code.coding[0].code", kind: "text", binnable: false },
  },
};

/** Display name of the "interaction" for a non-Patient resource type. */
export const INTERACTION_NAMES: Record<string, string> = {
  Condition: "Diagnosis",
  Observation: "Observation",
  Procedure: "Procedure",
  MedicationRequest: "Medication",
  Encounter: "Encounter",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test test/mri_mapping_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/aithon/functions-mri/config/mapping.ts plugins/aithon/test/mri_mapping_test.ts
git commit -m "feat(mri): config attribute mapping types + curated defaults"
```

### Task 3: Generate MRI config + mapping from the registry

**Files:**
- Create: `plugins/aithon/functions-mri/config/generate.ts`
- Test: `plugins/aithon/test/mri_generate_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_generate_test.ts
// @ts-nocheck
import { assertEquals, assert } from "std/assert/mod.ts";
import { generateConfig } from "../functions-mri/config/generate.ts";

Deno.test("generateConfig builds patient attributes + interactions", () => {
  // presentTypes = the resource types found in the dataset
  const { mriConfig, mapping } = generateConfig("ds1", ["Patient", "Condition"]);

  // meta
  assertEquals(mriConfig.meta.configId, "fhir-ds1");
  assert(typeof mriConfig.meta.configVersion === "string");

  // patient attributes
  const attrs = mriConfig.config.patient.attributes;
  assert("Age" in attrs);
  assertEquals(attrs.Age.type, "num");
  assertEquals(attrs.Gender.type, "text");

  // interaction from Condition → "Diagnosis"
  const inter = mriConfig.config.patient.interactions;
  assert("Diagnosis" in inter);
  assert("Code" in inter.Diagnosis.attributes);

  // mapping resolves the full config paths
  assertEquals(mapping["patient.attributes.Gender"].jsonPath, "$.gender");
  assertEquals(mapping["patient.interactions.Diagnosis.attributes.Code"].resourceType, "Condition");
});

Deno.test("generateConfig ignores Patient in interactions and unknown types fall back empty", () => {
  const { mriConfig } = generateConfig("ds1", ["Patient"]);
  assertEquals(Object.keys(mriConfig.config.patient.interactions).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_generate_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create generate.ts**

```ts
// plugins/aithon/functions-mri/config/generate.ts
// @ts-nocheck - Deno edge function
import { AttrMapping, ConfigMapping, CURATED_ATTRS, INTERACTION_NAMES } from "./mapping.ts";

export interface GeneratedConfig {
  mriConfig: any;        // MRI-shaped JSON sent to the frontend
  mapping: ConfigMapping; // in-memory configPath → AttrMapping
}

const CONFIG_VERSION = "1";

/** Build an MRI config + mapping for a dataset from the resource types present in it. */
export function generateConfig(datasetId: string, presentTypes: string[]): GeneratedConfig {
  const mapping: ConfigMapping = {};

  // ---- patient.attributes (Patient-level) ----
  const attributes: Record<string, any> = {};
  let order = 1;
  const patientCurated = CURATED_ATTRS["Patient"] ?? {};
  for (const [name, m] of Object.entries(patientCurated)) {
    attributes[name] = {
      type: m.kind,
      ordered: m.kind === "num",
      measure: m.kind === "num",
      category: m.kind === "text",
      filtercard: { visible: true, order: order++ },
      patientlist: { visible: true },
    };
    mapping[`patient.attributes.${name}`] = m;
  }

  // ---- patient.interactions (one per non-Patient resource present) ----
  const interactions: Record<string, any> = {};
  for (const rt of presentTypes) {
    if (rt === "Patient") continue;
    const interName = INTERACTION_NAMES[rt] ?? rt;
    const curated = CURATED_ATTRS[rt];
    if (!curated) continue; // generic fallback deferred (see plan §scope)
    const interAttrs: Record<string, any> = {};
    for (const [name, m] of Object.entries(curated)) {
      interAttrs[name] = { type: m.kind, expression: m.jsonPath };
      mapping[`patient.interactions.${interName}.attributes.${name}`] = m;
    }
    interactions[interName] = { name: interName, order: Object.keys(interactions).length + 1, attributes: interAttrs };
  }

  const mriConfig = {
    meta: {
      configId: `fhir-${datasetId}`,
      configVersion: CONFIG_VERSION,
      configName: `FHIR dataset ${datasetId}`,
    },
    config: {
      patient: { attributes, interactions },
      pageTitle: "Patient Analytics",
    },
  };

  return { mriConfig, mapping };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test test/mri_generate_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/aithon/functions-mri/config/generate.ts plugins/aithon/test/mri_generate_test.ts
git commit -m "feat(mri): generate MRI config + mapping from FHIR resource types"
```

### Task 4: Config HTTP handlers + wire into router

**Files:**
- Create: `plugins/aithon/functions-mri/handlers/config.ts`
- Modify: `plugins/aithon/functions-mri/index.ts`
- Test: `plugins/aithon/test/mri_config_handler_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_config_handler_test.ts
// @ts-nocheck
import { assertEquals, assert } from "std/assert/mod.ts";
import { buildPresentTypesSql, getMyConfigResponse } from "../functions-mri/handlers/config.ts";

Deno.test("buildPresentTypesSql lists non-internal tables for the dataset schema", () => {
  const sql = buildPresentTypesSql("ds1");
  assert(sql.includes("information_schema.tables"));
  assert(sql.includes("table_schema = 'ds1'"));
  assert(sql.includes("NOT LIKE '\\_%'"));
});

Deno.test("getMyConfigResponse returns an array with one config", () => {
  const body = getMyConfigResponse("ds1", ["Patient", "Condition"]);
  assert(Array.isArray(body));
  assertEquals(body.length, 1);
  assertEquals(body[0].meta.configId, "fhir-ds1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_config_handler_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create handlers/config.ts**

```ts
// plugins/aithon/functions-mri/handlers/config.ts
// @ts-nocheck - Deno edge function
import { Conn } from "../db.ts";
import { MriState } from "../state.ts";
import { validateDatasetId, escapeString } from "../../functions/sql_safety.ts";
import { generateConfig } from "../config/generate.ts";

/** SQL listing concrete (non-internal) tables in a dataset schema. */
export function buildPresentTypesSql(datasetId: string): string {
  const schemaName = datasetId.replaceAll("-", "_");
  return `SELECT table_name FROM information_schema.tables WHERE table_schema = '${escapeString(schemaName)}' AND table_name NOT LIKE '\\_%'`;
}

/** Pure: build the getMyConfig response body from the present resource types. */
export function getMyConfigResponse(datasetId: string, presentTypes: string[]): any[] {
  const { mriConfig } = generateConfig(datasetId, presentTypes);
  return [mriConfig];
}

/** Resolve the canonical resource types present in a dataset. */
async function presentTypes(datasetId: string, conn: Conn, state: MriState): Promise<string[]> {
  let rows: any[] = [];
  try {
    rows = await conn.query(buildPresentTypesSql(datasetId));
  } catch {
    return ["Patient"]; // schema may not exist yet
  }
  const lowerToCanonical = new Map<string, string>();
  for (const rt of state.registry.listResourceTypes()) lowerToCanonical.set(rt.toLowerCase(), rt);
  const out: string[] = [];
  for (const row of rows) {
    const t = (row.table_name ?? row.column0 ?? "").toLowerCase();
    const canonical = lowerToCanonical.get(t);
    if (canonical) out.push(canonical);
  }
  if (!out.includes("Patient")) out.unshift("Patient");
  return out;
}

export async function handleGetMyConfig(datasetId: string, conn: Conn, state: MriState): Promise<Response> {
  validateDatasetId(datasetId);
  const types = await presentTypes(datasetId, conn, state);
  return Response.json(getMyConfigResponse(datasetId, types));
}

export async function handleGetMyConfigList(datasetId: string, conn: Conn, state: MriState): Promise<Response> {
  validateDatasetId(datasetId);
  const types = await presentTypes(datasetId, conn, state);
  const { mriConfig } = generateConfig(datasetId, types);
  return Response.json([{ meta: mriConfig.meta, assigned: true }]);
}

export async function handleGetFrontendConfig(configId: string, conn: Conn, state: MriState): Promise<Response> {
  // configId is "fhir-<datasetId>"
  const datasetId = configId.startsWith("fhir-") ? configId.slice("fhir-".length) : configId;
  validateDatasetId(datasetId);
  const types = await presentTypes(datasetId, conn, state);
  const { mriConfig } = generateConfig(datasetId, types);
  return Response.json(mriConfig);
}
```

- [ ] **Step 4: Wire dispatch into index.ts**

Replace the body of `handle` in `functions-mri/index.ts` with:

```ts
// plugins/aithon/functions-mri/index.ts
// @ts-nocheck - Deno edge function
import { getMriState } from "./state.ts";
import { parseMriRoute } from "./router.ts";
import { withConnection } from "./db.ts";
import { handleGetMyConfig, handleGetMyConfigList, handleGetFrontendConfig } from "./handlers/config.ts";

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const route = parseMriRoute(req.method, url.pathname, url.searchParams);
  const state = await getMriState();

  switch (route.kind) {
    case "getMyConfig":
      return await withConnection((conn) => handleGetMyConfig(route.datasetId, conn, state));
    case "getMyConfigList":
      return await withConnection((conn) => handleGetMyConfigList(route.datasetId, conn, state));
    case "getFrontendConfig":
      return await withConnection((conn) => handleGetFrontendConfig(route.configId, conn, state));
    default:
      return Response.json({ error: "not found" }, { status: 404 });
  }
}

if (import.meta.main) {
  Deno.serve((req) => handle(req));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `deno test test/mri_config_handler_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add plugins/aithon/functions-mri/handlers/config.ts plugins/aithon/functions-mri/index.ts plugins/aithon/test/mri_config_handler_test.ts
git commit -m "feat(mri): config endpoints (getMyConfig/List/FrontendConfig)"
```

---

## Phase 3 — mriquery decode + IFR model

### Task 5: IFR types

**Files:**
- Create: `plugins/aithon/functions-mri/ifr/types.ts`
- Test: none (pure type declarations; exercised by Task 6/8 tests).

- [ ] **Step 1: Create ifr/types.ts**

```ts
// plugins/aithon/functions-mri/ifr/types.ts
// @ts-nocheck - Deno edge function

export interface IfrExpression { type: "Expression"; operator: string; value: string | number; }

export interface IfrBoolean<T> { type: "BooleanContainer"; op: "AND" | "OR" | "NOT"; content: T[]; }

export interface IfrAttribute {
  type: "Attribute";
  configPath: string;                          // e.g. "patient.attributes.Gender"
  constraints: IfrBoolean<IfrExpression>;
}

export interface IfrFilterCard {
  type: "FilterCard";
  configPath: string;                          // e.g. "patient.interactions.Diagnosis"
  instanceNumber?: number;
  attributes: IfrBoolean<IfrAttribute>;
}

export interface IfrAxis { categoryId: string; attributeId: string; binsize: string; }

export interface Ifr {
  filter: {
    configMetadata: { id: string; version: string };
    cards: IfrBoolean<IfrBoolean<IfrFilterCard> | IfrFilterCard>;
  };
  axisSelection: IfrAxis[];
  datasetId?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/aithon/functions-mri/ifr/types.ts
git commit -m "feat(mri): IFR type model"
```

### Task 6: mriquery decode (base64 + zlib)

**Files:**
- Create: `plugins/aithon/functions-mri/mriquery/decode.ts`
- Test: `plugins/aithon/test/mri_decode_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_decode_test.ts
// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { decodeMriQuery, encodeMriQuery } from "../functions-mri/mriquery/decode.ts";

Deno.test("decode round-trips an encoded IFR (zlib + base64)", async () => {
  const ifr = { filter: { configMetadata: { id: "fhir-ds1", version: "1" }, cards: { type: "BooleanContainer", op: "AND", content: [] } }, axisSelection: [] };
  const encoded = await encodeMriQuery(ifr);
  const decoded = await decodeMriQuery(encoded);
  assertEquals(decoded, ifr);
});

Deno.test("decode accepts plain (uncompressed) JSON too", async () => {
  const ifr = { filter: { configMetadata: { id: "x", version: "1" }, cards: { type: "BooleanContainer", op: "AND", content: [] } }, axisSelection: [] };
  const decoded = await decodeMriQuery(JSON.stringify(ifr));
  assertEquals(decoded.filter.configMetadata.id, "x");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_decode_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create mriquery/decode.ts**

```ts
// plugins/aithon/functions-mri/mriquery/decode.ts
// @ts-nocheck - Deno edge function
import { Ifr } from "../ifr/types.ts";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate");
  const stream = new Response(bytes).body.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const stream = new Response(bytes).body.pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decode an mriquery value: tries plain JSON, then base64+zlib(deflate). */
export async function decodeMriQuery(value: string): Promise<Ifr> {
  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed) as Ifr;
  const bytes = b64ToBytes(trimmed);
  const inflated = await inflate(bytes);
  return JSON.parse(new TextDecoder().decode(inflated)) as Ifr;
}

/** Test/helper: encode an IFR the way the frontend does (base64 of deflate). */
export async function encodeMriQuery(ifr: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(ifr));
  return bytesToB64(await deflate(json));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test test/mri_decode_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/aithon/functions-mri/mriquery/decode.ts plugins/aithon/test/mri_decode_test.ts
git commit -m "feat(mri): mriquery decode (base64 + deflate, plain-JSON fallback)"
```

---

## Phase 4 — ELM IR, TS compiler, patientcount

### Task 7: ELM IR types

**Files:**
- Create: `plugins/aithon/functions-mri/elm/types.ts`
- Test: none (types only; exercised by Task 8/9).

- [ ] **Step 1: Create elm/types.ts**

```ts
// plugins/aithon/functions-mri/elm/types.ts
// @ts-nocheck - Deno edge function

/** Boolean/comparison expression over a single resource's _raw, referencing
 *  AttrMapping-derived value expressions by their resolved SQL. */
export type ElmExpr =
  | { type: "And"; operands: ElmExpr[] }
  | { type: "Or"; operands: ElmExpr[] }
  | { type: "Not"; operand: ElmExpr }
  | { type: "Compare"; op: "=" | "!=" | "<" | "<=" | ">" | ">="; valueExpr: string; literal: string | number }
  | { type: "True" };

/** A resource retrieve used as a filter (EXISTS) or as the base (Patient). */
export interface ElmRetrieve {
  resourceType: string;   // canonical, e.g. "Condition"
  alias: string;          // SQL alias, e.g. "c0"
  joinToPatient: boolean; // true → EXISTS subquery linked by subject.reference
  where: ElmExpr;
}

/** A stratification axis (MVP: Patient-level attributes). */
export interface ElmAxis {
  id: string;             // "x1" | "y1" | ...
  valueExpr: string;      // SQL value expression relative to the patient alias "p"
  kind: "text" | "num";
  binSize?: number;       // numeric binning
}

export interface ElmQuery {
  patientWhere: ElmExpr;  // predicates on the Patient base table (alias "p")
  filters: ElmRetrieve[]; // non-Patient EXISTS filters
  axes: ElmAxis[];        // empty → plain count
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/aithon/functions-mri/elm/types.ts
git commit -m "feat(mri): ELM IR types (MRI-scoped subset + stratification)"
```

### Task 8: IFR → ELM translation

**Files:**
- Create: `plugins/aithon/functions-mri/ifr/to_elm.ts`
- Test: `plugins/aithon/test/mri_to_elm_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_to_elm_test.ts
// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { ifrToElm, valueExprFor } from "../functions-mri/ifr/to_elm.ts";
import { generateConfig } from "../functions-mri/config/generate.ts";

const { mapping } = generateConfig("ds1", ["Patient", "Condition"]);

Deno.test("valueExprFor: gender → json_extract_string on patient alias", () => {
  assertEquals(valueExprFor(mapping["patient.attributes.Gender"], "p"), `json_extract_string(p._raw, '$.gender')`);
});

Deno.test("valueExprFor: Age → date_diff derivation", () => {
  assertEquals(
    valueExprFor(mapping["patient.attributes.Age"], "p"),
    `date_diff('year', CAST(json_extract_string(p._raw, '$.birthDate') AS DATE), current_date)`,
  );
});

Deno.test("ifrToElm: gender filter → patientWhere Compare; age axis added", () => {
  const ifr = {
    filter: {
      configMetadata: { id: "fhir-ds1", version: "1" },
      cards: {
        type: "BooleanContainer", op: "AND",
        content: [{
          type: "FilterCard", configPath: "patient",
          attributes: {
            type: "BooleanContainer", op: "AND",
            content: [{
              type: "Attribute", configPath: "patient.attributes.Gender",
              constraints: { type: "BooleanContainer", op: "OR", content: [{ type: "Expression", operator: "=", value: "male" }] },
            }],
          },
        }],
      },
    },
    axisSelection: [{ categoryId: "x1", attributeId: "patient.attributes.Age", binsize: "10" }],
  };

  const elm = ifrToElm(ifr, mapping);
  assertEquals(elm.filters.length, 0);
  assertEquals(elm.axes.length, 1);
  assertEquals(elm.axes[0].binSize, 10);
  // patientWhere is And[ Compare(gender = male) ]
  assertEquals(elm.patientWhere.type, "And");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_to_elm_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create ifr/to_elm.ts**

```ts
// plugins/aithon/functions-mri/ifr/to_elm.ts
// @ts-nocheck - Deno edge function
import { Ifr, IfrFilterCard, IfrAttribute, IfrBoolean } from "./types.ts";
import { AttrMapping, ConfigMapping } from "../config/mapping.ts";
import { ElmQuery, ElmExpr, ElmRetrieve, ElmAxis } from "../elm/types.ts";

/** Build the SQL value expression for an attribute relative to a resource alias. */
export function valueExprFor(m: AttrMapping, alias: string): string {
  const raw = `json_extract_string(${alias}._raw, '${m.jsonPath}')`;
  if (m.derive === "ageYears") {
    return `date_diff('year', CAST(${raw} AS DATE), current_date)`;
  }
  if (m.kind === "num") return `CAST(${raw} AS DOUBLE)`;
  return raw;
}

function exprFromConstraints(m: AttrMapping, alias: string, c: IfrBoolean<any>): ElmExpr {
  const valueExpr = valueExprFor(m, alias);
  const ops = (c.content ?? []).map((e: any): ElmExpr => ({
    type: "Compare",
    op: (e.operator ?? "=") as any,
    valueExpr,
    literal: e.value,
  }));
  if (ops.length === 0) return { type: "True" };
  return c.op === "OR" ? { type: "Or", operands: ops } : { type: "And", operands: ops };
}

/** Flatten the nested cards boolean tree into a flat list of FilterCards. */
function collectCards(node: any, out: IfrFilterCard[]): void {
  if (!node) return;
  if (node.type === "FilterCard") { out.push(node); return; }
  if (node.type === "BooleanContainer") for (const ch of node.content ?? []) collectCards(ch, out);
}

export function ifrToElm(ifr: Ifr, mapping: ConfigMapping): ElmQuery {
  const cards: IfrFilterCard[] = [];
  collectCards(ifr.filter?.cards, cards);

  const patientPreds: ElmExpr[] = [];
  const filters: ElmRetrieve[] = [];
  let aliasN = 0;

  for (const card of cards) {
    const attrs: IfrAttribute[] = (card.attributes?.content ?? []).filter((a: any) => a.type === "Attribute");
    // Patient-level filter card → predicates on base patient table
    if (card.configPath === "patient" || card.configPath.startsWith("patient.attributes")) {
      for (const a of attrs) {
        const m = mapping[a.configPath];
        if (m && m.resourceType === "Patient") patientPreds.push(exprFromConstraints(m, "p", a.constraints));
      }
      continue;
    }
    // Interaction filter card → EXISTS over its resource
    const sample = attrs.map((a) => mapping[a.configPath]).find(Boolean);
    if (!sample) continue;
    const alias = `c${aliasN++}`;
    const preds = attrs.map((a) => {
      const m = mapping[a.configPath];
      return m ? exprFromConstraints(m, alias, a.constraints) : { type: "True" } as ElmExpr;
    });
    filters.push({
      resourceType: sample.resourceType,
      alias,
      joinToPatient: true,
      where: preds.length ? { type: "And", operands: preds } : { type: "True" },
    });
  }

  // Axes (MVP: Patient-level attributes, alias "p")
  const axes: ElmAxis[] = [];
  for (const ax of ifr.axisSelection ?? []) {
    if (!ax.attributeId || ax.attributeId === "n/a") continue;
    const m = mapping[ax.attributeId];
    if (!m || m.resourceType !== "Patient") continue; // interaction-attr axes deferred
    const binSize = ax.binsize && ax.binsize !== "n/a" ? Number(ax.binsize) : undefined;
    axes.push({ id: ax.categoryId, valueExpr: valueExprFor(m, "p"), kind: m.kind, binSize: Number.isFinite(binSize) ? binSize : undefined });
  }

  return {
    patientWhere: patientPreds.length ? { type: "And", operands: patientPreds } : { type: "True" },
    filters,
    axes,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test test/mri_to_elm_test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/aithon/functions-mri/ifr/to_elm.ts plugins/aithon/test/mri_to_elm_test.ts
git commit -m "feat(mri): IFR → ELM translation (filters + patient-level axes)"
```

### Task 9: ELM → SQL compiler

**Files:**
- Create: `plugins/aithon/functions-mri/elm/compiler.ts`
- Test: `plugins/aithon/test/mri_compiler_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_compiler_test.ts
// @ts-nocheck
import { assert, assertEquals } from "std/assert/mod.ts";
import { compileCount, compileBarchart, binExpr } from "../functions-mri/elm/compiler.ts";

const schema = `"memory"."ds1"`;

Deno.test("binExpr floors numeric value to bin start", () => {
  assertEquals(binExpr("x", 10), "floor((x) / 10) * 10");
});

Deno.test("compileCount: patient gender filter → COUNT DISTINCT with escaped literal", () => {
  const elm = {
    patientWhere: { type: "And", operands: [{ type: "Compare", op: "=", valueExpr: `json_extract_string(p._raw, '$.gender')`, literal: "male" }] },
    filters: [],
    axes: [],
  };
  const sql = compileCount(elm, schema);
  assert(sql.includes(`FROM "memory"."ds1"."patient" p`));
  assert(sql.includes("NOT p._is_deleted"));
  assert(sql.includes(`json_extract_string(p._raw, '$.gender') = 'male'`));
  assert(sql.includes("COUNT(DISTINCT p.id)"));
});

Deno.test("compileCount: interaction filter → EXISTS joined by subject.reference", () => {
  const elm = {
    patientWhere: { type: "True" },
    filters: [{ resourceType: "Condition", alias: "c0", joinToPatient: true,
      where: { type: "And", operands: [{ type: "Compare", op: "=", valueExpr: `json_extract_string(c0._raw, '$.code.coding[0].code')`, literal: "C34.1" }] } }],
    axes: [],
  };
  const sql = compileCount(elm, schema);
  assert(sql.includes(`EXISTS (SELECT 1 FROM "memory"."ds1"."condition" c0`));
  assert(sql.includes(`json_extract_string(c0._raw, '$.subject.reference') LIKE '%/' || p.id`));
  assert(sql.includes(`json_extract_string(c0._raw, '$.code.coding[0].code') = 'C34.1'`));
});

Deno.test("compileBarchart: numeric axis → GROUP BY binned, alias by category id", () => {
  const elm = {
    patientWhere: { type: "True" },
    filters: [],
    axes: [{ id: "x1", valueExpr: `date_diff('year', CAST(json_extract_string(p._raw, '$.birthDate') AS DATE), current_date)`, kind: "num", binSize: 10 }],
  };
  const sql = compileBarchart(elm, schema);
  assert(sql.includes(`AS "x1"`));
  assert(sql.includes("GROUP BY"));
  assert(sql.includes("COUNT(DISTINCT p.id) AS pcount"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_compiler_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create elm/compiler.ts**

```ts
// plugins/aithon/functions-mri/elm/compiler.ts
// @ts-nocheck - Deno edge function
import { escapeString } from "../../functions/sql_safety.ts";
import { ElmQuery, ElmExpr, ElmRetrieve } from "./types.ts";

function lit(v: string | number): string {
  return typeof v === "number" ? String(v) : `'${escapeString(String(v))}'`;
}

/** Compile a boolean/compare expression to a SQL predicate. */
function compileExpr(e: ElmExpr): string {
  switch (e.type) {
    case "True": return "TRUE";
    case "Not": return `NOT (${compileExpr(e.operand)})`;
    case "And": return e.operands.length ? `(${e.operands.map(compileExpr).join(" AND ")})` : "TRUE";
    case "Or": return e.operands.length ? `(${e.operands.map(compileExpr).join(" OR ")})` : "TRUE";
    case "Compare": return `${e.valueExpr} ${e.op} ${lit(e.literal)}`;
    default: return "TRUE";
  }
}

/** EXISTS subquery linking a non-Patient resource to the patient base alias "p". */
function compileFilter(f: ElmRetrieve, schema: string): string {
  const table = f.resourceType.toLowerCase();
  return `EXISTS (SELECT 1 FROM ${schema}."${table}" ${f.alias} WHERE NOT ${f.alias}._is_deleted` +
    ` AND json_extract_string(${f.alias}._raw, '$.subject.reference') LIKE '%/' || p.id` +
    ` AND (${compileExpr(f.where)}))`;
}

/** Numeric binning: floor(value / size) * size. */
export function binExpr(valueExpr: string, binSize: number): string {
  return `floor((${valueExpr}) / ${binSize}) * ${binSize}`;
}

function whereClause(elm: ElmQuery, schema: string): string {
  const parts = ["NOT p._is_deleted"];
  const pw = compileExpr(elm.patientWhere);
  if (pw !== "TRUE") parts.push(pw);
  for (const f of elm.filters) parts.push(compileFilter(f, schema));
  return parts.join(" AND ");
}

/** Compile a plain patient count. */
export function compileCount(elm: ElmQuery, schema: string): string {
  return `SELECT COUNT(DISTINCT p.id) AS pcount FROM ${schema}."patient" p WHERE ${whereClause(elm, schema)}`;
}

/** Compile a stratified bar-chart query: one grouped column per axis. */
export function compileBarchart(elm: ElmQuery, schema: string): string {
  const selectCols: string[] = [];
  const groupCols: string[] = [];
  for (const ax of elm.axes) {
    const v = ax.kind === "num" && ax.binSize ? binExpr(ax.valueExpr, ax.binSize) : ax.valueExpr;
    selectCols.push(`${v} AS "${ax.id}"`);
    groupCols.push(v);
  }
  const cols = [...selectCols, "COUNT(DISTINCT p.id) AS pcount"].join(", ");
  const group = groupCols.length ? ` GROUP BY ${groupCols.join(", ")} ORDER BY ${groupCols.join(", ")}` : "";
  return `SELECT ${cols} FROM ${schema}."patient" p WHERE ${whereClause(elm, schema)}${group}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test test/mri_compiler_test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/aithon/functions-mri/elm/compiler.ts plugins/aithon/test/mri_compiler_test.ts
git commit -m "feat(mri): ELM→SQL compiler (count, EXISTS filters, stratified group-by + binning)"
```

### Task 10: patientcount handler + wire into router

**Files:**
- Create: `plugins/aithon/functions-mri/handlers/patientcount.ts`
- Modify: `plugins/aithon/functions-mri/index.ts`
- Test: `plugins/aithon/test/mri_patientcount_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_patientcount_test.ts
// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { buildPatientCountResponse } from "../functions-mri/handlers/patientcount.ts";

Deno.test("buildPatientCountResponse shapes the MRI pcount payload", () => {
  assertEquals(buildPatientCountResponse(1234), { data: [{ "patient.attributes.pcount": 1234 }] });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_patientcount_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create handlers/patientcount.ts**

```ts
// plugins/aithon/functions-mri/handlers/patientcount.ts
// @ts-nocheck - Deno edge function
import { Conn } from "../db.ts";
import { MriState } from "../state.ts";
import { validateDatasetId, toQualifiedSchema } from "../../functions/sql_safety.ts";
import { decodeMriQuery } from "../mriquery/decode.ts";
import { generateConfig } from "../config/generate.ts";
import { ifrToElm } from "../ifr/to_elm.ts";
import { compileCount } from "../elm/compiler.ts";

/** Pure: MRI patientcount response shape. */
export function buildPatientCountResponse(count: number): { data: Array<Record<string, number>> } {
  return { data: [{ "patient.attributes.pcount": count }] };
}

export async function handlePatientCount(mriquery: string, conn: Conn, state: MriState): Promise<Response> {
  const ifr = await decodeMriQuery(mriquery);
  const datasetId = ifr.datasetId ?? (ifr.filter?.configMetadata?.id ?? "").replace(/^fhir-/, "");
  validateDatasetId(datasetId);

  // Mapping only needs the configPaths referenced; regenerate from Patient + all curated types.
  const { mapping } = generateConfig(datasetId, ["Patient", "Condition", "Observation", "Procedure"]);
  const elm = ifrToElm(ifr, mapping);
  const sql = compileCount(elm, toQualifiedSchema(state.dbName, datasetId));

  const rows = await conn.query(sql);
  const n = parseInt(String(rows?.[0]?.pcount ?? rows?.[0]?.column0 ?? "0"), 10) || 0;
  return Response.json(buildPatientCountResponse(n));
}
```

- [ ] **Step 4: Wire dispatch into index.ts**

Add the import and the `patientcount` case to `functions-mri/index.ts`:

```ts
import { handlePatientCount } from "./handlers/patientcount.ts";
```

```ts
    case "patientcount": {
      const mriquery = url.searchParams.get("mriquery") ?? (req.method === "POST" ? await req.text() : "");
      return await withConnection((conn) => handlePatientCount(mriquery, conn, state));
    }
```

(Insert the `case` inside the existing `switch (route.kind)` block, before `default:`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `deno test test/mri_patientcount_test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add plugins/aithon/functions-mri/handlers/patientcount.ts plugins/aithon/functions-mri/index.ts plugins/aithon/test/mri_patientcount_test.ts
git commit -m "feat(mri): patientcount endpoint (IFR→ELM→SQL→count)"
```

---

## Phase 5 — Stratified barchart + post-processing

### Task 11: barchart post-processing (fill missing combinations)

**Files:**
- Create: `plugins/aithon/functions-mri/postprocess/barchart.ts`
- Test: `plugins/aithon/test/mri_postprocess_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_postprocess_test.ts
// @ts-nocheck
import { assertEquals } from "std/assert/mod.ts";
import { assembleBarchart } from "../functions-mri/postprocess/barchart.ts";

Deno.test("assembleBarchart returns categories/measures/totalPatientCount + fills combos", () => {
  const axes = [
    { id: "x1", valueExpr: "AGE", kind: "num", binSize: 10 },
    { id: "y1", valueExpr: "GENDER", kind: "text" },
  ];
  const rows = [
    { x1: 30, y1: "male", pcount: 5 },
    { x1: 30, y1: "female", pcount: 3 },
    { x1: 40, y1: "male", pcount: 7 },
    // (40, female) missing → should be filled with 0
  ];
  const res = assembleBarchart(rows, axes, [{ name: "Age" }, { name: "Gender" }]);
  assertEquals(res.totalPatientCount, 15);
  assertEquals(res.categories.length, 2);
  assertEquals(res.categories[0].id, "x1");
  assertEquals(res.categories[0].binsize, 10);
  // 2 distinct x × 2 distinct y = 4 rows after fill
  assertEquals(res.data.length, 4);
  const filled = res.data.find((d) => d.x1 === 40 && d.y1 === "female");
  assertEquals(filled.pcount, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_postprocess_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create postprocess/barchart.ts**

```ts
// plugins/aithon/functions-mri/postprocess/barchart.ts
// @ts-nocheck - Deno edge function

interface AxisMeta { id: string; kind: "text" | "num"; binSize?: number; }
interface CategoryLabel { name: string; }

export interface BarchartResult {
  data: Array<Record<string, string | number>>;
  categories: Array<{ id: string; name: string; type: string; axis: number; binsize?: number; order: string }>;
  measures: Array<{ id: string; name: string; type: string; group: number }>;
  totalPatientCount: number;
  postProcessingConfig: { fillMissingValuesEnabled: boolean; NOVALUE: string; shouldFormatBinningLabels: boolean };
}

/** Assemble the MRI barchart response, filling the Cartesian product of axis values. */
export function assembleBarchart(
  rows: Array<Record<string, any>>,
  axes: AxisMeta[],
  labels: CategoryLabel[],
): BarchartResult {
  // Normalize numeric pcount.
  const norm = rows.map((r) => {
    const o: Record<string, any> = { pcount: parseInt(String(r.pcount ?? r.column0 ?? "0"), 10) || 0 };
    for (const ax of axes) o[ax.id] = ax.kind === "num" ? Number(r[ax.id]) : (r[ax.id] ?? "NO_VALUE");
    return o;
  });

  const total = norm.reduce((s, r) => s + r.pcount, 0);

  // Distinct values per axis (sorted).
  const distinct = axes.map((ax) => {
    const vals = Array.from(new Set(norm.map((r) => r[ax.id])));
    vals.sort((a, b) => (ax.kind === "num" ? Number(a) - Number(b) : String(a).localeCompare(String(b))));
    return vals;
  });

  // Cartesian product → keyed lookup → fill 0.
  const key = (combo: any[]) => combo.map(String).join("");
  const found = new Map<string, number>();
  for (const r of norm) found.set(key(axes.map((ax) => r[ax.id])), r.pcount);

  const combos: any[][] = distinct.reduce<any[][]>(
    (acc, vals) => acc.flatMap((prefix) => vals.map((v) => [...prefix, v])),
    [[]],
  );

  const data = combos.map((combo) => {
    const row: Record<string, string | number> = {};
    axes.forEach((ax, i) => { row[ax.id] = combo[i]; });
    row.pcount = found.get(key(combo)) ?? 0;
    return row;
  });

  const categories = axes.map((ax, i) => ({
    id: ax.id,
    name: labels[i]?.name ?? ax.id,
    type: ax.kind,
    axis: ax.id.startsWith("y") ? 2 : 1,
    binsize: ax.binSize,
    order: "ASC",
  }));

  return {
    data,
    categories,
    measures: [{ id: "pcount", name: "Patient Count", type: "measure", group: 1 }],
    totalPatientCount: total,
    postProcessingConfig: { fillMissingValuesEnabled: true, NOVALUE: "NO_VALUE", shouldFormatBinningLabels: true },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test test/mri_postprocess_test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add plugins/aithon/functions-mri/postprocess/barchart.ts plugins/aithon/test/mri_postprocess_test.ts
git commit -m "feat(mri): barchart post-processing (fill missing combos, response shape)"
```

### Task 12: barchart handler + wire into router

**Files:**
- Create: `plugins/aithon/functions-mri/handlers/barchart.ts`
- Modify: `plugins/aithon/functions-mri/index.ts`
- Test: `plugins/aithon/test/mri_barchart_handler_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/aithon/test/mri_barchart_handler_test.ts
// @ts-nocheck
import { assert, assertEquals } from "std/assert/mod.ts";
import { axisLabels } from "../functions-mri/handlers/barchart.ts";
import { generateConfig } from "../functions-mri/config/generate.ts";

Deno.test("axisLabels resolves display names from the config mapping", () => {
  const { mapping } = generateConfig("ds1", ["Patient"]);
  const labels = axisLabels(
    [{ categoryId: "x1", attributeId: "patient.attributes.Age", binsize: "10" }],
    mapping,
  );
  assertEquals(labels.length, 1);
  assertEquals(labels[0].name, "Age");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test test/mri_barchart_handler_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create handlers/barchart.ts**

```ts
// plugins/aithon/functions-mri/handlers/barchart.ts
// @ts-nocheck - Deno edge function
import { Conn } from "../db.ts";
import { MriState } from "../state.ts";
import { validateDatasetId, toQualifiedSchema } from "../../functions/sql_safety.ts";
import { decodeMriQuery } from "../mriquery/decode.ts";
import { generateConfig } from "../config/generate.ts";
import { ifrToElm } from "../ifr/to_elm.ts";
import { compileBarchart } from "../elm/compiler.ts";
import { assembleBarchart } from "../postprocess/barchart.ts";

/** Display labels for the selected axes, derived from the attribute id's leaf name. */
export function axisLabels(axisSelection: Array<{ categoryId: string; attributeId: string }>, _mapping: Record<string, any>) {
  return axisSelection
    .filter((ax) => ax.attributeId && ax.attributeId !== "n/a")
    .map((ax) => ({ name: ax.attributeId.split(".").pop() ?? ax.categoryId }));
}

export async function handleBarchart(mriquery: string, conn: Conn, state: MriState): Promise<Response> {
  const ifr = await decodeMriQuery(mriquery);
  const datasetId = ifr.datasetId ?? (ifr.filter?.configMetadata?.id ?? "").replace(/^fhir-/, "");
  validateDatasetId(datasetId);

  const { mapping } = generateConfig(datasetId, ["Patient", "Condition", "Observation", "Procedure"]);
  const elm = ifrToElm(ifr, mapping);
  const sql = compileBarchart(elm, toQualifiedSchema(state.dbName, datasetId));

  const rows = await conn.query(sql);
  const labels = axisLabels(ifr.axisSelection ?? [], mapping);
  const result = assembleBarchart(rows, elm.axes, labels);
  return Response.json(result);
}
```

- [ ] **Step 4: Wire dispatch into index.ts**

Add the import and the `barchart` case to `functions-mri/index.ts`:

```ts
import { handleBarchart } from "./handlers/barchart.ts";
```

```ts
    case "barchart": {
      const mriquery = url.searchParams.get("mriquery") ?? (req.method === "POST" ? await req.text() : "");
      return await withConnection((conn) => handleBarchart(mriquery, conn, state));
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `deno test test/mri_barchart_handler_test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Run the full MRI test suite**

Run: `deno test --allow-read test/mri_*.ts`
Expected: PASS (all MRI tests green).

- [ ] **Step 7: Commit**

```bash
git add plugins/aithon/functions-mri/handlers/barchart.ts plugins/aithon/functions-mri/index.ts plugins/aithon/test/mri_barchart_handler_test.ts
git commit -m "feat(mri): stratified barchart endpoint (IFR→ELM→SQL→assembled response)"
```

---

## Phase 6 — Integration test against a seeded dataset

### Task 13: End-to-end handler test with an in-memory DuckDB-style conn fake

**Files:**
- Test: `plugins/aithon/test/mri_e2e_test.ts`

> This test exercises the full path `handle(req)` → SQL strings, using a fake `Conn`
> that records SQL and returns canned rows, so it runs without a live DuckDB. It
> verifies the request decodes, the right SQL is produced, and the response shape is
> MRI-correct. A live-DB check is covered by Task 14.

- [ ] **Step 1: Write the test**

```ts
// plugins/aithon/test/mri_e2e_test.ts
// @ts-nocheck
import { assert, assertEquals } from "std/assert/mod.ts";
import { handlePatientCount } from "../functions-mri/handlers/patientcount.ts";
import { handleBarchart } from "../functions-mri/handlers/barchart.ts";
import { encodeMriQuery } from "../functions-mri/mriquery/decode.ts";

const state = { registry: { listResourceTypes: () => ["Patient", "Condition"] }, dbName: "memory" };

function fakeConn(rows: any[]) {
  const seen: string[] = [];
  return { seen, query: async (sql: string) => { seen.push(sql); return rows; } };
}

Deno.test("patientcount end-to-end: decodes IFR, builds count SQL, shapes response", async () => {
  const ifr = {
    datasetId: "ds1",
    filter: { configMetadata: { id: "fhir-ds1", version: "1" }, cards: {
      type: "BooleanContainer", op: "AND", content: [{
        type: "FilterCard", configPath: "patient.attributes.Gender", attributes: {
          type: "BooleanContainer", op: "AND", content: [{
            type: "Attribute", configPath: "patient.attributes.Gender",
            constraints: { type: "BooleanContainer", op: "OR", content: [{ type: "Expression", operator: "=", value: "male" }] },
          }],
        },
      }],
    } },
    axisSelection: [],
  };
  const conn = fakeConn([{ pcount: "42" }]);
  const res = await handlePatientCount(await encodeMriQuery(ifr), conn, state);
  const body = await res.json();
  assertEquals(body, { data: [{ "patient.attributes.pcount": 42 }] });
  assert(conn.seen[0].includes("COUNT(DISTINCT p.id)"));
  assert(conn.seen[0].includes(`json_extract_string(p._raw, '$.gender') = 'male'`));
});

Deno.test("barchart end-to-end: Age × Gender → categories/measures + filled data", async () => {
  const ifr = {
    datasetId: "ds1",
    filter: { configMetadata: { id: "fhir-ds1", version: "1" }, cards: { type: "BooleanContainer", op: "AND", content: [] } },
    axisSelection: [
      { categoryId: "x1", attributeId: "patient.attributes.Age", binsize: "10" },
      { categoryId: "y1", attributeId: "patient.attributes.Gender", binsize: "n/a" },
    ],
  };
  const conn = fakeConn([
    { x1: 30, y1: "male", pcount: "5" },
    { x1: 30, y1: "female", pcount: "3" },
    { x1: 40, y1: "male", pcount: "7" },
  ]);
  const res = await handleBarchart(await encodeMriQuery(ifr), conn, state);
  const body = await res.json();
  assertEquals(body.totalPatientCount, 15);
  assertEquals(body.categories.map((c: any) => c.id), ["x1", "y1"]);
  assertEquals(body.data.length, 4); // 2×2 filled
  assert(conn.seen[0].includes("GROUP BY"));
  assert(conn.seen[0].includes("floor("));
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `deno test --allow-read test/mri_e2e_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Commit**

```bash
git add plugins/aithon/test/mri_e2e_test.ts
git commit -m "test(mri): end-to-end handler tests (count + barchart, fake conn)"
```

### Task 14: Live-DB smoke verification (manual, documented)

**Files:**
- Create: `plugins/aithon/docs/MRI-VERIFY.md`

> No automated live-DB test here (the existing function suite has no DuckDB fixture
> harness either). Instead, document a repeatable manual smoke test, run it once, and
> record the output.

- [ ] **Step 1: Write the verification doc**

```markdown
# MRI backend — live smoke test

Prereq: a running trex instance with the aithon plugin mounted and a dataset `ds1`
seeded with a few Patients (with `birthDate`, `gender`) and Conditions
(`subject.reference = "Patient/<id>"`, `code.coding[0].code`).

1. Config:
   `curl 'http://<host>/trex/analytics-svc/pa/services/analytics.xsjs?action=getMyConfig&datasetId=ds1'`
   → expect an array with one config whose `meta.configId == "fhir-ds1"` and
     `config.patient.attributes` containing `Age` and `Gender`.

2. Patient count (no filter): encode `{datasetId:"ds1",filter:{configMetadata:{id:"fhir-ds1",version:"1"},cards:{type:"BooleanContainer",op:"AND",content:[]}},axisSelection:[]}`
   as base64(deflate) and GET
   `.../api/services/population/json/patientcount?mriquery=<enc>`
   → expect `{ "data": [ { "patient.attributes.pcount": <N> } ] }` equal to the seeded
     patient count.

3. Barchart (Age × Gender): axisSelection
   `[{categoryId:"x1",attributeId:"patient.attributes.Age",binsize:"10"},{categoryId:"y1",attributeId:"patient.attributes.Gender",binsize:"n/a"}]`
   → expect `categories` (x1 Age num binsize 10, y1 Gender text), `measures` (pcount),
     `data` rows keyed by `x1`/`y1`/`pcount`, and `totalPatientCount` == patient count.
```

- [ ] **Step 2: Run the smoke test once and paste actual output under each step in the doc.**

- [ ] **Step 3: Commit**

```bash
git add plugins/aithon/docs/MRI-VERIFY.md
git commit -m "docs(mri): live smoke-test procedure + recorded output"
```

---

## Self-review notes (addressed)

- **Spec coverage:** config generation (Tasks 2-4), mriquery decode (Task 6), IFR model (Task 5), IFR→ELM with stratification (Task 8), ELM→SQL compiler incl. GROUP BY/binning (Task 9), patientcount (Task 10), barchart + post-processing (Tasks 11-12), manifest mount (Task 1), testing (Tasks 13-14). All design §sections map to a task.
- **Type consistency:** `ElmQuery` shape (`patientWhere`/`filters`/`axes`) is identical across Tasks 7, 8, 9, 12; `AttrMapping` fields (`resourceType`/`jsonPath`/`kind`/`binnable`/`derive`) identical across Tasks 2, 3, 8; response key `patient.attributes.pcount` consistent (Task 10); measure id `pcount` consistent across compiler (Task 9) and post-processing (Task 11).
- **Known scope cuts (carried from the spec, flagged so they are not silently dropped):**
  - **Axes on interaction attributes** (e.g. stratify by Diagnosis code) are deferred — Task 8 only emits Patient-level axes; interaction attributes are still usable as *filters* (EXISTS). Add as a follow-up if needed.
  - Generic (non-curated) resource attribute generation is deferred (Task 3 skips uncurated types).
  - patientlist, cohorts, censoring, non-bar charts, value-set expansion — out of scope per spec §12.
- **Barchart row-key contract:** rows are keyed by category `id` (`x1`,`y1`) + measure `id` (`pcount`), self-consistent with the `categories`/`measures` metadata. **Task 14 must confirm this against `vue-mri-ui-lib`'s `StackBarChart.vue` parsing**; if the frontend expects different keys, adjust `assembleBarchart` + `compileBarchart` aliases together (they are the only two places keys are produced).
```
