// Pure tests for the RPC planner (phase 7): findProc overload resolution
// (exact argument-key matching, defaults, variadic, single-unnamed-param
// rules per content type, params=single-object), the PGRST202/PGRST203 error
// payloads (exact message/details/hint incl. fuzzy suggestions), jsonRpcParams
// and the callReadPlan outputs (args, tx mode, CallParams, returnings).

import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { resolveConfig } from "../functions/config.ts";
import { PgrstError } from "../functions/errors.ts";
import { userApiRequest } from "../functions/parse/api-request.ts";
import { type CallReadPlan, callReadPlan, jsonRpcParams } from "../functions/plan/call-plan.ts";
import type {
  RetType,
  Routine,
  RoutineMap,
  RoutineParam,
  SchemaCache,
  Table,
} from "../functions/schema-cache/types.ts";
import { qiKey, relsMapKey } from "../functions/schema-cache/types.ts";

// --------------------------------------------------------------------------
// Fixture routines
// --------------------------------------------------------------------------

function prm(name: string, type: string, opts: Partial<RoutineParam> = {}): RoutineParam {
  return { name, type, typeMaxLength: opts.typeMaxLength ?? type, required: opts.required ?? true, variadic: opts.variadic ?? false };
}

const scalarInt: RetType = {
  kind: "single",
  pgType: { qi: { schema: "pg_catalog", name: "int4" }, composite: false, compositeAlias: false },
};
const setofItems: RetType = {
  kind: "setof",
  pgType: { qi: { schema: "test", name: "items" }, composite: true, compositeAlias: false },
};
const setofText: RetType = {
  kind: "setof",
  pgType: { qi: { schema: "pg_catalog", name: "text" }, composite: false, compositeAlias: false },
};
const voidRet: RetType = {
  kind: "single",
  pgType: { qi: { schema: "pg_catalog", name: "void" }, composite: false, compositeAlias: false },
};

function routine(name: string, params: RoutineParam[], opts: Partial<Routine> = {}): Routine {
  return {
    schema: "test",
    name,
    description: null,
    params,
    returnType: opts.returnType ?? scalarInt,
    volatility: opts.volatility ?? "volatile",
    hasVariadic: params.some((p) => p.variadic),
    isolationLvl: null,
    funcSettings: [],
    ...opts,
  };
}

const routineList: Routine[] = [
  routine("add", [prm("a", "integer"), prm("b", "integer")], { volatility: "immutable" }),
  routine("add", [prm("a", "integer"), prm("b", "integer"), prm("c", "integer")], { volatility: "immutable" }),
  routine("with_default", [prm("a", "integer"), prm("b", "integer", { required: false })], { volatility: "stable" }),
  routine("all_default", [prm("x", "integer", { required: false }), prm("y", "integer", { required: false })]),
  routine("vconcat", [prm("v", "text[]", { variadic: true })], { volatility: "immutable" }),
  routine("single_json", [prm("", "json")], { volatility: "immutable" }),
  routine("single_text", [prm("", "text")], { volatility: "immutable" }),
  routine("single_bytea", [prm("", "bytea")], { volatility: "immutable" }),
  routine("single_obj", [prm("payload", "json")], { volatility: "immutable" }),
  routine("noargs", [], { volatility: "stable" }),
  routine("ambig", [prm("a", "integer")]),
  routine("ambig", [prm("a", "text")]),
  routine("getitems", [prm("min_id", "integer", { required: false })], { returnType: setofItems, volatility: "stable" }),
  routine("getnames", [], { returnType: setofText, volatility: "stable" }),
  routine("voidfn", [], { returnType: voidRet }),
];

const routines: RoutineMap = new Map();
for (const r of routineList) {
  const key = qiKey({ schema: r.schema, name: r.name });
  const overloads = routines.get(key);
  if (overloads) overloads.push(r);
  else routines.set(key, [r]);
}

function col(name: string, nominalType: string) {
  return { name, description: null, nullable: true, dataType: nominalType, nominalType, maxLen: null, default: null, enumVals: [] };
}

const itemsTable: Table = {
  schema: "test",
  name: "items",
  description: null,
  kind: "table",
  insertable: true,
  updatable: true,
  deletable: true,
  pkCols: ["id"],
  columns: [col("id", "integer"), col("name", "text"), col("client_id", "integer")],
};

