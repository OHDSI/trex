# FHIR Server as a Trex Function — Implementation Plan (Phase 1: Core REST)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reimplement the FHIR R4 REST server (currently the native Rust DuckDB extension `plugins/fhir`) as a Deno edge-function plugin `plugins/fhir-fn`, mounted at `/trex/fhir/{dataset_id}/...`, reaching behavioral parity for the core REST surface.

**Architecture:** A single `Deno.serve()` worker registered via `trex.functions.api` (`source: "/fhir"`). Requests resolve to DuckDB SQL against the same shared in-memory DuckDB used by the rest of the runtime, via `globalThis.Trex.databaseManager()`, with exactly one leased pool session pinned per request and `close()`d in `finally`. The TS modules port the Rust modules one-for-one. The native `plugins/fhir` extension is left untouched and runs in parallel.

**Tech Stack:** Deno (Supabase Edge Runtime), TypeScript, DuckDB SQL (via `Trex.databaseManager()`), the existing `cql2elm` scalar function (Phase 2 only). Tests: `deno test` for pure modules; the existing Python `integration-tests` suite (repointed) for end-to-end parity.

**Source of truth for behavior:** Each port task names the exact Rust file in `plugins/fhir/src/` it reproduces. When a task says "port `<file>`", reproduce that file's public functions with the listed TypeScript signatures and identical observable behavior. Translation conventions, applied throughout:
- `serde_json::Value` → `unknown` / typed interfaces; `Vec<T>` → `T[]`.
- `RequestConn::execute(sql).await` → `await conn.query(sql, params)` (see Task 2).
- `AppError` → `FhirError` (Task 4); return it by `throw`.
- Rust `#[cfg(test)] mod tests` blocks → Deno tests in the matching `*_test.ts`; transcribe the existing assertions.
- All identifiers/schemas built via `sql_safety.ts` helpers (Task 3) — never string-concatenate a dataset id into SQL without them.

**Scope:** Phase 1 only — metadata/capability, dataset CRUD, resource CRUD, search, history, transaction bundle, `$import`, `$export`+NDJSON. Phases 2 (CQL/measure via cql2elm) and 3 (auth roles/scopes) get their own plans; see "Follow-up phases" at the end.

---

## File structure (Phase 1)

```
plugins/fhir-fn/
  package.json                 # trex.functions.api registration (Task 1)
  deno.json                    # import map (Task 1)
  data/
    search-parameters.json     # copied from plugins/fhir/data (Task 5)
    profiles-types.json
    profiles-resources.json
  functions/
    index.ts                   # Deno.serve entrypoint -> router (Task 1, 9)
    router.ts                   # path parsing + dispatch + response post-processing (Task 9)
    db.ts                      # shared-DuckDB wrapper, pinned session/request (Task 2)
    sql_safety.ts              # validation + identifier/schema escaping (Task 3)
    error.ts                   # FhirError + OperationOutcome + status mapping (Task 4)
    fhir/
      resource_registry.ts     # (Task 5)
      structure_definition.ts  # (Task 6)
      capability.ts            # (Task 6)
      search_parameter.ts      # (Task 8)
      validation.ts            # (Task 15)
      bundle_processor.ts      # (Task 15)
    schema/
      type_mapping.ts          # (Task 7)
      sql_builder.ts           # (Task 7)
      generator.ts             # (Task 7)
      json_transform.ts        # (Task 7)
    handlers/
      metadata.ts              # (Task 10)
      dataset.ts               # (Task 11)
      crud.ts                 # (Task 12)
      search.ts               # (Task 13)
      history.ts              # (Task 14)
      bundle.ts               # (Task 15)
      upsert.ts               # (Task 16)
      import.ts               # (Task 17)
      export.ts               # (Task 18)
    export/
      ndjson.ts               # (Task 18)
  test/
    *_test.ts                  # deno unit tests, colocated per task
integration-tests/
  test_fhir_fn.py              # repointed parity harness (Task 19)
```

---

## Task 1: Scaffold the plugin and a health endpoint

**Files:**
- Create: `plugins/fhir-fn/package.json`
- Create: `plugins/fhir-fn/deno.json`
- Create: `plugins/fhir-fn/functions/index.ts`
- Create: `plugins/fhir-fn/test/health_test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/fhir-fn/test/health_test.ts`:
```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handle } from "../functions/index.ts";

Deno.test("health returns 200 ok", async () => {
  const res = await handle(new Request("http://x/health"));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).status, "ok");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-fn && deno test functions/ test/`
Expected: FAIL — `Module not found` / `handle` not exported.

- [ ] **Step 3: Write minimal implementation**

