// Pure tests for phase 8 media negotiation: the MediaHandlerMap resolution
// (SchemaCache.hs initialMediaHandlers / decodeMediaHandlers), the full
// Plan.hs negotiateContent (custom handlers, any-media-type resolution, the
// db-plan-enabled gate) and the exact PGRST107 payloads.

import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { resolveConfig } from "../functions/config.ts";
import { PgrstError } from "../functions/errors.ts";
import { userApiRequest } from "../functions/parse/api-request.ts";
import { toMime } from "../functions/parse/media-type.ts";
import { callReadPlan } from "../functions/plan/call-plan.ts";
import { mutateReadPlan } from "../functions/plan/mutate-plan.ts";
import { inspectPlan, type WrappedReadPlan, wrappedReadPlan } from "../functions/plan/read-plan.ts";
import {
  dbMediaHandlers,
  decodeMediaHandlers,
  initialMediaHandlers,
  mhKey,
} from "../functions/schema-cache/media-handlers.ts";
import type { Column, MediaHandlerRow, Routine, SchemaCache, Table } from "../functions/schema-cache/types.ts";

// --------------------------------------------------------------------------
// Fixture schema cache (mirrors test/spec/fixtures/schema.sql handlers)
// --------------------------------------------------------------------------

function col(name: string, nominalType: string): Column {
  return { name, description: null, nullable: true, dataType: nominalType, nominalType, maxLen: null, default: null, enumVals: [] };
}

function table(name: string, columns: Column[]): Table {
  return { schema: "test", name, description: null, kind: "table", insertable: true, updatable: true, deletable: true, pkCols: ["id"], columns };
}

const qi = (name: string) => ({ schema: "test", name });

const welcome: Routine = {
  schema: "test",
  name: "welcome",
  description: null,
  params: [],
  returnType: { kind: "single", pgType: { qi: { schema: "test", name: "text/plain" }, composite: false, compositeAlias: false } },
  volatility: "stable",
  hasVariadic: false,
  isolationLvl: null,
  funcSettings: [],
};

const handlerRows: MediaHandlerRow[] = [
  // aggregate over a specific table (CustomMediaSpec twkb_agg)
  { handler: qi("twkb_agg"), target: qi("lines"), mediaType: "application/vnd.twkb", resolvedMediaType: "application/vnd.twkb", baseType: "bytea" },
  // aggregate over anyelement (CustomMediaSpec outfunc_agg)
  { handler: qi("outfunc_agg"), target: { schema: "pg_catalog", name: "anyelement" }, mediaType: "pg/outfunc", resolvedMediaType: "pg/outfunc", baseType: "text" },
  // override of the builtin application/json for one table (ov_json_agg)
  { handler: qi("ov_json_agg"), target: qi("projects"), mediaType: "application/json", resolvedMediaType: "application/json", baseType: "json" },
  // the any ("star/star") domain: matches every accept, resolves octet-stream
  { handler: qi("some_agg"), target: qi("some_numbers"), mediaType: "*/*", resolvedMediaType: "application/octet-stream", baseType: "bytea" },
  // vendored media types cannot be overridden (pgrst_obj_agg)
  { handler: qi("pgrst_obj_agg"), target: { schema: "pg_catalog", name: "anyelement" }, mediaType: "application/vnd.pgrst.object", resolvedMediaType: "application/vnd.pgrst.object", baseType: "json" },
  // scalar-returning proc: the handler is the domain cast, keyed by the proc
  { handler: { schema: "test", name: "text/plain" }, target: qi("welcome"), mediaType: "text/plain", resolvedMediaType: "text/plain", baseType: "text" },
];

