// Tests for functions/parse/api-request.ts — path/action/target dispatch,
// profile (schema) negotiation, range assembly and media-type resolution.

import { assert, assertEquals } from "std/assert/mod.ts";
import { PgrstError } from "../functions/errors.ts";
import {
  type ApiRequestConf,
  getRanges,
  getSchema,
  parseCookies,
  pathInfo,
  userApiRequest,
} from "../functions/parse/api-request.ts";
import { allRange, limitZeroRange } from "../functions/parse/range.ts";
import { parseQueryParams } from "../functions/parse/query-params.ts";

const conf: ApiRequestConf = {
  dbSchemas: ["public"],
  openApiMode: "follow-privileges",
  dbTxEnd: "commit",
};

const tz = new Set<string>();

function mkReq(method: string, pathAndQuery: string, headers: Record<string, string> = {}) {
  const url = `http://localhost${pathAndQuery}`;
  const path = new URL(url).pathname;
  return { req: { method, url, headers: new Headers(headers) }, path };
}

function api(method: string, pathAndQuery: string, headers: Record<string, string> = {}, c: ApiRequestConf = conf, body = "") {
  const { req, path } = mkReq(method, pathAndQuery, headers);
  return userApiRequest(c, req, path, tz, body);
}

function apiThrows(method: string, pathAndQuery: string, headers: Record<string, string> = {}, c: ApiRequestConf = conf): PgrstError {
  try {
    api(method, pathAndQuery, headers, c);
  } catch (e) {
    if (e instanceof PgrstError) return e;
    throw e;
  }
  throw new Error("expected PgrstError");
}

// --- action/target dispatch --------------------------------------------------

Deno.test("GET /table is a relation read", () => {
  const r = api("GET", "/projects");
  assertEquals(r.iAction, {
    kind: "ActDb",
    db: { kind: "ActRelationRead", qi: { schema: "public", name: "projects" }, headersOnly: false },
  });
  assertEquals(r.iPath, "/projects");
  assertEquals(r.iMethod, "GET");
  assertEquals(r.iSchema, "public");
  assertEquals(r.iNegotiatedByProfile, false);
});

Deno.test("HEAD /table is a headers-only read (HEAD ≡ GET semantics)", () => {
  const r = api("HEAD", "/projects");
  assert(r.iAction.kind === "ActDb" && r.iAction.db.kind === "ActRelationRead");
  assertEquals(r.iAction.db.headersOnly, true);
});

Deno.test("mutation methods map to the right Mutation", () => {
  const m = (method: string) => {
    const r = api(method, "/projects", {}, conf, "{}");
    assert(r.iAction.kind === "ActDb" && r.iAction.db.kind === "ActRelationMut");
    return r.iAction.db.mutation;
  };
  assertEquals(m("POST"), "MutationCreate");
  assertEquals(m("PUT"), "MutationSingleUpsert");
  assertEquals(m("PATCH"), "MutationUpdate");
  assertEquals(m("DELETE"), "MutationDelete");
});

Deno.test("OPTIONS /table is relation info", () => {
  assertEquals(api("OPTIONS", "/projects").iAction, { kind: "ActRelationInfo", qi: { schema: "public", name: "projects" } });
});

Deno.test("unsupported method on a relation → PGRST117", () => {
  const e = apiThrows("TRACE", "/projects");
  assertEquals(e.status, 405);
  assertEquals(e.body.code, "PGRST117");
  assertEquals(e.body.message, "Unsupported HTTP method: TRACE");
});

Deno.test("rpc dispatch: GET/HEAD/POST/OPTIONS", () => {
  const get = api("GET", "/rpc/fn");
  assertEquals(get.iAction, {
    kind: "ActDb",
    db: { kind: "ActRoutine", qi: { schema: "public", name: "fn" }, invMethod: { kind: "InvRead", headersOnly: false } },
  });
  const head = api("HEAD", "/rpc/fn");
  assert(head.iAction.kind === "ActDb" && head.iAction.db.kind === "ActRoutine");
  assertEquals(head.iAction.db.invMethod, { kind: "InvRead", headersOnly: true });
  const post = api("POST", "/rpc/fn");
  assert(post.iAction.kind === "ActDb" && post.iAction.db.kind === "ActRoutine");
  assertEquals(post.iAction.db.invMethod, { kind: "Inv" });
  assertEquals(api("OPTIONS", "/rpc/fn").iAction, {
    kind: "ActRoutineInfo",
    qi: { schema: "public", name: "fn" },
    invMethod: { kind: "InvRead", headersOnly: true },
  });
});

Deno.test("invalid method on RPC → PGRST101", () => {
  const e = apiThrows("PATCH", "/rpc/fn");
  assertEquals(e.status, 405);
  assertEquals(e.body.code, "PGRST101");
  assertEquals(e.body.message, "Cannot use the PATCH method on RPC");
});