`plugins/fhir-fn/functions/index.ts`:
```ts
// @ts-nocheck - Deno edge function, not compiled by tsc

/** Pure request handler — exported so unit tests can call it without a socket. */
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // The runtime mounts this worker under /trex/fhir; in production the worker
  // sees the path AFTER the mount. Strip a leading /trex/fhir if present so the
  // same handler works in unit tests (which call /health directly) and mounted.
  const path = url.pathname.replace(/^\/trex\/fhir/, "") || "/";
  if (path === "/health") {
    return Response.json({ status: "ok" });
  }
  return Response.json({ resourceType: "OperationOutcome" }, { status: 404 });
}

Deno.serve((req) => handle(req));
```

`plugins/fhir-fn/deno.json`:
```json
{
  "imports": {
    "std/": "https://deno.land/std@0.224.0/"
  }
}
```

`plugins/fhir-fn/package.json`:
```json
{
  "name": "@trex/fhir-fn",
  "version": "0.1.0",
  "description": "FHIR R4 server as a Trex edge function",
  "type": "module",
  "trex": {
    "functions": {
      "env": {
        "_shared": {
          "FHIR_BASE_PATH": "/trex/fhir"
        }
      },
      "api": [
        { "source": "/fhir", "function": "/functions" }
      ]
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/fhir-fn && deno test functions/ test/`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add -f plugins/fhir-fn
git commit -m "feat(fhir-fn): scaffold plugin with health endpoint"
```

---

## Task 2: DB access wrapper (`db.ts`) — one pinned session per request

Ports `query_executor.rs::RequestConn`. The native server pins one DuckDB
Connection for the request lifetime so `BEGIN/COMMIT/ROLLBACK` cannot interleave
between concurrent requests, and destroys the session on drop. We reproduce that
with `globalThis.Trex.databaseManager()` (the pattern in
`plugins/devx/functions/duckdb.ts`): lease exactly one session, reuse it for the
request, `close()` it in `finally`. Failing to `close()` drains the shared
DuckDB pool (default 64) and wedges the node.

**Files:**
- Create: `plugins/fhir-fn/functions/db.ts`
- Create: `plugins/fhir-fn/test/db_test.ts`

- [ ] **Step 1: Write the failing test** (mocks `globalThis.Trex`)

`plugins/fhir-fn/test/db_test.ts`:
```ts
import { assertEquals } from "std/assert/mod.ts";
import { withConnection } from "../functions/db.ts";

function installMockTrex(log: string[]) {
  (globalThis as any).Trex = {
    databaseManager() {
      return {
        getConnection() {
          log.push("lease");
          return {
            connection: {
              async execute(sql: string) {
                log.push(`exec:${sql}`);
                return [{ column0: `rows-for:${sql}` }];
              },
              close() { log.push("close"); },
            },
          };
        },
      };
    },
  };
}

Deno.test("withConnection leases once, runs queries, closes once", async () => {
  const log: string[] = [];
  installMockTrex(log);
  const out = await withConnection(async (conn) => {
    const a = await conn.query("SELECT 1");
    const b = await conn.query("SELECT 2");
    return [a, b];
  });
  assertEquals(out, ["rows-for:SELECT 1", "rows-for:SELECT 2"]);
  assertEquals(log, ["lease", "exec:SELECT 1", "exec:SELECT 2", "close"]);
});

Deno.test("withConnection closes even when callback throws", async () => {
  const log: string[] = [];
  installMockTrex(log);
  await assertRejects(() => withConnection(async () => { throw new Error("boom"); }));
  assertEquals(log.at(-1), "close");
});
```
Add `import { assertRejects } from "std/assert/mod.ts";` at the top.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-fn && deno test test/db_test.ts`
Expected: FAIL — `withConnection` not found.

- [ ] **Step 3: Write minimal implementation**

`plugins/fhir-fn/functions/db.ts`:
```ts
// @ts-nocheck - Deno edge function

export interface Conn {
  /** Execute SQL; returns parsed rows (array of objects). */
  query(sql: string, params?: unknown[]): Promise<any>;
}

function leaseMemoryConnection() {
  const dbm = (globalThis as any).Trex?.databaseManager?.();
  if (!dbm) throw new Error("DuckDB not available — Trex.databaseManager() not found");
  // Suppress the harmless "Error getting dialect for memory" log (see devx/duckdb.ts).
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].includes("Error getting dialect for memory")) return;
    origError.apply(console, args);
  };
  try {
    const c = dbm.getConnection("memory", "main", "main", "main", {});
    return c.connection; // TrexDB instance (leases one pool session)
  } finally {
    console.error = origError;
  }
}

/**
 * Run `fn` with a single pinned DuckDB session, released afterwards.
 * One lease + one close per request — preserves the RequestConn isolation
 * model and avoids draining the shared pool.
 */
export async function withConnection<T>(fn: (conn: Conn) => Promise<T>): Promise<T> {
  const raw = leaseMemoryConnection();
  const conn: Conn = {
    async query(sql: string, params: unknown[] = []) {
      return await raw.execute(sql, params);
    },
  };
  try {
    return await fn(conn);
  } finally {
    try { raw.close?.(); } catch { /* best-effort */ }
  }
}

/** Convenience: a query helper that returns the first row's `column0` JSON string,
 *  matching how the native handlers read scalar JSON results. */
export async function scalarJson(conn: Conn, sql: string, params: unknown[] = []): Promise<string> {
  const rows = await conn.query(sql, params);
  return rows?.[0]?.column0 ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/fhir-fn && deno test test/db_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add -f plugins/fhir-fn/functions/db.ts plugins/fhir-fn/test/db_test.ts
git commit -m "feat(fhir-fn): shared-DuckDB connection wrapper with pinned session"
```