const cache: SchemaCache = {
  tables: new Map([
    ["test.projects", table("projects", [col("id", "integer"), col("name", "text")])],
    ["test.lines", table("lines", [col("id", "integer"), col("name", "text"), col("geom", "text")])],
    ["test.some_numbers", table("some_numbers", [col("val", "integer")])],
  ]),
  relationships: new Map(),
  routines: new Map([["test.welcome", [welcome]]]),
  representations: new Map(),
  mediaHandlers: handlerRows,
  timezones: new Set(),
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

interface PlanOpts {
  table?: string;
  method?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

function planFor(query: string, opts: PlanOpts = {}): WrappedReadPlan {
  const tbl = opts.table ?? "projects";
  const conf = resolveConfig({ env: { PGRST_DB_SCHEMAS: "test", ...opts.env } });
  const apiReq = userApiRequest(
    conf,
    { method: opts.method ?? "GET", url: `http://localhost/${tbl}${query}`, headers: new Headers(opts.headers ?? {}) },
    `/${tbl}`,
    new Set(),
  );
  const act = apiReq.iAction;
  if (act.kind !== "ActDb" || act.db.kind !== "ActRelationRead") throw new Error("not a read action");
  return wrappedReadPlan(act.db.qi, conf, cache, apiReq, act.db.headersOnly);
}

function pgrstError(fn: () => unknown): PgrstError {
  const err = assertThrows(fn) as PgrstError;
  if (!(err instanceof PgrstError)) throw new Error(`expected PgrstError, got ${err}`);
  return err;
}

// --------------------------------------------------------------------------
// MediaHandlerMap resolution
// --------------------------------------------------------------------------

Deno.test("initialMediaHandlers: the overridable builtins on anyelement", () => {
  const anyEl = { kind: "RelAnyElement" } as const;
  assertEquals(initialMediaHandlers.size, 4);
  assertEquals(initialMediaHandlers.get(mhKey(anyEl, { kind: "MTAny" })), [
    { kind: "BuiltinOvAggJson" },
    { kind: "MTApplicationJSON" },
  ]);
  assertEquals(initialMediaHandlers.get(mhKey(anyEl, { kind: "MTApplicationJSON" })), [
    { kind: "BuiltinOvAggJson" },
    { kind: "MTApplicationJSON" },
  ]);
  assertEquals(initialMediaHandlers.get(mhKey(anyEl, { kind: "MTTextCSV" })), [
    { kind: "BuiltinOvAggCsv" },
    { kind: "MTTextCSV" },
  ]);
  assertEquals(initialMediaHandlers.get(mhKey(anyEl, { kind: "MTGeoJSON" })), [
    { kind: "BuiltinOvAggGeoJson" },
    { kind: "MTGeoJSON" },
  ]);
});

Deno.test("decodeMediaHandlers: rows become CustomFunc entries; anyelement targets fold to RelAnyElement", () => {
  const map = decodeMediaHandlers(handlerRows);
  const twkb = map.get(mhKey({ kind: "RelId", qi: qi("lines") }, { kind: "MTOther", value: "application/vnd.twkb" }));
  assertEquals(twkb, [
    { kind: "CustomFunc", funcQi: qi("twkb_agg"), target: { kind: "RelId", qi: qi("lines") }, baseType: "bytea" },
    { kind: "MTOther", value: "application/vnd.twkb" },
  ]);
  const outfunc = map.get(mhKey({ kind: "RelAnyElement" }, { kind: "MTOther", value: "pg/outfunc" }));
  assertEquals(outfunc?.[0].kind, "CustomFunc");
  // the star/star domain keys as MTAny and resolves to octet-stream
  const anyMt = map.get(mhKey({ kind: "RelId", qi: qi("some_numbers") }, { kind: "MTAny" }));
  assertEquals(anyMt?.[1], { kind: "MTOctetStream" });
});

Deno.test("dbMediaHandlers: custom handlers override the initial ones and memoize per row list", () => {
  const map = dbMediaHandlers(cache);
  // the initial builtins survive
  assertEquals(map.get(mhKey({ kind: "RelAnyElement" }, { kind: "MTTextCSV" }))?.[0], { kind: "BuiltinOvAggCsv" });
  // custom rows land on top
  assertEquals(map.get(mhKey({ kind: "RelAnyElement" }, { kind: "MTOther", value: "pg/outfunc" }))?.[0].kind, "CustomFunc");
  assertEquals(dbMediaHandlers(cache), map); // same object (WeakMap memoized)
});

// --------------------------------------------------------------------------
// negotiateContent through wrappedReadPlan
// --------------------------------------------------------------------------

Deno.test("negotiation: builtins keep working with custom handlers present", () => {
  // Accept: */* resolves the builtin json even when the table has a custom handler
  const anyPlan = planFor("");
  assertEquals(anyPlan.wrHandler.kind, "BuiltinOvAggJson");
  assertEquals(anyPlan.wrMedia.kind, "MTApplicationJSON");
  assertEquals(planFor("", { headers: { Accept: "text/csv" } }).wrHandler.kind, "BuiltinOvAggCsv");
});

Deno.test("negotiation: a table-specific handler overrides application/json on default select", () => {
  const plan = planFor("", { headers: { Accept: "application/json" } });
  assertEquals(plan.wrHandler, {
    kind: "CustomFunc",
    funcQi: qi("ov_json_agg"),
    target: { kind: "RelId", qi: qi("projects") },
    baseType: "json",
  });
  assertEquals(plan.wrMedia.kind, "MTApplicationJSON");
  // with an explicit select the RelId lookups are skipped → builtin json
  assertEquals(planFor("?select=id", { headers: { Accept: "application/json" } }).wrHandler.kind, "BuiltinOvAggJson");
});

Deno.test("negotiation: custom media types need a handler on the table (PGRST107 otherwise)", () => {
  const plan = planFor("", { table: "lines", headers: { Accept: "application/vnd.twkb" } });
  assertEquals(plan.wrHandler.kind, "CustomFunc");
  assertEquals(toMime(plan.wrMedia), "application/vnd.twkb");
  // CustomMediaSpec: fails "using select query parameter" — the handler only
  // applies to the whole-row aggregate (default select=*)
  const err = pgrstError(() => planFor("?select=id", { table: "lines", headers: { Accept: "application/vnd.twkb" } }));
  assertEquals(err.status, 406);
  assertEquals(err.body, {
    code: "PGRST107",
    message: "None of these media types are available: application/vnd.twkb",
    details: null,
    hint: null,
  });
  // ...and other tables never had one
  const err2 = pgrstError(() => planFor("", { headers: { Accept: "text/plain" } }));
  assertEquals(err2.status, 406);
  assertEquals(err2.body, {
    code: "PGRST107",
    message: "None of these media types are available: text/plain",
    details: null,
    hint: null,
  });
});

Deno.test("negotiation: anyelement handlers apply to every table, even with an explicit select", () => {
  const plan = planFor("?select=id,name", { headers: { Accept: "pg/outfunc" } });
  assertEquals(plan.wrHandler.kind, "CustomFunc");
  assertEquals(toMime(plan.wrMedia), "pg/outfunc");
});

Deno.test("negotiation: a star/star handler accepts any media type and resolves octet-stream", () => {
  // arbitrary accepts hit the (RelId, MTAny) entry first
  const plan = planFor("", { table: "some_numbers", headers: { Accept: "magic/number" } });
  assertEquals(plan.wrHandler.kind, "CustomFunc");
  assertEquals(plan.wrMedia.kind, "MTOctetStream");
  const anyPlan = planFor("", { table: "some_numbers" });
  assertEquals(anyPlan.wrHandler.kind, "CustomFunc");
  assertEquals(anyPlan.wrMedia.kind, "MTOctetStream");
});

Deno.test("negotiation: vendored media types cannot be overridden", () => {
  const plan = planFor("", { headers: { Accept: "application/vnd.pgrst.object+json" } });
  assertEquals(plan.wrHandler, { kind: "BuiltinAggSingleJson", stripNulls: false });
});

Deno.test("negotiation: HEAD gets NoAgg but keeps the negotiated media type", () => {
  const plan = planFor("", { table: "lines", method: "HEAD", headers: { Accept: "application/vnd.twkb" } });
  assertEquals(plan.wrHandler.kind, "NoAgg");
  assertEquals(toMime(plan.wrMedia), "application/vnd.twkb");
});

// --------------------------------------------------------------------------
// vnd.pgrst.plan gates
// --------------------------------------------------------------------------

Deno.test("plan negotiation: refused while db-plan-enabled=false (PGRST107)", () => {
  const err = pgrstError(() => planFor("", { headers: { Accept: "application/vnd.pgrst.plan" } }));
  assertEquals(err.status, 406);
  assertEquals(err.body, {
    code: "PGRST107",
    message: 'None of these media types are available: application/vnd.pgrst.plan+text; for="application/json"',
    details: null,
    hint: null,
  });
});

Deno.test("plan negotiation: enabled resolves the inner handler and keeps the plan media type", () => {
  const env = { PGRST_DB_PLAN_ENABLED: "true" };
  const plan = planFor("", { table: "lines", headers: { Accept: "application/vnd.pgrst.plan+json" }, env });
  assertEquals(plan.wrHandler.kind, "BuiltinOvAggJson");
  assertEquals(plan.wrMedia.kind, "MTVndPlan");
  // ...and the inner lookup goes through the custom handlers too: projects
  // has the application/json override, so its plan resolves the CustomFunc
  assertEquals(planFor("", { headers: { Accept: "application/vnd.pgrst.plan+json" }, env }).wrHandler.kind, "CustomFunc");
  const csvPlan = planFor("", { headers: { Accept: 'application/vnd.pgrst.plan; for="text/csv"; options=analyze|verbose' }, env });
  assertEquals(csvPlan.wrHandler.kind, "BuiltinOvAggCsv");
  assertEquals(
    toMime(csvPlan.wrMedia),
    'application/vnd.pgrst.plan+text; for="text/csv"; options=analyze|verbose',
  );
  // a plan of a custom media type resolves the custom handler
  const twkbPlan = planFor("", {
    table: "lines",
    headers: { Accept: 'application/vnd.pgrst.plan; for="application/vnd.twkb"' },
    env,
  });
  assertEquals(twkbPlan.wrHandler.kind, "CustomFunc");
  assertEquals(twkbPlan.wrMedia.kind, "MTVndPlan");
  // the plan of a singular json keeps the singular handler
  const singPlan = planFor("", { headers: { Accept: 'application/vnd.pgrst.plan; for="application/vnd.pgrst.object+json"' }, env });
  assertEquals(singPlan.wrHandler, { kind: "BuiltinAggSingleJson", stripNulls: false });
});

// --------------------------------------------------------------------------
// Mutations and RPC
// --------------------------------------------------------------------------

Deno.test("negotiation: mutations only aggregate under return=representation", () => {
  const conf = resolveConfig({ env: { PGRST_DB_SCHEMAS: "test" } });
  const mkMut = (headers: Record<string, string>) => {
    const apiReq = userApiRequest(
      conf,
      {
        method: "POST",
        url: "http://localhost/projects",
        headers: new Headers({ "Content-Type": "application/json", ...headers }),
      },
      "/projects",
      new Set(),
      '{"id":1}',
    );
    return mutateReadPlan("MutationCreate", apiReq, qi("projects"), conf, cache);
  };
  assertEquals(mkMut({}).mrHandler.kind, "NoAgg");
  const repr = mkMut({ Prefer: "return=representation", Accept: "application/json" });
  assertEquals(repr.mrHandler.kind, "CustomFunc"); // the ov_json_agg override
});

Deno.test("negotiation: a scalar RPC resolves its domain handler keyed by the proc", () => {
  const conf = resolveConfig({ env: { PGRST_DB_SCHEMAS: "test" } });
  const apiReq = userApiRequest(
    conf,
    { method: "GET", url: "http://localhost/rpc/welcome", headers: new Headers({ Accept: "text/plain" }) },
    "/rpc/welcome",
    new Set(),
  );
  const act = apiReq.iAction;
  if (act.kind !== "ActDb" || act.db.kind !== "ActRoutine") throw new Error("not a routine action");
  const plan = callReadPlan(act.db.qi, conf, cache, apiReq, act.db.invMethod);
  assertEquals(plan.crHandler, {
    kind: "CustomFunc",
    funcQi: { schema: "test", name: "text/plain" },
    target: { kind: "RelId", qi: qi("welcome") },
    baseType: "text",
  });
  assertEquals(plan.crMedia.kind, "MTTextPlain");
});

// --------------------------------------------------------------------------
// inspectPlan (the OpenAPI root negotiation)
// --------------------------------------------------------------------------

Deno.test("inspectPlan: accepts openapi+json / json / any, otherwise PGRST107", () => {
  const conf = resolveConfig({ env: { PGRST_DB_SCHEMAS: "test" } });
  const mkReq = (accept?: string) =>
    userApiRequest(
      conf,
      { method: "GET", url: "http://localhost/", headers: new Headers(accept === undefined ? {} : { Accept: accept }) },
      "/",
      new Set(),
    );
  assertEquals(inspectPlan(mkReq(), false, "test").ipMedia.kind, "MTOpenAPI");
  assertEquals(inspectPlan(mkReq("application/json"), false, "test").ipMedia.kind, "MTOpenAPI");
  assertEquals(inspectPlan(mkReq("application/openapi+json"), true, "test").ipHdrsOnly, true);
  const err = pgrstError(() => inspectPlan(mkReq("text/csv"), false, "test"));
  assertEquals(err.status, 406);
  assertEquals(err.body, {
    code: "PGRST107",
    message: "None of these media types are available: text/csv",
    details: null,
    hint: null,
  });
});