Deno.test("GET / is a schema (OpenAPI) read; disabled mode 404s", () => {
  assertEquals(api("GET", "/").iAction, { kind: "ActDb", db: { kind: "ActSchemaRead", schema: "public", headersOnly: false } });
  assertEquals(api("OPTIONS", "/").iAction, { kind: "ActSchemaInfo" });
  const e = apiThrows("GET", "/", {}, { ...conf, openApiMode: "disabled" });
  assertEquals(e.status, 404);
});

Deno.test("db-root-spec routes / to a routine", () => {
  const r = api("GET", "/", {}, { ...conf, dbRootSpec: { schema: "", name: "root_fn" } });
  assert(r.iAction.kind === "ActDb" && r.iAction.db.kind === "ActRoutine");
  assertEquals(r.iAction.db.qi.name, "root_fn");
});

Deno.test("deep paths 404", () => {
  assertEquals(apiThrows("GET", "/a/b/c").status, 404);
  assertEquals(apiThrows("GET", "/projects/").status, 404); // trailing slash → ["projects", ""]
});

// --- RPC GET params ------------------------------------------------------------

Deno.test("RPC GET args land in qsParams (invoke-safe parsing)", () => {
  const r = api("GET", "/rpc/fn?a=1&b=two&id=eq.3");
  assertEquals(r.iQueryParams.qsParams, [["a", "1"], ["b", "two"]]);
  assertEquals(r.iQueryParams.qsFilters.length, 1);
});

Deno.test("relation reads do not treat operator-less values as params", () => {
  const e = apiThrows("GET", "/projects?a=1");
  assertEquals(e.body.code, "PGRST100");
});

// --- schema (profile) negotiation ------------------------------------------------

const multi: ApiRequestConf = { ...conf, dbSchemas: ["public", "storage"] };

Deno.test("single schema without profile header is not negotiated", () => {
  assertEquals(getSchema({ dbSchemas: ["public"] }, new Headers(), "GET"), ["public", false]);
});

Deno.test("multiple schemas without profile header default with negotiation flag", () => {
  assertEquals(getSchema({ dbSchemas: ["public", "storage"] }, new Headers(), "GET"), ["public", true]);
});

Deno.test("Accept-Profile picks the schema for reads", () => {
  const r = api("GET", "/files", { "Accept-Profile": "storage" }, multi);
  assertEquals(r.iSchema, "storage");
  assertEquals(r.iNegotiatedByProfile, true);
});

Deno.test("Content-Profile picks the schema for mutations", () => {
  const r = api("POST", "/files", { "Content-Profile": "storage" }, multi, "{}");
  assertEquals(r.iSchema, "storage");
  // Accept-Profile is ignored for POST
  const r2 = api("POST", "/files", { "Accept-Profile": "storage" }, multi, "{}");
  assertEquals(r2.iSchema, "public");
});

Deno.test("unknown profile → PGRST106 unacceptable schema", () => {
  const e = apiThrows("GET", "/files", { "Accept-Profile": "nope" }, multi);
  assertEquals(e.status, 406);
  assertEquals(e.body.code, "PGRST106");
  assertEquals(e.body.message, "The schema must be one of the following: public, storage");
});

// --- ranges ------------------------------------------------------------------------

Deno.test("Range header applies to GET only", () => {
  assertEquals(api("GET", "/projects", { Range: "0-9" }).iTopLevelRange, { lower: 0, upper: 9 });
  assertEquals(api("DELETE", "/projects", { Range: "0-9" }).iTopLevelRange, allRange);
});

Deno.test("limit/offset params make the top-level range", () => {
  const r = api("GET", "/projects?limit=10&offset=5");
  assertEquals(r.iTopLevelRange, { lower: 5, upper: 14 });
  assertEquals(r.iRange.get("limit"), { lower: 5, upper: 14 });
});

Deno.test("Range header intersects with limit param", () => {
  const r = api("GET", "/projects?limit=10", { Range: "5-20" });
  assertEquals(r.iTopLevelRange, { lower: 5, upper: 9 });
});

Deno.test("limit=0 becomes the limit-zero range without erroring", () => {
  assertEquals(api("GET", "/projects?limit=0").iTopLevelRange, limitZeroRange);
});

Deno.test("negative limit → PGRST103 NegativeLimit", () => {
  const e = apiThrows("GET", "/projects?limit=-1");
  assertEquals(e.status, 416);
  assertEquals(e.body.code, "PGRST103");
  assertEquals(e.body.details, "Limit should be greater than or equal to zero.");
});

Deno.test("Range header with lower > upper → PGRST103 LowerGTUpper", () => {
  const e = apiThrows("GET", "/projects", { Range: "5-2" });
  assertEquals(e.status, 416);
  assertEquals(e.body.details, "The lower boundary must be lower than or equal to the upper boundary in the Range header.");
});