---

## Task 3: `sql_safety.ts` — validation + identifier/schema escaping

Port `plugins/fhir/src/sql_safety.rs`. Reproduce every `pub fn` and transcribe
its existing `#[cfg(test)]` assertions.

**Public API (TS signatures):**
```ts
export function validateDatasetId(id: string): void;        // throws FhirError.badRequest on invalid
export function validateResourceType(rt: string, registry: ResourceRegistry): void;
export function validateFhirId(id: string): void;
export function validateVersionId(id: string): void;
export function validateUuid(id: string): void;
export function escapeIdentifier(name: string): string;     // -> "\"name\"" with internal quotes doubled
export function escapeString(value: string): string;        // single-quote doubled
export function toSchemaName(datasetId: string): string;    // escapeIdentifier(datasetId.replaceAll("-","_"))
export function toQualifiedSchema(dbName: string, datasetId: string): string; // "\"db\".\"schema\""
export function toQualifiedMetaSchema(dbName: string): string;
```

**Files:**
- Create: `plugins/fhir-fn/functions/sql_safety.ts`
- Create: `plugins/fhir-fn/test/sql_safety_test.ts`

- [ ] **Step 1: Write the failing test** (transcribed from `sql_safety.rs` tests)

`plugins/fhir-fn/test/sql_safety_test.ts`:
```ts
import { assertEquals, assertThrows } from "std/assert/mod.ts";
import {
  validateDatasetId, validateFhirId, escapeIdentifier, escapeString,
  toSchemaName, toQualifiedSchema, toQualifiedMetaSchema,
} from "../functions/sql_safety.ts";

Deno.test("validateDatasetId accepts valid, rejects bad", () => {
  validateDatasetId("my-dataset");
  validateDatasetId("abc123");
  assertThrows(() => validateDatasetId(""));
  assertThrows(() => validateDatasetId("a".repeat(129)));
  assertThrows(() => validateDatasetId("bad;input"));
  assertThrows(() => validateDatasetId("bad'input"));
  assertThrows(() => validateDatasetId('bad"input'));
});

Deno.test("escapeIdentifier quotes", () => {
  assertEquals(escapeIdentifier("plain"), '"plain"');
});

Deno.test("escapeString doubles single quotes", () => {
  assertEquals(escapeString("O'Brien"), "O''Brien");
});

Deno.test("toSchemaName replaces hyphens", () => {
  assertEquals(toSchemaName("my-dataset"), '"my_dataset"');
  assertEquals(toSchemaName("plain"), '"plain"');
});

Deno.test("toQualifiedSchema and meta schema", () => {
  assertEquals(toQualifiedSchema("memory", "my-dataset"), '"memory"."my_dataset"');
  assertEquals(toQualifiedMetaSchema("memory"), toQualifiedMetaSchema("memory"));
});
```
> Note: confirm `toQualifiedMetaSchema("memory")`'s exact expected string by reading `sql_safety.rs::test_to_qualified_meta_schema` and pin it explicitly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-fn && deno test test/sql_safety_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Port `sql_safety.rs` to `plugins/fhir-fn/functions/sql_safety.ts`. Each
`validate*` throws `FhirError.badRequest(msg)` (Task 4) instead of returning
`Result::Err`. `escapeIdentifier`/`escapeString`/`toSchemaName`/
`toQualifiedSchema`/`toQualifiedMetaSchema` are direct string translations of the
Rust bodies (lines 80–106 of `sql_safety.rs`). `validateResourceType` takes the
registry (Task 5); stub its import now and wire in Task 5.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/fhir-fn && deno test test/sql_safety_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -f plugins/fhir-fn/functions/sql_safety.ts plugins/fhir-fn/test/sql_safety_test.ts
git commit -m "feat(fhir-fn): port sql_safety validation and escaping"
```

---

## Task 4: `error.ts` — FhirError + OperationOutcome

Port `plugins/fhir/src/error.rs`. The enum becomes a class with static
constructors; `operationOutcome()` and `status` mirror the Rust mapping exactly.

**Files:**
- Create: `plugins/fhir-fn/functions/error.ts`
- Create: `plugins/fhir-fn/test/error_test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/fhir-fn/test/error_test.ts`:
```ts
import { assertEquals } from "std/assert/mod.ts";
import { FhirError } from "../functions/error.ts";