const cache: SchemaCache = {
  tables: new Map([["test.items", itemsTable]]),
  relationships: new Map([
    [relsMapKey({ schema: "test", name: "items" }, "test"), [{
      kind: "fk",
      table: { schema: "test", name: "items" },
      foreignTable: { schema: "test", name: "clients" },
      isSelf: false,
      cardinality: { tag: "M2O", constraint: "items_client_id_fkey", columns: [["client_id", "id"]] },
      tableIsView: false,
      foreignTableIsView: false,
    }]],
  ]),
  routines,
  representations: new Map(),
  mediaHandlers: [],
  timezones: new Set(),
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

interface CallOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function planFor(fn: string, query: string, opts: CallOpts = {}): CallReadPlan {
  const conf = resolveConfig({ env: { PGRST_DB_SCHEMAS: "test" } });
  const method = opts.method ?? "POST";
  const headers = new Headers(opts.headers ?? {});
  if (opts.body !== undefined && !headers.has("content-type")) headers.set("Content-Type", "application/json");
  const apiReq = userApiRequest(
    conf,
    { method, url: `http://localhost/rpc/${fn}${query}`, headers },
    `/rpc/${fn}`,
    new Set(),
    opts.body ?? "",
  );
  const act = apiReq.iAction;
  if (act.kind !== "ActDb" || act.db.kind !== "ActRoutine") throw new Error("not a routine action");
  return callReadPlan(act.db.qi, conf, cache, apiReq, act.db.invMethod);
}

function planErr(fn: string, query: string, opts: CallOpts = {}): PgrstError {
  const err = assertThrows(() => planFor(fn, query, opts));
  if (!(err instanceof PgrstError)) throw new Error(`expected PgrstError, got ${err}`);
  return err;
}

// --------------------------------------------------------------------------
// Overload resolution — exact argument-key matching
// --------------------------------------------------------------------------

Deno.test("findProc: POST json keys pick the exact overload", () => {
  const two = planFor("add", "", { body: '{"a":1,"b":2}' });
  assertEquals(two.crProc.params.length, 2);
  const three = planFor("add", "", { body: '{"a":1,"b":2,"c":3}' });
  assertEquals(three.crProc.params.length, 3);
});

Deno.test("findProc: GET query-string keys pick the exact overload", () => {
  const two = planFor("add", "?a=1&b=2", { method: "GET" });
  assertEquals(two.crProc.params.length, 2);
  assertEquals(two.crCallPlan.funCArgs, '{"a":"1","b":"2"}');
});

Deno.test("findProc: optional (default) params may be omitted or given", () => {
  assertEquals(planFor("with_default", "", { body: '{"a":1}' }).crProc.name, "with_default");
  assertEquals(planFor("with_default", "", { body: '{"a":1,"b":2}' }).crProc.name, "with_default");
  // required param missing → no match
  assertEquals(planErr("with_default", "", { body: '{"b":2}' }).body.code, "PGRST202");
});

Deno.test("findProc: all-optional params match any subset (incl. empty)", () => {
  assertEquals(planFor("all_default", "", { body: "{}" }).crProc.name, "all_default");
  assertEquals(planFor("all_default", "?y=1", { method: "GET" }).crProc.name, "all_default");
  assertEquals(planErr("all_default", "?z=1", { method: "GET" }).body.code, "PGRST202");
});

Deno.test("findProc: no-param functions require empty argument keys", () => {
  assertEquals(planFor("noargs", "", {}).crProc.name, "noargs");
  assertEquals(planFor("noargs", "", { method: "GET" }).crProc.name, "noargs");
  assertEquals(planErr("noargs", "?a=1", { method: "GET" }).body.code, "PGRST202");
  // a raw content type never matches a no-param function on POST
  const err = planErr("noargs", "", { headers: { "Content-Type": "text/plain" }, body: "x" });
  assertEquals(err.body.code, "PGRST202");
});

// --------------------------------------------------------------------------
// Single-unnamed-param rules per content type
// --------------------------------------------------------------------------

Deno.test("findProc: json body falls back to the single unnamed json param", () => {
  const plan = planFor("single_json", "", { body: '{"x":1}' });
  assertEquals(plan.crProc.name, "single_json");
  assertEquals(plan.crCallPlan.funCParams, { kind: "OnePosParam", param: prm("", "json") });
  // the raw body is the positional argument
  assertEquals(plan.crCallPlan.funCArgs, '{"x":1}');
});

Deno.test("findProc: text/plain body matches the single unnamed text param", () => {
  const plan = planFor("single_text", "", { headers: { "Content-Type": "text/plain" }, body: "hello" });
  assertEquals(plan.crProc.name, "single_text");
  assertEquals(plan.crCallPlan.funCParams.kind, "OnePosParam");
  assertEquals(plan.crCallPlan.funCArgs, "hello");
});

Deno.test("findProc: octet-stream body matches the single unnamed bytea param", () => {
  const plan = planFor("single_bytea", "", { headers: { "Content-Type": "application/octet-stream" }, body: "\\x00" });
  assertEquals(plan.crProc.name, "single_bytea");
});

Deno.test("findProc: unnamed-param functions are not callable via GET", () => {
  // hasSingleUnnamedParam requires isInvPost
  assertEquals(planErr("single_text", "", { method: "GET" }).body.code, "PGRST202");
});

Deno.test("findProc: text body does not match a text param of the wrong single type", () => {
  const err = planErr("single_json", "", { headers: { "Content-Type": "text/plain" }, body: "x" });
  assertEquals(err.body.code, "PGRST202");
});

// --------------------------------------------------------------------------
// Prefer: params=single-object (deprecated but functional in v12)
// --------------------------------------------------------------------------

Deno.test("findProc: params=single-object matches the single json param and calls positionally", () => {
  const plan = planFor("single_obj", "", {
    headers: { Prefer: "params=single-object" },
    body: '{"x":1,"y":2}',
  });
  assertEquals(plan.crProc.name, "single_obj");
  assertEquals(plan.crCallPlan.funCParams, { kind: "OnePosParam", param: prm("payload", "json") });
  assertEquals(plan.crCallPlan.funCArgs, '{"x":1,"y":2}');
});

Deno.test("findProc: params=single-object rejects non-json single params", () => {
  const err = planErr("add", "", { headers: { Prefer: "params=single-object" }, body: '{"a":1}' });
  assertEquals(err.body.code, "PGRST202");
  // Error.hs: single-object searches have a fixed detail and a null hint
  assertEquals(err.body.message, "Could not find the function test.add in the schema cache");
  assertEquals(
    err.body.details,
    "Searched for the function test.add with a single json/jsonb parameter, but no matches were found in the schema cache.",
  );
  assertEquals(err.body.hint, null);
});

// --------------------------------------------------------------------------
// Ambiguity — PGRST203
// --------------------------------------------------------------------------

Deno.test("findProc: ambiguous overloads produce PGRST203 with the candidate list", () => {
  const err = planErr("ambig", "", { body: '{"a":1}' });
  assertEquals(err.status, 300);
  assertEquals(err.body.code, "PGRST203");
  assertEquals(
    err.body.message,
    "Could not choose the best candidate function between: test.ambig(a => integer), test.ambig(a => text)",
  );
  assertEquals(err.body.details, null);
  assertEquals(
    err.body.hint,
    "Try renaming the parameters or the function itself in the database so function overloading can be resolved",
  );
});

// --------------------------------------------------------------------------
// No match — PGRST202 exact message/details/hint
// --------------------------------------------------------------------------

Deno.test("PGRST202: unknown function name gets a fuzzy name suggestion", () => {
  const err = planErr("getitemz", "", { method: "GET" });
  assertEquals(err.status, 404);
  assertEquals(err.body.code, "PGRST202");
  assertEquals(err.body.message, "Could not find the function test.getitemz without parameters in the schema cache");
  assertEquals(
    err.body.details,
    "Searched for the function test.getitemz without parameters, but no matches were found in the schema cache.",
  );
  assertEquals(err.body.hint, "Perhaps you meant to call the function test.getitems");
});

Deno.test("PGRST202: wrong params on a known function suggest the overload's params", () => {
  const err = planErr("add", "?a=1", { method: "GET" });
  assertEquals(err.body.message, "Could not find the function test.add(a) in the schema cache");
  assertEquals(
    err.body.details,
    "Searched for the function test.add with parameter a, but no matches were found in the schema cache.",
  );
  assertEquals(err.body.hint, "Perhaps you meant to call the function test.add(a, b)");
});

Deno.test("PGRST202: POST json mentions the single unnamed json fallback in details", () => {
  const err = planErr("add", "", { body: '{"a":1,"x":2}' });
  // argument keys are sorted (S.toList)
  assertEquals(err.body.message, "Could not find the function test.add(a, x) in the schema cache");
  assertEquals(
    err.body.details,
    "Searched for the function test.add with parameters a, x or with a single unnamed json/jsonb parameter, but no matches were found in the schema cache.",
  );
});

Deno.test("PGRST202: single-param content types have fixed details and hint=null", () => {
  const err = planErr("add", "", { headers: { "Content-Type": "text/plain" }, body: "x" });
  assertEquals(err.body.message, "Could not find the function test.add in the schema cache");
  assertEquals(
    err.body.details,
    "Searched for the function test.add with a single unnamed text parameter, but no matches were found in the schema cache.",
  );
  assertEquals(err.body.hint, null);

  const xml = planErr("add", "", { headers: { "Content-Type": "text/xml" }, body: "<a/>" });
  assertEquals(
    xml.body.details,
    "Searched for the function test.add with a single unnamed xml parameter, but no matches were found in the schema cache.",
  );

  const bytea = planErr("add", "", { headers: { "Content-Type": "application/octet-stream" }, body: "b" });
  assertEquals(
    bytea.body.details,
    "Searched for the function test.add with a single unnamed bytea parameter, but no matches were found in the schema cache.",
  );
  assertEquals(bytea.body.hint, null);
});

// --------------------------------------------------------------------------
// jsonRpcParams — variadic handling
// --------------------------------------------------------------------------

Deno.test("jsonRpcParams: non-variadic procs map params to json strings (last dup wins)", () => {
  const proc = routineList[0]; // add(a, b)
  assertEquals(jsonRpcParams(proc, [["a", "1"], ["b", "2"]]), '{"a":"1","b":"2"}');
  assertEquals(jsonRpcParams(proc, [["a", "1"], ["a", "9"]]), '{"a":"9"}');
});

Deno.test("jsonRpcParams: repeated variadic keys collect into an array in order", () => {
  const vconcat = routineList.find((r) => r.name === "vconcat")!;
  assertEquals(jsonRpcParams(vconcat, [["v", "a"]]), '{"v":["a"]}');
  assertEquals(jsonRpcParams(vconcat, [["v", "a"], ["v", "b"], ["v", "c"]]), '{"v":["a","b","c"]}');
});

Deno.test("callReadPlan: variadic GET args become a json array argument", () => {
  const plan = planFor("vconcat", "?v=x&v=y", { method: "GET" });
  assertEquals(plan.crCallPlan.funCArgs, '{"v":["x","y"]}');
  const params = plan.crCallPlan.funCParams;
  assertEquals(params.kind, "KeyParams");
  if (params.kind === "KeyParams") assertEquals(params.params[0].variadic, true);
});

// --------------------------------------------------------------------------
// Volatility → tx mode, urlencoded args, returnings
// --------------------------------------------------------------------------

Deno.test("tx mode: GET/HEAD always read; POST read only for stable/immutable", () => {
  assertEquals(planFor("add", "?a=1&b=2", { method: "GET" }).crTxMode, "Read");
  assertEquals(planFor("voidfn", "", { method: "HEAD" }).crTxMode, "Read"); // InvRead beats volatile
  assertEquals(planFor("add", "", { body: '{"a":1,"b":2}' }).crTxMode, "Read"); // immutable
  assertEquals(planFor("noargs", "", {}).crTxMode, "Read"); // stable
  assertEquals(planFor("voidfn", "", {}).crTxMode, "Write"); // volatile
});

Deno.test("callReadPlan: urlencoded POST bodies convert via jsonRpcParams", () => {
  const plan = planFor("add", "", {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "a=1&b=2",
  });
  assertEquals(plan.crCallPlan.funCArgs, '{"a":"1","b":"2"}');
});

Deno.test("callReadPlan: table-returning functions read-plan against the return table", () => {
  const plan = planFor("getitems", "?select=id,name", { method: "GET" });
  // addRels root: FROM pgrst_source AS items
  assertEquals(plan.crReadPlan.rootLabel.from, { schema: "", name: "pgrst_source" });
  assertEquals(plan.crReadPlan.rootLabel.fromAlias, "items");
  // inferColsEmbedNeeds over the select (sorted set)
  assertEquals(plan.crCallPlan.funCReturning, ["id", "name"]);
  assertEquals(plan.crCallPlan.funCScalar, false);
});

Deno.test("callReadPlan: embeds add the FK columns to the returnings", () => {
  const plan = planFor("getitems", "?select=name,clients(name)", { method: "GET" });
  assertEquals(plan.crCallPlan.funCReturning, ["client_id", "name"]);
});

Deno.test("callReadPlan: HEAD negotiates the NoAgg handler", () => {
  const plan = planFor("getitems", "", { method: "HEAD" });
  assertEquals(plan.crHandler, { kind: "NoAgg" });
  assertEquals(plan.crInvMthd, { kind: "InvRead", headersOnly: true });
});

Deno.test("callReadPlan: scalar/setof-scalar flags land on the CallPlan", () => {
  const scalar = planFor("add", "", { body: '{"a":1,"b":2}' });
  assertEquals(scalar.crCallPlan.funCScalar, true);
  assertEquals(scalar.crCallPlan.funCSetOfScalar, false);
  const setof = planFor("getnames", "", { method: "GET" });
  assertEquals(setof.crCallPlan.funCScalar, false);
  assertEquals(setof.crCallPlan.funCSetOfScalar, true);
});