Deno.test("PATCH/DELETE with limit but no order → PGRST109", () => {
  assertEquals(apiThrows("PATCH", "/projects?limit=5").body.code, "PGRST109");
  assertEquals(apiThrows("DELETE", "/projects?limit=5").body.code, "PGRST109");
  // with an order it's allowed
  assertEquals(api("PATCH", "/projects?limit=5&order=id", {}, conf, "{}").iTopLevelRange, { lower: 0, upper: 4 });
});

Deno.test("PUT with limit/offset → PGRST114", () => {
  const e = apiThrows("PUT", "/projects?limit=1");
  assertEquals(e.status, 400);
  assertEquals(e.body.code, "PGRST114");
  assertEquals(e.body.message, "limit/offset querystring parameters are not allowed for PUT");
});

Deno.test("getRanges keeps per-embed ranges", () => {
  const qs = parseQueryParams("clients.limit=2&limit=7", false);
  const [top, ranges] = getRanges("GET", qs, new Headers());
  assertEquals(top, { lower: 0, upper: 6 });
  assertEquals(ranges.get("clients.limit"), { lower: 0, upper: 1 });
});

// --- headers, cookies, media types ---------------------------------------------------

Deno.test("iAcceptMediaType is ordered by q-weights; defaults to */*", () => {
  const r = api("GET", "/projects", { Accept: "text/csv;q=0.5, application/json" });
  assertEquals(r.iAcceptMediaType, [{ kind: "MTApplicationJSON" }, { kind: "MTTextCSV" }]);
  assertEquals(api("GET", "/projects").iAcceptMediaType, [{ kind: "MTAny" }]);
});

Deno.test("iContentMediaType defaults to application/json", () => {
  assertEquals(api("POST", "/projects", {}, conf, "{}").iContentMediaType, { kind: "MTApplicationJSON" });
  assertEquals(
    api("POST", "/projects", { "Content-Type": "text/csv" }, conf, "a\n1").iContentMediaType,
    { kind: "MTTextCSV" },
  );
});

Deno.test("iHeaders folds case and excludes cookies; iCookies parses them", () => {
  const r = api("GET", "/projects", { "X-Custom": "1", Cookie: "a=1; b=2" });
  assert(r.iHeaders.some(([k, v]) => k === "x-custom" && v === "1"));
  assert(!r.iHeaders.some(([k]) => k === "cookie"));
  assertEquals(r.iCookies, [["a", "1"], ["b", "2"]]);
});

Deno.test("preferences are parsed from the request headers", () => {
  const r = api("GET", "/projects", { Prefer: "count=exact" });
  assertEquals(r.iPreferences.preferCount, "ExactCount");
  // tx override honors db-tx-end
  const r2 = api("GET", "/projects", { Prefer: "tx=rollback" }, { ...conf, dbTxEnd: "commit-allow-override" });
  assertEquals(r2.iPreferences.preferTransaction, "Rollback");
  const r3 = api("GET", "/projects", { Prefer: "tx=rollback" });
  assertEquals(r3.iPreferences.preferTransaction, null);
});

Deno.test("iColumns comes from ?columns= for mutations and POST rpc", () => {
  assertEquals([...api("POST", "/projects?columns=a,b").iColumns], ["a", "b"]);
  assertEquals([...api("PATCH", "/projects?columns=a").iColumns], ["a"]);
  assertEquals([...api("POST", "/rpc/fn?columns=x").iColumns], ["x"]);
  // reads ignore columns
  assertEquals([...api("GET", "/projects?columns=a").iColumns], []);
  // ?columns= passes the body through unparsed
  assertEquals(api("POST", "/projects?columns=a", {}, conf, "not json").iPayload, { kind: "RawJSON", payRaw: "not json" });
  // without columns the payload keys become iColumns
  const r = api("POST", "/projects", {}, conf, '{"b":1,"a":2}');
  assertEquals([...r.iColumns], ["b", "a"]);
  assertEquals(r.iPayload?.kind, "ProcessedJSON");
});

// --- unit helpers -----------------------------------------------------------------------

Deno.test("pathInfo splits and percent-decodes segments", () => {
  assertEquals(pathInfo("/"), []);
  assertEquals(pathInfo(""), []);
  assertEquals(pathInfo("/projects"), ["projects"]);
  assertEquals(pathInfo("/rpc/fn"), ["rpc", "fn"]);
  assertEquals(pathInfo("/Escap3e%3B"), ["Escap3e;"]);
  assertEquals(pathInfo("/a/"), ["a", ""]);
});

Deno.test("parseCookies", () => {
  assertEquals(parseCookies("a=1; b=2"), [["a", "1"], ["b", "2"]]);
  assertEquals(parseCookies("session=x=y"), [["session", "x=y"]]);
  assertEquals(parseCookies("flag"), [["flag", ""]]);
});