Deno.test("status + issue code mapping", () => {
  assertEquals(FhirError.notFound("x").status, 404);
  assertEquals(FhirError.badRequest("x").status, 400);
  assertEquals(FhirError.conflict("x").status, 409);
  assertEquals(FhirError.gone("x").status, 410);
  assertEquals(FhirError.internal("x").status, 500);
  assertEquals(FhirError.timeout("x").status, 408);
});

Deno.test("operationOutcome shape", () => {
  const oo = FhirError.notFound("missing").operationOutcome();
  assertEquals(oo.resourceType, "OperationOutcome");
  assertEquals(oo.issue[0].code, "not-found");
  assertEquals(oo.issue[0].diagnostics, "missing");
  assertEquals(oo.issue[0].severity, "error");
});

Deno.test("toResponse sets fhir content-type", () => {
  const res = FhirError.badRequest("bad").toResponse();
  assertEquals(res.status, 400);
  assertEquals(res.headers.get("content-type"), "application/fhir+json");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd plugins/fhir-fn && deno test test/error_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`plugins/fhir-fn/functions/error.ts`:
```ts
// @ts-nocheck - Deno edge function
type Kind = "not-found" | "invalid" | "conflict" | "deleted" | "exception" | "timeout";

const STATUS: Record<Kind, number> = {
  "not-found": 404, "invalid": 400, "conflict": 409,
  "deleted": 410, "exception": 500, "timeout": 408,
};

export class FhirError extends Error {
  constructor(public readonly code: Kind, public readonly diagnostics: string) {
    super(diagnostics);
  }
  get status(): number { return STATUS[this.code]; }

  static notFound(m: string) { return new FhirError("not-found", m); }
  static badRequest(m: string) { return new FhirError("invalid", m); }
  static conflict(m: string) { return new FhirError("conflict", m); }
  static gone(m: string) { return new FhirError("deleted", m); }
  static internal(m: string) { return new FhirError("exception", m); }
  static timeout(m: string) { return new FhirError("timeout", m); }

  operationOutcome() {
    return {
      resourceType: "OperationOutcome",
      issue: [{ severity: "error", code: this.code, diagnostics: this.diagnostics }],
    };
  }
  toResponse(): Response {
    return new Response(JSON.stringify(this.operationOutcome()), {
      status: this.status,
      headers: { "content-type": "application/fhir+json" },
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd plugins/fhir-fn && deno test test/error_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -f plugins/fhir-fn/functions/error.ts plugins/fhir-fn/test/error_test.ts
git commit -m "feat(fhir-fn): port FhirError and OperationOutcome"
```

---

## Task 5: `fhir/resource_registry.ts` + bundled data files

Port `plugins/fhir/src/fhir/resource_registry.rs`. It loads the FHIR definition
JSON (`data/search-parameters.json`, `data/profiles-types.json`,
`data/profiles-resources.json`) and answers: is this a known resource type, list
of resource types, per-type search params, per-type json-transform spec.

**Files:**
- Create: `plugins/fhir-fn/data/{search-parameters,profiles-types,profiles-resources}.json` (copies)
- Create: `plugins/fhir-fn/functions/fhir/resource_registry.ts`
- Create: `plugins/fhir-fn/test/resource_registry_test.ts`

- [ ] **Step 1: Copy the data files**

```bash
mkdir -p plugins/fhir-fn/data
cp plugins/fhir/data/search-parameters.json plugins/fhir-fn/data/
cp plugins/fhir/data/profiles-types.json plugins/fhir-fn/data/
cp plugins/fhir/data/profiles-resources.json plugins/fhir-fn/data/
```

- [ ] **Step 2: Write the failing test**

`plugins/fhir-fn/test/resource_registry_test.ts`:
```ts
import { assert, assertEquals } from "std/assert/mod.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";

Deno.test("registry knows Patient and rejects unknown", async () => {
  const reg = await ResourceRegistry.load();
  assert(reg.isKnownResourceType("Patient"));
  assert(!reg.isKnownResourceType("Nonsense"));
  assert(reg.resourceTypes().includes("Observation"));
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd plugins/fhir-fn && deno test test/resource_registry_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

Port `resource_registry.rs`. Load JSON with
`JSON.parse(await Deno.readTextFile(new URL("../../data/<f>.json", import.meta.url)))`.
Expose:
```ts
export class ResourceRegistry {
  static load(): Promise<ResourceRegistry>;
  isKnownResourceType(rt: string): boolean;
  resourceTypes(): string[];
  getSearchParameters(rt: string): SearchParamDef[];   // shape per search_parameter.rs (Task 8)
  getJsonTransform(rt: string): JsonTransformSpec;      // shape per schema/json_transform.rs (Task 7)
}
```
Then wire `validateResourceType` in `sql_safety.ts` (Task 3) to call
`registry.isKnownResourceType`.

- [ ] **Step 5: Run test to verify it passes & commit**

Run: `cd plugins/fhir-fn && deno test test/resource_registry_test.ts` → PASS
```bash
git add -f plugins/fhir-fn/data plugins/fhir-fn/functions/fhir/resource_registry.ts plugins/fhir-fn/test/resource_registry_test.ts
git commit -m "feat(fhir-fn): port resource registry + bundle definition data"
```

---

## Task 6: `fhir/structure_definition.ts` + `fhir/capability.ts`

Port `plugins/fhir/src/fhir/structure_definition.rs` (parses StructureDefinitions
into the element model used for schema generation and validation) and
`plugins/fhir/src/fhir/capability.rs` (builds the `CapabilityStatement` served at
`/metadata`).

**Files:**
- Create: `plugins/fhir-fn/functions/fhir/structure_definition.ts`
- Create: `plugins/fhir-fn/functions/fhir/capability.ts`
- Create: `plugins/fhir-fn/test/capability_test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/fhir-fn/test/capability_test.ts`:
```ts
import { assertEquals } from "std/assert/mod.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { buildCapabilityStatement } from "../functions/fhir/capability.ts";

Deno.test("capability statement lists Patient resource", async () => {
  const reg = await ResourceRegistry.load();
  const cs = buildCapabilityStatement(reg, "ds1", "http://h/trex/fhir/ds1");
  assertEquals(cs.resourceType, "CapabilityStatement");
  const patient = cs.rest[0].resource.find((r: any) => r.type === "Patient");
  assertEquals(patient?.type, "Patient");
});
```

- [ ] **Step 2–5:** Run to fail, port both files (signatures below), run to pass, commit.

```ts
// structure_definition.ts
export interface ElementDef { path: string; types: string[]; max: string; /* ...per Rust */ }
export function parseStructureDefinition(sd: unknown): ElementDef[];

// capability.ts — mirror capability.rs output exactly (resource types, interactions,
// searchParams, software/fhirVersion fields). base = full external base incl dataset.
export function buildCapabilityStatement(reg: ResourceRegistry, datasetId: string, base: string): any;
```
```bash
git add -f plugins/fhir-fn/functions/fhir/structure_definition.ts plugins/fhir-fn/functions/fhir/capability.ts plugins/fhir-fn/test/capability_test.ts
git commit -m "feat(fhir-fn): port structure definitions and capability statement"
```

---

## Task 7: `schema/` — type_mapping, sql_builder, generator, json_transform

Port the four files in `plugins/fhir/src/schema/`. Together they: map FHIR types
to DuckDB column types (`type_mapping.rs`), build `CREATE TABLE` / column SQL
(`sql_builder.rs`), generate a dataset's per-resource tables from
StructureDefinitions (`generator.rs`), and transform a stored DB row ⇄ FHIR JSON
resource (`json_transform.rs`).

**Files:**
- Create: `plugins/fhir-fn/functions/schema/{type_mapping,sql_builder,generator,json_transform}.ts`
- Create: `plugins/fhir-fn/test/json_transform_test.ts`

- [ ] **Step 1: Write the failing test** (the round-trip is the highest-value invariant)

`plugins/fhir-fn/test/json_transform_test.ts`:
```ts
import { assertEquals } from "std/assert/mod.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { resourceToRow, rowToResource } from "../functions/schema/json_transform.ts";

Deno.test("Patient survives row round-trip", async () => {
  const reg = await ResourceRegistry.load();
  const spec = reg.getJsonTransform("Patient");
  const patient = {
    resourceType: "Patient",
    id: "p1",
    name: [{ family: "Doe", given: ["John"] }],
    gender: "male",
  };
  const row = resourceToRow(patient, spec);
  const back = rowToResource(row, spec);
  assertEquals(back.resourceType, "Patient");
  assertEquals(back.id, "p1");
  assertEquals(back.gender, "male");
  assertEquals(back.name[0].family, "Doe");
});
```

- [ ] **Step 2: Run to fail.** `deno test test/json_transform_test.ts` → FAIL.

- [ ] **Step 3: Port the four files.** Signatures:
```ts
// type_mapping.ts
export function fhirTypeToDuckType(fhirType: string): string;

// sql_builder.ts
export function buildCreateTableSql(qualifiedSchema: string, resourceType: string, cols: ColumnDef[]): string;
export function buildInsertSql(qualifiedSchema: string, resourceType: string, row: Record<string, unknown>): { sql: string; params: unknown[] };

// generator.ts — build all tables for a dataset's resource types
export function generateSchemaSql(qualifiedSchema: string, reg: ResourceRegistry, resourceTypes: string[]): string[];

// json_transform.ts
export interface JsonTransformSpec { /* per resource_registry.getJsonTransform */ }
export function resourceToRow(resource: any, spec: JsonTransformSpec): Record<string, unknown>;
export function rowToResource(row: Record<string, unknown>, spec: JsonTransformSpec): any;
```

- [ ] **Step 4: Run to pass.** `deno test test/json_transform_test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add -f plugins/fhir-fn/functions/schema plugins/fhir-fn/test/json_transform_test.ts
git commit -m "feat(fhir-fn): port schema generation and json transform"
```

---

## Task 8: `fhir/search_parameter.ts`

Port `plugins/fhir/src/fhir/search_parameter.rs` (676 LOC — the largest pure
module). It parses FHIR search query parameters (`?name=Doe&birthdate=ge2000`,
modifiers, prefixes, chained/`_include`, `_sort`, `_count`) into SQL WHERE/ORDER
fragments + params.

**Files:**
- Create: `plugins/fhir-fn/functions/fhir/search_parameter.ts`
- Create: `plugins/fhir-fn/test/search_parameter_test.ts`

- [ ] **Step 1: Write the failing test** (transcribe representative cases from `search_parameter.rs` tests)

`plugins/fhir-fn/test/search_parameter_test.ts`:
```ts
import { assert, assertEquals } from "std/assert/mod.ts";
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";
import { buildSearchClause } from "../functions/fhir/search_parameter.ts";

Deno.test("string param builds parameterized WHERE", async () => {
  const reg = await ResourceRegistry.load();
  const q = new URLSearchParams("gender=male");
  const { where, params } = buildSearchClause("Patient", q, reg);
  assert(where.toLowerCase().includes("gender"));
  assertEquals(params, ["male"]);
});

Deno.test("date prefix ge maps to >=", async () => {
  const reg = await ResourceRegistry.load();
  const q = new URLSearchParams("birthdate=ge2000-01-01");
  const { where } = buildSearchClause("Patient", q, reg);
  assert(where.includes(">="));
});
```
> Add 4–6 more cases mirroring `search_parameter.rs` tests: token (`identifier`),
> reference (`subject=Patient/123`), `_count`/`_sort`, missing-param ignored.

- [ ] **Steps 2–5:** Run to fail; port the module with signature:
```ts
export interface SearchClause { where: string; params: unknown[]; orderBy?: string; limit?: number; offset?: number; includes?: string[]; }
export function buildSearchClause(resourceType: string, query: URLSearchParams, reg: ResourceRegistry): SearchClause;
```
Run to pass; commit.
```bash
git add -f plugins/fhir-fn/functions/fhir/search_parameter.ts plugins/fhir-fn/test/search_parameter_test.ts
git commit -m "feat(fhir-fn): port FHIR search parameter parsing"
```

---

## Task 9: `router.ts` — dispatch + response post-processing

Port `plugins/fhir/src/router.rs` + the relevant parts of
`fhir_server.rs`/`state.rs`. Build an `AppState` (the loaded `ResourceRegistry`
+ db name + external base) once, parse the path after the mount, dispatch to
handlers, and post-process every response: force `application/fhir+json` and
rewrite `Bundle.fullUrl` entries and `Location` headers to the external base
`<base>/{dataset_id}`.

**Files:**
- Create: `plugins/fhir-fn/functions/router.ts`
- Modify: `plugins/fhir-fn/functions/index.ts` (delegate `handle` to the router)
- Create: `plugins/fhir-fn/test/router_test.ts`

- [ ] **Step 1: Write the failing test**

`plugins/fhir-fn/test/router_test.ts`:
```ts
import { assertEquals } from "std/assert/mod.ts";
import { parseRoute } from "../functions/router.ts";

Deno.test("parses dataset/resource/id", () => {
  assertEquals(parseRoute("GET", "/ds1/Patient/p1"),
    { kind: "read", datasetId: "ds1", resourceType: "Patient", id: "p1" });
});
Deno.test("parses search", () => {
  assertEquals(parseRoute("GET", "/ds1/Patient").kind, "search");
});
Deno.test("parses metadata", () => {
  assertEquals(parseRoute("GET", "/ds1/metadata").kind, "metadata");
});
Deno.test("parses bundle post to dataset root", () => {
  assertEquals(parseRoute("POST", "/ds1").kind, "bundle");
});
```

- [ ] **Step 2: Run to fail.**

- [ ] **Step 3: Implement** `parseRoute` (a `RouteKind` discriminated union covering
every route in `router.rs`: health, metrics, datasets CRUD, metadata, search,
create, read, update, delete, history, version-read, bundle, `$import`,
`$export`, `$export/status`, type `$export`; Phase 2 adds `$cql`/measure). Then a
`route(req, state)` dispatcher that maps each `RouteKind` to its handler (handlers
arrive in Tasks 10–18; stub unimplemented ones to `FhirError.internal("not yet")`
so this task compiles). Add `postProcess(res, base, datasetId)` that rewrites
`Bundle.fullUrl`/`Location` and sets content-type. Update `index.ts`:
```ts
import { route } from "./router.ts";
import { getState } from "./state.ts"; // memoized AppState (registry load once)
export async function handle(req: Request): Promise<Response> {
  const state = await getState();
  return await route(req, state);
}
Deno.serve((req) => handle(req));
```

- [ ] **Step 4: Run to pass.** `deno test test/router_test.ts` → PASS.

- [ ] **Step 5: Commit.**
```bash
git add -f plugins/fhir-fn/functions/router.ts plugins/fhir-fn/functions/state.ts plugins/fhir-fn/functions/index.ts plugins/fhir-fn/test/router_test.ts
git commit -m "feat(fhir-fn): router, route parsing, and response rewriting"
```

---

## Tasks 10–18: Handlers

Each handler task has the same shape (shown once for Task 10, abbreviated after):
write a Deno unit test that drives the handler with the mock `Trex` from Task 2's
test (asserting the SQL built + the FHIR JSON shaped), port the matching
`handlers/*.rs`, run, commit. Handlers receive `(route, req, conn, state)` and
return a `Response` or throw `FhirError`. All DB work goes through the single
`conn` from `withConnection`.

### Task 10: `handlers/metadata.ts`
Port `handlers/metadata.rs`. `GET /{ds}/metadata` → `buildCapabilityStatement`.

- [ ] **Step 1: failing test**
```ts
// test/metadata_test.ts
import { assertEquals } from "std/assert/mod.ts";
import { getMetadata } from "../functions/handlers/metadata.ts";
Deno.test("metadata returns CapabilityStatement", async () => {
  const reg = await (await import("../functions/fhir/resource_registry.ts")).ResourceRegistry.load();
  const res = await getMetadata({ datasetId: "ds1" } as any, { registry: reg, base: "http://h/trex/fhir" } as any);
  assertEquals((await res.json()).resourceType, "CapabilityStatement");
});
```
- [ ] **Steps 2–5:** fail → port `handlers/metadata.rs` (`export function getMetadata(route, state): Promise<Response>`) → pass → commit `feat(fhir-fn): metadata handler`.

### Task 11: `handlers/dataset.ts`
Port `handlers/dataset.rs` (790 LOC). Covers `POST/GET/PUT/DELETE /datasets`,
`GET /datasets/{id}`. Creating a dataset initializes the meta schema
(`init_fhir_meta` in `lib.rs`: `_datasets`, `_export_jobs`) and generates the
dataset's per-resource tables via `schema/generator.ts`. Test: create dataset →
201 + row in `_datasets` (assert SQL via mock); duplicate → 409.
- [ ] Steps 1–5; commit `feat(fhir-fn): dataset CRUD + meta schema init`.

### Task 12: `handlers/crud.ts`
Port `handlers/crud.rs` (635 LOC): create/read/update/delete a resource +
versioning. Read missing → 404; deleted → 410 (Gone); create returns `Location`.
Tests transcribe these from `test_fhir_standalone.py`'s CRUD cases.
- [ ] Steps 1–5; commit `feat(fhir-fn): resource CRUD handlers`.

### Task 13: `handlers/search.ts`
Port `handlers/search.rs`: uses `buildSearchClause` (Task 8) → SQL → searchset
`Bundle` with `fullUrl` per entry (rewritten in `postProcess`). Test: search
returns a `Bundle` of type `searchset` with `total`.
- [ ] Steps 1–5; commit `feat(fhir-fn): search handler`.

### Task 14: `handlers/history.ts`
Port `handlers/history.rs`: `_history` and `_history/{vid}` → history `Bundle` /
specific version. Test: history of an updated resource has ≥2 entries.
- [ ] Steps 1–5; commit `feat(fhir-fn): history handlers`.

### Task 15: `fhir/validation.ts` + `fhir/bundle_processor.ts` + `handlers/bundle.ts`
Port `fhir/validation.rs`, `fhir/bundle_processor.rs` (465 LOC), and
`handlers/bundle.rs` (494 LOC). `POST /{ds}` processes a transaction/batch
`Bundle`. **Transaction bundles run inside one pinned session** (already
guaranteed by `withConnection`): issue `BEGIN`, process entries, `COMMIT`, and on
any error `ROLLBACK` + throw. Tests: a transaction `Bundle` with 2 creates →
`transaction-response` Bundle, both resources readable; a failing entry rolls the
whole bundle back.
- [ ] Steps 1–5; commit `feat(fhir-fn): bundle processing with transaction isolation`.

### Task 16: `handlers/upsert.ts`
Port `handlers/upsert.rs`: conditional create/update (`PUT` with `If-None-Exist`,
search-based upsert). Test: conditional create twice → one resource.
- [ ] Steps 1–5; commit `feat(fhir-fn): conditional upsert handler`.

### Task 17: `handlers/import.ts`
Port `handlers/import.rs` (303 LOC): `POST /{ds}/$import` streams NDJSON lines,
inserting resources. Test: import 3 NDJSON Patients → 3 rows.
- [ ] Steps 1–5; commit `feat(fhir-fn): NDJSON $import handler`.

### Task 18: `export/ndjson.ts` + `handlers/export.ts`
Port `export/ndjson.rs` (343 LOC) and `handlers/export.rs` (266 LOC): async bulk
`$export` job model — `GET /{ds}/$export` accepts (202 + `Content-Location`),
writes a job row in `_export_jobs`, produces NDJSON output, and
`$export/status/{job_id}` reports progress/output. **No unbounded poll loops in
the worker** (no client-disconnect signal — see spec risk); the job advances on
status polls / bounded work. Test: start export → 202 + job id; status → file
list when complete.
- [ ] Steps 1–5; commit `feat(fhir-fn): bulk $export with async job model`.

---

## Task 19: Repointed integration parity harness

Reuse the existing Python `FhirClient` against the mounted function instead of a
`trex_fhir_start` port.

**Files:**
- Create: `integration-tests/test_fhir_fn.py`
- Reference: `integration-tests/test_fhir_standalone.py` (client + cases),
  `integration-tests/conftest.py` (`Node`, `alloc_ports`).

- [ ] **Step 1: Write the harness fixture**

A `fhir` fixture that boots a `Node` with the runtime serving the `fhir-fn`
plugin (no `trex_fhir_start` call — the function is mounted at startup), then:
```python
client = FhirClient(f"http://127.0.0.1:{runtime_http_port}/trex/fhir")
```
Poll `client.get("/datasets")` (or `/health` if the runtime exposes the worker
health) until ready. Then import the scenario helpers/assertions from
`test_fhir_standalone.py` (CRUD, search, history, bundle, import, export) and run
them against this client.

> Determine the runtime HTTP port and how `conftest.Node` launches the function
> runtime by reading `conftest.py`; if the existing `Node` only loads `.trex`
> extensions, extend the fixture to start the runtime process that hosts function
> plugins (mirror how `devx` is exercised in CI). Document the exact command in
> the fixture docstring.

- [ ] **Step 2: Run the parity suite**

Run: `cd integration-tests && pytest test_fhir_fn.py -v`
Expected: initially RED (handlers incomplete) — use it as the running acceptance
gate while implementing Tasks 10–18; GREEN is Phase 1 done.

- [ ] **Step 3: Commit**
```bash
git add integration-tests/test_fhir_fn.py
git commit -m "test(fhir-fn): end-to-end parity harness against mounted function"
```

---

## Task 20: Phase 1 acceptance

- [ ] **Step 1: Full unit suite**

Run: `cd plugins/fhir-fn && deno test`
Expected: all PASS.

- [ ] **Step 2: Full parity suite**

Run: `cd integration-tests && pytest test_fhir_fn.py -v`
Expected: all PASS (CRUD, search, history, bundle, import, export).

- [ ] **Step 3: Manual smoke**

Boot the runtime with the plugin and:
```bash
curl -s http://127.0.0.1:<port>/trex/fhir/ds1/metadata | head
curl -s -X POST http://127.0.0.1:<port>/trex/fhir/ds1/Patient \
  -H 'content-type: application/fhir+json' \
  -d '{"resourceType":"Patient","name":[{"family":"Doe"}]}' -i | head
```
Expected: CapabilityStatement; 201 with a `Location` of
`.../trex/fhir/ds1/Patient/<id>` and `application/fhir+json`.

- [ ] **Step 4: Commit any fixups; tag the phase**
```bash
git commit -am "chore(fhir-fn): Phase 1 core REST parity" --allow-empty
```

---

## Self-review (completed)

- **Spec coverage:** plugin dir/registration (T1) ✓; URL surface `/trex/fhir/{dataset}` (T1,T9) ✓; shared-DuckDB + pinned session (T2) ✓; dataset→schema mapping (T3,T11) ✓; all listed components mapped to tasks (T2–T18) ✓; CQL/measure delegated → **deferred to Phase 2** (out of this plan, noted) ✓; OperationOutcome errors (T4) ✓; Bundle.fullUrl/Location rewrite (T9) ✓; bounded `$export` jobs (T18) ✓; parity via existing tests (T19,T20) ✓.
- **Placeholder scan:** Port tasks name an exact Rust source file + give concrete tests + TS signatures (behavioral spec is the named file, not a TODO). No "implement later" left as the sole instruction.
- **Type consistency:** `withConnection`/`Conn`/`conn.query` (T2) used by all handlers; `FhirError` static constructors (T4) used by T3/handlers; `ResourceRegistry.load()/isKnownResourceType/getSearchParameters/getJsonTransform` (T5) consumed by T6/T7/T8; `buildSearchClause` (T8) consumed by T13; `parseRoute`/`RouteKind` (T9) consumed by handlers.

## Follow-up phases (separate plans)

- **Phase 2 — CQL / measure:** port `handlers/cql.rs`, `handlers/measure.rs`,
  `cql/valueset.rs`; obtain ELM via `SELECT trex_fhir_cql_translate(?)` on the
  shared connection; interpret ELM + assemble `MeasureReport` in TS. Acceptance:
  repoint `test_fhir_cql*.py` / `test_fhir_measure.py`.
- **Phase 3 — auth:** add `trex.functions.roles`/`scopes` for FHIR endpoints;
  honor `x-user-id`/`x-user-role`.
