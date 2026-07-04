// Snapshot-style tests for the read and mutation SQL generation: query
// string (+ body) → plan → SQL text + ordered params. SQL strings are
// asserted whitespace-normalized so diffs stay reviewable.

import { assertEquals, assertStringIncludes, assertThrows } from "std/assert/mod.ts";
import { resolveConfig } from "../functions/config.ts";
import { PgrstError } from "../functions/errors.ts";
import { userApiRequest } from "../functions/parse/api-request.ts";
import { type CallReadPlan, callReadPlan } from "../functions/plan/call-plan.ts";
import { type MutateReadPlan, mutateReadPlan } from "../functions/plan/mutate-plan.ts";
import { type WrappedReadPlan, wrappedReadPlan } from "../functions/plan/read-plan.ts";
import { renderSnippet } from "../functions/sql/builder.ts";
import { callPlanToQuery, limitedQuery, mutatePlanToQuery, readPlanToCountQuery, readPlanToQuery } from "../functions/sql/query-builder.ts";
import { singleParameter } from "../functions/sql/fragment.ts";
import {
  decodeCustomBody,
  prepareCall,
  preparePlanRows,
  prepareRead,
  prepareWrite,
  xmlOutInternal,
} from "../functions/sql/statements.ts";
import {
  type Column,
  type Relationship,
  relsMapKey,
  repKey,
  type Routine,
  type RoutineParam,
  type SchemaCache,
  type Table,
} from "../functions/schema-cache/types.ts";

// --------------------------------------------------------------------------
// Fixture schema cache
// --------------------------------------------------------------------------

function col(name: string, nominalType: string): Column {
  return { name, description: null, nullable: true, dataType: nominalType, nominalType, maxLen: null, default: null, enumVals: [] };
}

function table(name: string, columns: Column[]): Table {
  return { schema: "test", name, description: null, kind: "table", insertable: true, updatable: true, deletable: true, pkCols: ["id"], columns };
}

const qi = (name: string) => ({ schema: "test", name });

const projectsClientsM2O: Relationship = {
  kind: "fk",
  table: qi("projects"),
  foreignTable: qi("clients"),
  isSelf: false,
  cardinality: { tag: "M2O", constraint: "projects_client_id_fkey", columns: [["client_id", "id"]] },
  tableIsView: false,
  foreignTableIsView: false,
};
const clientsProjectsO2M: Relationship = {
  kind: "fk",
  table: qi("clients"),
  foreignTable: qi("projects"),
  isSelf: false,
  cardinality: { tag: "O2M", constraint: "projects_client_id_fkey", columns: [["id", "client_id"]] },
  tableIsView: false,
  foreignTableIsView: false,
};
const projectsTasksO2M: Relationship = {
  kind: "fk",
  table: qi("projects"),
  foreignTable: qi("tasks"),
  isSelf: false,
  cardinality: { tag: "O2M", constraint: "tasks_project_id_fkey", columns: [["id", "project_id"]] },
  tableIsView: false,
  foreignTableIsView: false,
};
const tasksProjectsM2O: Relationship = {
  kind: "fk",
  table: qi("tasks"),
  foreignTable: qi("projects"),
  isSelf: false,
  cardinality: { tag: "M2O", constraint: "tasks_project_id_fkey", columns: [["project_id", "id"]] },
  tableIsView: false,
  foreignTableIsView: false,
};
const usersProjectsM2M: Relationship = {
  kind: "fk",
  table: qi("users"),
  foreignTable: qi("projects"),
  isSelf: false,
  cardinality: {
    tag: "M2M",
    junction: {
      table: qi("users_projects"),
      constraint1: "users_projects_user_id_fkey",
      constraint2: "users_projects_project_id_fkey",
      colsSource: [["id", "user_id"]],
      colsTarget: [["id", "project_id"]],
    },
  },
  tableIsView: false,
  foreignTableIsView: false,
};

const cache: SchemaCache = {
  tables: new Map([
    [
      "test.projects",
      table("projects", [
        col("id", "integer"),
        col("name", "text"),
        col("data", "jsonb"),
        col("arr", "integer[]"),
        col("tsv", "tsvector"),
        col("sp ace", "text"),
      ]),
    ],
    ["test.colors", table("colors", [col("id", "integer"), col("color", "color_type")])],
    ["test.stock", table("stock", [col("id", "integer"), { ...col("qty", "integer"), default: "5" }, col("name", "text")])],
    ["test.clients", table("clients", [col("id", "integer"), col("name", "text")])],
    ["test.tasks", table("tasks", [col("id", "integer"), col("name", "text"), col("project_id", "integer"), col("hours", "integer")])],
    ["test.users", table("users", [col("id", "integer"), col("name", "text")])],
  ]),
  relationships: new Map([
    [relsMapKey(qi("projects"), "test"), [projectsClientsM2O, projectsTasksO2M]],
    [relsMapKey(qi("clients"), "test"), [clientsProjectsO2M]],
    [relsMapKey(qi("tasks"), "test"), [tasksProjectsM2O]],
    [relsMapKey(qi("users"), "test"), [usersProjectsM2M]],
  ]),
  routines: new Map(),
  representations: new Map([
    [repKey("color_type", "json"), { sourceType: "color_type", targetType: "json", function: "test.color_to_json" }],
    [repKey("text", "color_type"), { sourceType: "text", targetType: "color_type", function: "test.color_from_text" }],
  ]),
  mediaHandlers: [],
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

/** Collapses runs of spaces/tabs (not newlines — CSV SQL contains literal \n). */
function normalize(s: string): string {
  return s.replace(/[ \t]+/g, " ").trim();
}

function mainSql(query: string, opts: PlanOpts = {}): [string, (string | null)[]] {
  const { text, values } = renderSnippet(readPlanToQuery(planFor(query, opts).wrReadPlan));
  return [normalize(text), values];
}

function countSql(query: string, opts: PlanOpts = {}): [string, (string | null)[]] {
  const { text, values } = renderSnippet(readPlanToCountQuery(planFor(query, opts).wrReadPlan));
  return [normalize(text), values];
}

/** The WHERE..LIMIT tail of the main query (after the FROM clause). */
function tailSql(query: string, opts: PlanOpts = {}): [string, (string | null)[]] {
  const [text, values] = mainSql(query, opts);
  const from = `FROM "test"."${opts.table ?? "projects"}"`;
  const idx = text.indexOf(from);
  return [text.slice(idx + from.length).trim(), values];
}

function errCode(fn: () => unknown): string {
  const err = assertThrows(fn) as PgrstError;
  if (!(err instanceof PgrstError)) throw new Error(`expected PgrstError, got ${err}`);
  return err.body.code ?? "";
}

const P = '"test"."projects"';

// --------------------------------------------------------------------------
// Vertical filtering
// --------------------------------------------------------------------------

Deno.test("select: default star", () => {
  assertEquals(mainSql(""), [`SELECT ${P}.* FROM ${P}`, []]);
});

Deno.test("select: columns, aliases, casts, json paths, unknown columns", () => {
  assertEquals(mainSql("?select=id,alias:name,id::text,data->a->>b,name->>k,unknown"), [
    `SELECT ${P}."id", ${P}."name" AS "alias", CAST( ${P}."id" AS text ), ${P}."data"->$1->>$2 AS "b", to_jsonb(${P}."name")->>$3 AS "k", ${P}."unknown" FROM ${P}`,
    ["a", "b", "k"],
  ]);
});

Deno.test("select: json path with indexes aliases to the last key (or the field name)", () => {
  assertEquals(mainSql("?select=data->1->>-2"), [
    `SELECT ${P}."data"->$1::int->>$2::int AS "data" FROM ${P}`,
    ["+1", "-2"],
  ]);
  assertEquals(mainSql("?select=data->k->2"), [
    `SELECT ${P}."data"->$1->$2::int AS "k" FROM ${P}`,
    ["k", "+2"],
  ]);
});

Deno.test("select: quoted identifiers with special characters", () => {
  // select="he\"llo" — the escaped quote doubles in the SQL ident
  assertEquals(mainSql("?select=%22he%5C%22llo%22"), [`SELECT ${P}."he""llo" FROM ${P}`, []]);
  assertEquals(tailSql("?sp%20ace=eq.x"), [`WHERE ${P}."sp ace" = $1`, ["x"]]);
});

// --------------------------------------------------------------------------
// Horizontal filtering — every operator
// --------------------------------------------------------------------------

Deno.test("filters: quantifiable operators", () => {
  assertEquals(tailSql("?id=eq.1"), [`WHERE ${P}."id" = $1`, ["1"]]);
  assertEquals(tailSql("?id=gt.1"), [`WHERE ${P}."id" > $1`, ["1"]]);
  assertEquals(tailSql("?id=gte.1"), [`WHERE ${P}."id" >= $1`, ["1"]]);
  assertEquals(tailSql("?id=lt.1"), [`WHERE ${P}."id" < $1`, ["1"]]);
  assertEquals(tailSql("?id=lte.1"), [`WHERE ${P}."id" <= $1`, ["1"]]);
  assertEquals(tailSql("?name=like.*foo*"), [`WHERE ${P}."name" like $1`, ["%foo%"]]);
  assertEquals(tailSql("?name=ilike.f*"), [`WHERE ${P}."name" ilike $1`, ["f%"]]);
  assertEquals(tailSql("?name=match.^f"), [`WHERE ${P}."name" ~ $1`, ["^f"]]);
  assertEquals(tailSql("?name=imatch.^f"), [`WHERE ${P}."name" ~* $1`, ["^f"]]);
});

Deno.test("filters: simple operators (fmtOp table)", () => {
  assertEquals(tailSql("?id=neq.1"), [`WHERE ${P}."id" <> $1`, ["1"]]);
  assertEquals(tailSql("?arr=cs.{1,2}"), [`WHERE ${P}."arr" @> $1`, ["{1,2}"]]);
  assertEquals(tailSql("?arr=cd.{1,2}"), [`WHERE ${P}."arr" <@ $1`, ["{1,2}"]]);
  assertEquals(tailSql("?arr=ov.{1,2}"), [`WHERE ${P}."arr" && $1`, ["{1,2}"]]);
  assertEquals(tailSql("?arr=sl.(1,2)"), [`WHERE ${P}."arr" << $1`, ["(1,2)"]]);
  assertEquals(tailSql("?arr=sr.(1,2)"), [`WHERE ${P}."arr" >> $1`, ["(1,2)"]]);
  assertEquals(tailSql("?arr=nxr.(1,2)"), [`WHERE ${P}."arr" &< $1`, ["(1,2)"]]);
  assertEquals(tailSql("?arr=nxl.(1,2)"), [`WHERE ${P}."arr" &> $1`, ["(1,2)"]]);
  assertEquals(tailSql("?arr=adj.(1,2)"), [`WHERE ${P}."arr" -|- $1`, ["(1,2)"]]);
});

Deno.test("filters: quantified any/all", () => {
  assertEquals(tailSql("?id=eq(any).{1,2}"), [`WHERE ${P}."id" = ANY($1)`, ["{1,2}"]]);
  assertEquals(tailSql("?id=gt(all).{1,2}"), [`WHERE ${P}."id" > ALL($1)`, ["{1,2}"]]);
  // like/ilike translate * to % inside the whole array literal
  assertEquals(tailSql("?name=like(any).{O*,P*}"), [`WHERE ${P}."name" like ANY($1)`, ["{O%,P%}"]]);
});

Deno.test("filters: in lists (parameterized array literal, empty list special case)", () => {
  assertEquals(tailSql("?id=in.(1,2,3)"), [`WHERE ${P}."id" = ANY ($1)`, ['{"1","2","3"}']]);
  assertEquals(tailSql('?name=in.("a,b",c)'), [`WHERE ${P}."name" = ANY ($1)`, ['{"a,b","c"}']]);
  assertEquals(tailSql("?id=in.()"), [`WHERE ${P}."id" = ANY('{}')`, []]);
});

Deno.test("filters: is with trilean values", () => {
  assertEquals(tailSql("?name=is.null"), [`WHERE ${P}."name" IS NULL`, []]);
  assertEquals(tailSql("?name=is.true"), [`WHERE ${P}."name" IS TRUE`, []]);
  assertEquals(tailSql("?name=is.false"), [`WHERE ${P}."name" IS FALSE`, []]);
  assertEquals(tailSql("?name=is.unknown"), [`WHERE ${P}."name" IS UNKNOWN`, []]);
});

Deno.test("filters: isdistinct", () => {
  assertEquals(tailSql("?name=isdistinct.x"), [`WHERE ${P}."name" IS DISTINCT FROM $1`, ["x"]]);
});

Deno.test("filters: full text search", () => {
  assertEquals(tailSql("?tsv=fts(english).cat"), [`WHERE ${P}."tsv" @@ to_tsquery($1, $2)`, ["english", "cat"]]);
  assertEquals(tailSql("?tsv=plfts.cat"), [`WHERE ${P}."tsv" @@ plainto_tsquery($1)`, ["cat"]]);
  assertEquals(tailSql("?tsv=phfts(german).cat"), [`WHERE ${P}."tsv" @@ phraseto_tsquery($1, $2)`, ["german", "cat"]]);
  assertEquals(tailSql("?tsv=wfts.cat"), [`WHERE ${P}."tsv" @@ websearch_to_tsquery($1)`, ["cat"]]);
});

Deno.test("filters: not negation", () => {
  assertEquals(tailSql("?id=not.eq.1"), [`WHERE NOT ${P}."id" = $1`, ["1"]]);
  assertEquals(tailSql("?name=not.is.null"), [`WHERE NOT ${P}."name" IS NULL`, []]);
});

Deno.test("filters: json path fields", () => {
  assertEquals(tailSql("?data->a->>b=eq.1"), [`WHERE ${P}."data"->$1->>$2 = $3`, ["a", "b", "1"]]);
  // non-json columns get the to_jsonb wrap
  assertEquals(tailSql("?name->>k=eq.1"), [`WHERE to_jsonb(${P}."name")->>$1 = $2`, ["k", "1"]]);
});

Deno.test("filters: multiple filters keep query-string order, AND-ed", () => {
  assertEquals(tailSql("?id=gt.1&name=eq.a"), [`WHERE ${P}."id" > $1 AND ${P}."name" = $2`, ["1", "a"]]);
});

Deno.test("filters: logic trees", () => {
  assertEquals(tailSql("?and=(id.eq.1,or(name.eq.a,name.eq.b))"), [
    `WHERE ( ${P}."id" = $1 AND ( ${P}."name" = $2 OR ${P}."name" = $3))`,
    ["1", "a", "b"],
  ]);
  assertEquals(tailSql("?not.and=(id.eq.1,name.eq.a)"), [
    `WHERE NOT ( ${P}."id" = $1 AND ${P}."name" = $2)`,
    ["1", "a"],
  ]);
  assertEquals(tailSql("?or=(id.eq.1,and(not.or(id.eq.2,id.eq.3),id.gte.4))"), [
    `WHERE ( ${P}."id" = $1 OR (NOT ( ${P}."id" = $2 OR ${P}."id" = $3) AND ${P}."id" >= $4))`,
    ["1", "2", "3", "4"],
  ]);
});

// --------------------------------------------------------------------------
// Order, limit/offset, Range
// --------------------------------------------------------------------------

Deno.test("order: directions, nulls, json paths", () => {
  assertEquals(tailSql("?order=id.desc.nullslast,name"), [
    `ORDER BY ${P}."id" DESC NULLS LAST, ${P}."name"`,
    [],
  ]);
  assertEquals(tailSql("?order=id.asc.nullsfirst"), [`ORDER BY ${P}."id" ASC NULLS FIRST`, []]);
  assertEquals(tailSql("?order=data->>k.desc"), [`ORDER BY ${P}."data"->>$1 DESC`, ["k"]]);
});

Deno.test("limit/offset become LIMIT/OFFSET params", () => {
  assertEquals(tailSql("?limit=10&offset=5"), ["LIMIT $1 OFFSET $2", ["10", "5"]]);
  assertEquals(tailSql("?offset=5"), ["LIMIT ALL OFFSET $1", ["5"]]);
  assertEquals(tailSql("?limit=0"), ["LIMIT $1 OFFSET $2", ["0", "0"]]);
});

Deno.test("Range header intersects with limit/offset", () => {
  assertEquals(tailSql("", { headers: { Range: "5-9" } }), ["LIMIT $1 OFFSET $2", ["5", "5"]]);
});

Deno.test("db-max-rows clamps the range", () => {
  assertEquals(tailSql("", { env: { PGRST_DB_MAX_ROWS: "2" } }), ["LIMIT $1 OFFSET $2", ["2", "0"]]);
  assertEquals(tailSql("?limit=1", { env: { PGRST_DB_MAX_ROWS: "2" } }), ["LIMIT $1 OFFSET $2", ["1", "0"]]);
});

// --------------------------------------------------------------------------
// Count query
// --------------------------------------------------------------------------

Deno.test("count query: filters only, no LIMIT/OFFSET, SELECT 1", () => {
  assertEquals(countSql("?id=gt.1&select=name&limit=5&order=id"), [
    `SELECT 1 FROM ${P} WHERE ${P}."id" > $1`,
    ["1"],
  ]);
  assertEquals(countSql(""), [`SELECT 1 FROM ${P}`, []]);
});

Deno.test("estimated count limits the count query; EXPLAIN wraps it", () => {
  const count = readPlanToCountQuery(planFor("").wrReadPlan);
  assertEquals(normalize(renderSnippet(limitedQuery(count, 3)).text), `SELECT 1 FROM ${P} LIMIT 3`);
  assertEquals(normalize(renderSnippet(preparePlanRows(count)).text), `EXPLAIN (FORMAT JSON) SELECT 1 FROM ${P}`);
});

// --------------------------------------------------------------------------
// Statement wrappers (Statements.hs prepareRead + handlerF/asCsvF)
// --------------------------------------------------------------------------

function wrapperSql(query: string, opts: PlanOpts = {}, countTotal = false): string {
  const plan = planFor(query, opts);
  const select = readPlanToQuery(plan.wrReadPlan);
  const count = readPlanToCountQuery(plan.wrReadPlan);
  return normalize(renderSnippet(prepareRead(select, count, countTotal, plan.wrHandler)).text);
}

const RESULT_COLUMNS =
  `pg_catalog.count(_postgrest_t) AS page_total, %BODY% AS body, ` +
  `nullif(current_setting('response.headers', true), '') AS response_headers, ` +
  `nullif(current_setting('response.status', true), '') AS response_status, ` +
  `'' AS response_inserted FROM ( SELECT * FROM pgrst_source ) _postgrest_t`;

Deno.test("prepareRead: json wrapper (no count)", () => {
  assertEquals(
    wrapperSql("?select=id"),
    `WITH pgrst_source AS ( SELECT ${P}."id" FROM ${P} ) SELECT null::bigint AS total_result_set, ` +
      RESULT_COLUMNS.replace("%BODY%", `(coalesce(json_agg(_postgrest_t), '[]'))::text`),
  );
});

Deno.test("prepareRead: exact count adds the count CTE", () => {
  assertEquals(
    wrapperSql("?select=id", {}, true),
    `WITH pgrst_source AS ( SELECT ${P}."id" FROM ${P} ) , pgrst_source_count AS (SELECT 1 FROM ${P}) ` +
      `SELECT (SELECT pg_catalog.count(*) FROM pgrst_source_count) AS total_result_set, ` +
      RESULT_COLUMNS.replace("%BODY%", `(coalesce(json_agg(_postgrest_t), '[]'))::text`),
  );
});

Deno.test("prepareRead: csv wrapper ports asCsvF exactly", () => {
  const csvBody = `((SELECT coalesce(string_agg(a.k, ','), '') FROM ( SELECT json_object_keys(r)::text as k ` +
    `FROM ( SELECT row_to_json(hh) as r from pgrst_source as hh limit 1 ) s ) a) || '\n' || ` +
    `coalesce(string_agg(substring(_postgrest_t::text, 2, length(_postgrest_t::text) - 2), '\n'), ''))::text`;
  assertEquals(
    wrapperSql("?select=id", { headers: { Accept: "text/csv" } }),
    `WITH pgrst_source AS ( SELECT ${P}."id" FROM ${P} ) SELECT null::bigint AS total_result_set, ` +
      RESULT_COLUMNS.replace("%BODY%", csvBody),
  );
});

Deno.test("prepareRead: singular object wrapper", () => {
  assertStringIncludes(
    wrapperSql("?select=id", { headers: { Accept: "application/vnd.pgrst.object+json" } }),
    `(coalesce(json_agg(_postgrest_t)->0, 'null'))::text AS body`,
  );
  assertStringIncludes(
    wrapperSql("?select=id", { headers: { Accept: "application/vnd.pgrst.object+json;nulls=stripped" } }),
    `(coalesce(json_strip_nulls(json_agg(_postgrest_t)->0), 'null'))::text AS body`,
  );
});

Deno.test("prepareRead: array+json nulls=stripped wrapper", () => {
  assertStringIncludes(
    wrapperSql("?select=id", { headers: { Accept: "application/vnd.pgrst.array+json;nulls=stripped" } }),
    `(coalesce(json_strip_nulls(json_agg(_postgrest_t)), '[]'))::text AS body`,
  );
});

Deno.test("prepareRead: HEAD gets the NoAgg body", () => {
  assertStringIncludes(wrapperSql("?select=id", { method: "HEAD" }), `(''::text)::text AS body`);
});

// --------------------------------------------------------------------------
// Aggregates
// --------------------------------------------------------------------------

const AGG = { env: { PGRST_DB_AGGREGATES_ENABLED: "true" } };

Deno.test("aggregates: PGRST123 when db-aggregates-enabled=false", () => {
  assertEquals(errCode(() => planFor("?select=id.sum()")), "PGRST123");
});

Deno.test("aggregates: SQL when enabled, with GROUP BY on plain fields", () => {
  assertEquals(mainSql("?select=name,id.sum()", AGG), [
    `SELECT ${P}."name", SUM(${P}."id") FROM ${P} GROUP BY ${P}."name"`,
    [],
  ]);
  assertEquals(mainSql("?select=id.sum()::text", AGG), [
    `SELECT CAST( SUM(${P}."id") AS text ) FROM ${P}`,
    [],
  ]);
  assertEquals(mainSql("?select=total:id.max()", AGG), [`SELECT MAX(${P}."id") AS "total" FROM ${P}`, []]);
  assertEquals(mainSql("?select=id.avg(),id.min()", AGG), [`SELECT AVG(${P}."id"), MIN(${P}."id") FROM ${P}`, []]);
  assertEquals(mainSql("?select=count()", AGG), [`SELECT COUNT(${P}.*) FROM ${P}`, []]);
  // field cast applies inside the aggregate, aggregate cast outside
  assertEquals(mainSql("?select=id::text.sum()::numeric", AGG), [
    `SELECT CAST( SUM(CAST( ${P}."id" AS text )) AS numeric ) FROM ${P}`,
    [],
  ]);
  // aliased group terms GROUP BY the alias
  assertEquals(mainSql("?select=n:name,id.sum()", AGG), [
    `SELECT ${P}."name" AS "n", SUM(${P}."id") FROM ${P} GROUP BY "n"`,
    [],
  ]);
});

Deno.test("aggregates: star select expands to explicit columns", () => {
  assertEquals(mainSql("?select=*,count()", AGG), [
    `SELECT ${P}."id", ${P}."name", ${P}."data", ${P}."arr", ${P}."tsv", ${P}."sp ace", COUNT(${P}.*) FROM ${P} ` +
      `GROUP BY ${P}."id", ${P}."name", ${P}."data", ${P}."arr", ${P}."tsv", ${P}."sp ace"`,
    [],
  ]);
});

// --------------------------------------------------------------------------
// Data representations
// --------------------------------------------------------------------------

const C = '"test"."colors"';

Deno.test("data representations: output transform + derived alias", () => {
  assertEquals(mainSql("?select=id,color", { table: "colors" }), [
    `SELECT ${C}."id", test.color_to_json(${C}."color") AS "color" FROM ${C}`,
    [],
  ]);
  // star select expands when a data representation is present
  assertEquals(mainSql("", { table: "colors" }), [
    `SELECT ${C}."id", test.color_to_json(${C}."color") AS "color" FROM ${C}`,
    [],
  ]);
});

Deno.test("data representations: filter values parse through the text->domain transform", () => {
  assertEquals(tailSql("?color=eq.blue", { table: "colors" }), [
    `WHERE ${C}."color" = test.color_from_text($1)`,
    ["blue"],
  ]);
  assertEquals(tailSql("?color=in.(blue,red)", { table: "colors" }), [
    `WHERE ${C}."color" = ANY ((SELECT test.color_from_text(unnest($1::text[]))))`,
    ['{"blue","red"}'],
  ]);
});

// --------------------------------------------------------------------------
// Embedding (QueryBuilder.hs getJoins/getJoinSelects + count EXISTS)
// --------------------------------------------------------------------------

const CL = '"test"."clients"';
const T = '"test"."tasks"';

Deno.test("embed: to-one becomes a row_to_json LEFT JOIN LATERAL", () => {
  assertEquals(mainSql("?select=name,clients(name)"), [
    `SELECT ${P}."name", row_to_json("projects_clients_1".*)::jsonb AS "clients" FROM ${P} ` +
      `LEFT JOIN LATERAL ( SELECT "clients_1"."name" FROM ${CL} AS "clients_1" ` +
      `WHERE "clients_1"."id" = ${P}."client_id" ) AS "projects_clients_1" ON TRUE`,
    [],
  ]);
});

Deno.test("embed: to-many becomes a json_agg subquery with COALESCE '[]'", () => {
  assertEquals(mainSql("?select=name,projects(name)", { table: "clients" }), [
    `SELECT ${CL}."name", COALESCE( "clients_projects_1"."clients_projects_1", '[]') AS "projects" FROM ${CL} ` +
      `LEFT JOIN LATERAL ( SELECT json_agg("clients_projects_1")::jsonb AS "clients_projects_1" ` +
      `FROM (SELECT "projects_1"."name" FROM ${P} AS "projects_1" ` +
      `WHERE "projects_1"."client_id" = ${CL}."id" ) AS "clients_projects_1" ) AS "clients_projects_1" ON TRUE`,
    [],
  ]);
});

Deno.test("embed: per-embed filter/order/limit/offset land inside the lateral subquery", () => {
  const [text, values] = mainSql(
    "?select=name,projects(name)&projects.name=like.a*&projects.order=id.desc&projects.limit=2&projects.offset=1",
    { table: "clients" },
  );
  assertStringIncludes(
    text,
    `FROM (SELECT "projects_1"."name" FROM ${P} AS "projects_1" ` +
      `WHERE "projects_1"."name" like $1 AND "projects_1"."client_id" = ${CL}."id" ` +
      `ORDER BY "projects_1"."id" DESC LIMIT $2 OFFSET $3 ) AS "clients_projects_1"`,
  );
  assertEquals(values, ["a%", "2", "1"]);
});

Deno.test("embed: nested embeds nest laterals with depth-indexed aliases", () => {
  assertEquals(mainSql("?select=name,projects(name,tasks(name))", { table: "clients" }), [
    `SELECT ${CL}."name", COALESCE( "clients_projects_1"."clients_projects_1", '[]') AS "projects" FROM ${CL} ` +
      `LEFT JOIN LATERAL ( SELECT json_agg("clients_projects_1")::jsonb AS "clients_projects_1" ` +
      `FROM (SELECT "projects_1"."name", COALESCE( "projects_tasks_2"."projects_tasks_2", '[]') AS "tasks" ` +
      `FROM ${P} AS "projects_1" ` +
      `LEFT JOIN LATERAL ( SELECT json_agg("projects_tasks_2")::jsonb AS "projects_tasks_2" ` +
      `FROM (SELECT "tasks_2"."name" FROM ${T} AS "tasks_2" ` +
      `WHERE "tasks_2"."project_id" = "projects_1"."id" ) AS "projects_tasks_2" ) AS "projects_tasks_2" ON TRUE ` +
      `WHERE "projects_1"."client_id" = ${CL}."id" ) AS "clients_projects_1" ) AS "clients_projects_1" ON TRUE`,
    [],
  ]);
});

Deno.test("embed: !inner uses INNER JOIN LATERAL with IS NOT NULL; count query gets EXISTS", () => {
  const [text] = mainSql("?select=name,projects!inner(name)", { table: "clients" });
  assertStringIncludes(text, "INNER JOIN LATERAL (");
  assertStringIncludes(text, `) AS "clients_projects_1" ON "clients_projects_1" IS NOT NULL`);
  assertEquals(countSql("?select=name,projects!inner(name)&name=eq.a", { table: "clients" }), [
    `SELECT 1 FROM ${CL} WHERE ${CL}."name" = $1 AND ` +
      `EXISTS (SELECT 1 FROM ${P} AS "projects_1" WHERE "projects_1"."client_id" = ${CL}."id" )`,
    ["a"],
  ]);
  // a to-one !inner keeps the plain lateral shape with an INNER join
  const [toOne] = mainSql("?select=name,clients!inner(name)");
  assertStringIncludes(toOne, `INNER JOIN LATERAL ( SELECT "clients_1"."name" FROM ${CL} AS "clients_1"`);
  assertStringIncludes(toOne, `) AS "projects_clients_1" ON TRUE`);
});

Deno.test("embed: null-embed filters use the aggregate alias; count query flips to EXISTS", () => {
  const [isNull] = mainSql("?select=name,projects(name)&projects=is.null", { table: "clients" });
  assertStringIncludes(isNull, `WHERE "clients_projects_1" IS NOT DISTINCT FROM NULL`);
  const [notNull] = mainSql("?select=name,projects(name)&projects=not.is.null", { table: "clients" });
  assertStringIncludes(notNull, `WHERE "clients_projects_1" IS DISTINCT FROM NULL`);
  assertEquals(countSql("?select=name,projects(name)&projects=is.null", { table: "clients" }), [
    `SELECT 1 FROM ${CL} WHERE NOT EXISTS (SELECT 1 FROM ${P} AS "projects_1" WHERE "projects_1"."client_id" = ${CL}."id")`,
    [],
  ]);
  assertEquals(countSql("?select=name,projects(name)&projects=not.is.null", { table: "clients" }), [
    `SELECT 1 FROM ${CL} WHERE EXISTS (SELECT 1 FROM ${P} AS "projects_1" WHERE "projects_1"."client_id" = ${CL}."id")`,
    [],
  ]);
});

Deno.test("embed: non-null filters on an embed name pass through as column filters (v12.2.3)", () => {
  // Upstream v12.2.3 never raises UnacceptableFilter (PGRST120) — it's dead
  // code there: addNullEmbedFilters only rewrites `is.null` forms and leaves
  // any other operator as a plain filter on a (non-existent) parent column,
  // which then fails at the database with 42703.
  const [text, values] = mainSql("?select=name,projects(name)&projects=eq.x", { table: "clients" });
  assertStringIncludes(text, `WHERE ${CL}."projects" = $1`);
  assertEquals(values, ["x"]);
});

Deno.test("embed: empty embed with a null filter is omitted from the select (#3093)", () => {
  const [text] = mainSql("?select=name,projects()&projects=is.null", { table: "clients" });
  assertEquals(text.includes(`AS "projects"`), false);
  assertStringIncludes(text, "LEFT JOIN LATERAL (");
});

Deno.test("embed: spread select flattens the to-one columns", () => {
  assertEquals(mainSql("?select=name,...projects(pname:name)", { table: "tasks" }), [
    `SELECT ${T}."name", "tasks_projects_1"."pname" FROM ${T} ` +
      `LEFT JOIN LATERAL ( SELECT "projects_1"."name" AS "pname" FROM ${P} AS "projects_1" ` +
      `WHERE "projects_1"."id" = ${T}."project_id" ) AS "tasks_projects_1" ON TRUE`,
    [],
  ]);
});

Deno.test("embed: spread aggregates hoist to the parent with GROUP BY (hoistSpreadAggFunctions)", () => {
  assertEquals(mainSql("?select=name,...projects(total:id.sum())", { table: "tasks", ...AGG }), [
    `SELECT ${T}."name", SUM("tasks_projects_1"."total") AS "total" FROM ${T} ` +
      `LEFT JOIN LATERAL ( SELECT "projects_1"."id" AS "total" FROM ${P} AS "projects_1" ` +
      `WHERE "projects_1"."id" = ${T}."project_id" ) AS "tasks_projects_1" ON TRUE ` +
      `GROUP BY ${T}."name"`,
    [],
  ]);
});

Deno.test("embed: M2M does the implicit junction join without aliasing", () => {
  assertEquals(mainSql("?select=name,projects(name)", { table: "users" }), [
    `SELECT "test"."users"."name", COALESCE( "users_projects_1"."users_projects_1", '[]') AS "projects" FROM "test"."users" ` +
      `LEFT JOIN LATERAL ( SELECT json_agg("users_projects_1")::jsonb AS "users_projects_1" ` +
      `FROM (SELECT ${P}."name" FROM ${P}, "test"."users_projects" ` +
      `WHERE "test"."users_projects"."project_id" = ${P}."id" AND "test"."users_projects"."user_id" = "test"."users"."id" ) ` +
      `AS "users_projects_1" ) AS "users_projects_1" ON TRUE`,
    [],
  ]);
});

Deno.test("embed: related order goes through the aggregate alias (to-one only)", () => {
  const [text] = mainSql("?select=name,clients(name)&order=clients(name).desc.nullslast,id");
  assertStringIncludes(text, `ORDER BY "projects_clients_1"."name" DESC NULLS LAST, ${P}."id"`);
  // to-many related order is refused
  assertEquals(errCode(() => planFor("?select=name,projects(id)&order=projects(id)", { table: "clients" })), "PGRST118");
  // ordering by a non-embedded relation is refused
  assertEquals(errCode(() => planFor("?order=clients(id)")), "PGRST108");
});

Deno.test("embed: spread of a to-many relationship is refused (PGRST119)", () => {
  assertEquals(errCode(() => planFor("?select=...projects(*)", { table: "clients" })), "PGRST119");
});

Deno.test("embed: aliases route embed-path'd params (updateNode by relAlias)", () => {
  const [text, values] = mainSql("?select=name,ps:projects(name)&ps.name=eq.a", { table: "clients" });
  assertStringIncludes(text, `AS "ps"`);
  assertStringIncludes(text, `WHERE "projects_1"."name" = $1`);
  assertEquals(values, ["a"]);
  assertStringIncludes(text, `"clients_ps_1"`);
});

Deno.test("embed-path'd params on non-embedded resources yield NotEmbedded (PGRST108)", () => {
  assertEquals(errCode(() => planFor("?clients.id=eq.1")), "PGRST108");
  assertEquals(errCode(() => planFor("?order=clients(id)")), "PGRST108");
  assertEquals(errCode(() => planFor("?clients.limit=3")), "PGRST108");
  assertEquals(errCode(() => planFor("?clients.order=id")), "PGRST108");
  assertEquals(errCode(() => planFor("?clients.or=(id.eq.1)")), "PGRST108");
});

// --------------------------------------------------------------------------
// Negotiation errors
// --------------------------------------------------------------------------

Deno.test("negotiation: media types resolve to handlers; unsupported is PGRST107", () => {
  assertEquals(planFor("").wrHandler.kind, "BuiltinOvAggJson");
  assertEquals(planFor("").wrMedia.kind, "MTApplicationJSON");
  assertEquals(planFor("", { headers: { Accept: "text/csv" } }).wrHandler.kind, "BuiltinOvAggCsv");
  assertEquals(planFor("", { headers: { Accept: "application/vnd.pgrst.object+json" } }).wrHandler.kind, "BuiltinAggSingleJson");
  assertEquals(planFor("", { method: "HEAD" }).wrHandler.kind, "NoAgg");
  // quality factors pick the best accepted media type
  assertEquals(planFor("", { headers: { Accept: "text/csv;q=0.5, application/json" } }).wrMedia.kind, "MTApplicationJSON");
  assertEquals(errCode(() => planFor("", { headers: { Accept: "text/xml" } })), "PGRST107");
  // vnd.pgrst.plan is refused while db-plan-enabled=false (matches upstream)
  assertEquals(errCode(() => planFor("", { headers: { Accept: "application/vnd.pgrst.plan+json" } })), "PGRST107");
  // ...and negotiates when enabled
  assertEquals(
    planFor("", { headers: { Accept: "application/vnd.pgrst.plan+json" }, env: { PGRST_DB_PLAN_ENABLED: "true" } }).wrMedia.kind,
    "MTVndPlan",
  );
});

// --------------------------------------------------------------------------
// Mutations (mutatePlanToQuery / prepareWrite)
// --------------------------------------------------------------------------

interface MutOpts extends PlanOpts {
  body?: string;
}

function mutPlanFor(query: string, opts: MutOpts = {}): MutateReadPlan {
  const tbl = opts.table ?? "projects";
  const conf = resolveConfig({ env: { PGRST_DB_SCHEMAS: "test", ...opts.env } });
  const apiReq = userApiRequest(
    conf,
    { method: opts.method ?? "POST", url: `http://localhost/${tbl}${query}`, headers: new Headers(opts.headers ?? {}) },
    `/${tbl}`,
    new Set(),
    opts.body ?? "{}",
  );
  const act = apiReq.iAction;
  if (act.kind !== "ActDb" || act.db.kind !== "ActRelationMut") throw new Error("not a mutation action");
  return mutateReadPlan(act.db.mutation, apiReq, act.db.qi, conf, cache);
}

function mutSql(query: string, opts: MutOpts = {}): [string, (string | null)[]] {
  const { text, values } = renderSnippet(mutatePlanToQuery(mutPlanFor(query, opts).mrMutatePlan));
  return [normalize(text), values];
}

const SET_INS = "set_config('pgrst.inserted', (coalesce(nullif(current_setting('pgrst.inserted', true), '')::int, 0) + 1)::text, true) <> '0'";
const SET_UPD = "set_config('pgrst.inserted', (coalesce(nullif(current_setting('pgrst.inserted', true), '')::int, 0) - 1)::text, true) <> '-1'";

Deno.test("insert: single json object (columns sorted like Data.Set)", () => {
  const body = '{"name":"n","id":1}';
  assertEquals(mutSql("", { body }), [
    `INSERT INTO ${P}("id", "name") SELECT "pgrst_body"."id", "pgrst_body"."name" ` +
      `FROM (SELECT $1::json AS json_data) pgrst_payload, ` +
      `LATERAL (SELECT "id", "name" FROM json_to_record(pgrst_payload.json_data) AS _("id" integer, "name" text) ) pgrst_body ` +
      `RETURNING 1`,
    [body],
  ]);
});

Deno.test("insert: bulk json array uses json_to_recordset", () => {
  const body = '[{"id":1},{"id":2}]';
  assertEquals(mutSql("", { body }), [
    `INSERT INTO ${P}("id") SELECT "pgrst_body"."id" ` +
      `FROM (SELECT $1::json AS json_data) pgrst_payload, ` +
      `LATERAL (SELECT "id" FROM json_to_recordset(pgrst_payload.json_data) AS _("id" integer) ) pgrst_body ` +
      `RETURNING 1`,
    [body],
  ]);
});

Deno.test("insert: empty object payload rows come from (values(1))", () => {
  assertEquals(mutSql("", { body: "{}" }), [
    `INSERT INTO ${P} SELECT FROM (SELECT $1::json AS json_data) pgrst_payload, ` +
      `LATERAL (SELECT FROM (values(1)) _ ) pgrst_body RETURNING 1`,
    ["{}"],
  ]);
  const [arrText] = mutSql("", { body: "[{},{}]" });
  assertStringIncludes(arrText, "LATERAL (SELECT FROM json_array_elements(pgrst_payload.json_data) _ ) pgrst_body");
});

Deno.test("insert: ?columns= restricts the columns; body passes through raw", () => {
  const body = '{"name":"a","junk":1}';
  const [text, values] = mutSql("?columns=name", { body });
  assertEquals(text.startsWith(`INSERT INTO ${P}("name") SELECT "pgrst_body"."name" `), true);
  assertStringIncludes(text, `AS _("name" text)`);
  assertEquals(values, [body]);
});

Deno.test("insert: unknown payload key is PGRST204; unknown pk-less table has no location cols", () => {
  assertEquals(errCode(() => mutPlanFor("", { body: '{"nope":1}' })), "PGRST204");
});

Deno.test("insert: missing=default merges the column defaults via jsonb", () => {
  const body = '[{"id":1}]';
  assertEquals(
    mutSql("?columns=id,name,qty", { table: "stock", body, headers: { Prefer: "missing=default" } }),
    [
      `INSERT INTO "test"."stock"("id", "name", "qty") SELECT "pgrst_body"."id", "pgrst_body"."name", "pgrst_body"."qty" ` +
        `FROM (SELECT $1::jsonb AS json_data) pgrst_payload, ` +
        `LATERAL (SELECT jsonb_agg(jsonb_build_object('qty', 5) || elem) AS val from jsonb_array_elements(pgrst_payload.json_data) elem) pgrst_json_defs, ` +
        `LATERAL (SELECT "id", "name", "qty" FROM jsonb_to_recordset(pgrst_json_defs.val) AS _("id" integer, "name" text, "qty" integer) ) pgrst_body ` +
        `RETURNING 1`,
      [body],
    ],
  );
});

Deno.test("upsert: merge-duplicates counts pgrst.inserted and updates on conflict", () => {
  const body = '{"id":1,"name":"a"}';
  const [text, values] = mutSql("", { body, headers: { Prefer: "resolution=merge-duplicates" } });
  assertStringIncludes(text, `) pgrst_body WHERE ${SET_INS} ON CONFLICT("id") DO UPDATE SET "id" = EXCLUDED."id", "name" = EXCLUDED."name"WHERE ${SET_UPD} RETURNING 1`);
  assertEquals(values, [body]);
});

Deno.test("upsert: ignore-duplicates does nothing on conflict", () => {
  const [text] = mutSql("", { body: '{"id":1}', headers: { Prefer: "resolution=ignore-duplicates" } });
  assertStringIncludes(text, `) pgrst_body ON CONFLICT("id") DO NOTHING RETURNING 1`);
});

Deno.test("upsert: ?on_conflict= picks the conflict target columns", () => {
  const [text] = mutSql("?on_conflict=name", { body: '{"id":1,"name":"a"}', headers: { Prefer: "resolution=ignore-duplicates" } });
  assertStringIncludes(text, `ON CONFLICT("name") DO NOTHING`);
});

Deno.test("put: insert-on-conflict-update with the pk condition on pgrst_body", () => {
  const body = '{"id":1,"name":"a"}';
  const [text, values] = mutSql("?id=eq.1", { method: "PUT", body });
  assertEquals(text.startsWith(`INSERT INTO ${P}("id", "name") SELECT "pgrst_body"."id", "pgrst_body"."name" `), true);
  assertStringIncludes(text, `) pgrst_body WHERE ${SET_INS} AND "pgrst_body"."id" = $2 ON CONFLICT("id") DO UPDATE SET "id" = EXCLUDED."id", "name" = EXCLUDED."name"WHERE ${SET_UPD} RETURNING 1`);
  assertEquals(values, [body, "1"]);
});

Deno.test("put: filters must be exactly the pk with eq (PGRST105)", () => {
  const body = '{"id":1,"name":"a"}';
  assertEquals(errCode(() => mutPlanFor("", { method: "PUT", body })), "PGRST105");
  assertEquals(errCode(() => mutPlanFor("?name=eq.a", { method: "PUT", body })), "PGRST105");
  assertEquals(errCode(() => mutPlanFor("?id=eq.1&name=eq.a", { method: "PUT", body })), "PGRST105");
  assertEquals(errCode(() => mutPlanFor("?id=gt.1", { method: "PUT", body })), "PGRST105");
  assertEquals(errCode(() => mutPlanFor("?id=not.eq.1", { method: "PUT", body })), "PGRST105");
  assertEquals(errCode(() => mutPlanFor("?id=eq.1&or=(id.eq.1)", { method: "PUT", body })), "PGRST105");
});

Deno.test("update: SET from pgrst_body with the root filters in WHERE", () => {
  const body = '{"name":"x"}';
  assertEquals(mutSql("?id=eq.1", { method: "PATCH", body }), [
    `UPDATE ${P} SET "name" = "pgrst_body"."name" ` +
      `FROM (SELECT $1::json AS json_data) pgrst_payload, ` +
      `LATERAL (SELECT "name" FROM json_to_record(pgrst_payload.json_data) AS _("name" text) ) pgrst_body ` +
      `WHERE ${P}."id" = $2 RETURNING 1`,
    [body, "1"],
  ]);
});

Deno.test("update: empty body degenerates to a no-op select", () => {
  assertEquals(mutSql("?id=eq.1", { method: "PATCH", body: "{}" }), [
    `SELECT NULL FROM ${P} WHERE false`,
    [],
  ]);
  // with return=representation the returnings keep &select= usable
  assertEquals(
    mutSql("?id=eq.1&select=name", { method: "PATCH", body: "{}", headers: { Prefer: "return=representation" } }),
    [`SELECT "projects"."id", "projects"."name" FROM ${P} WHERE false`, []],
  );
});

Deno.test("update: limited update goes through pgrst_affected_rows", () => {
  const body = '{"name":"x"}';
  assertEquals(mutSql("?id=gt.0&order=id&limit=2", { method: "PATCH", body }), [
    `WITH pgrst_update_body AS (` +
      `SELECT "pgrst_body"."name" FROM (SELECT $1::json AS json_data) pgrst_payload, ` +
      `LATERAL (SELECT "name" FROM json_to_record(pgrst_payload.json_data) AS _("name" text) LIMIT 1) pgrst_body ), ` +
      `pgrst_affected_rows AS (` +
      `SELECT ${P}."id" FROM ${P} WHERE ${P}."id" > $2 ORDER BY ${P}."id" LIMIT $3 OFFSET $4) ` +
      `UPDATE ${P} SET "name" = (SELECT "name" FROM pgrst_update_body) FROM pgrst_affected_rows ` +
      `WHERE ${P}."id" = "pgrst_affected_rows"."id" RETURNING 1`,
    [body, "0", "2", "0"],
  ]);
});

Deno.test("delete: plain and limited", () => {
  assertEquals(mutSql("?id=eq.1", { method: "DELETE" }), [
    `DELETE FROM ${P} WHERE ${P}."id" = $1 RETURNING 1`,
    ["1"],
  ]);
  assertEquals(mutSql("?id=gt.0&order=id&limit=1", { method: "DELETE" }), [
    `WITH pgrst_affected_rows AS (` +
      `SELECT ${P}."id" FROM ${P} WHERE ${P}."id" > $1 ORDER BY ${P}."id" LIMIT $2 OFFSET $3) ` +
      `DELETE FROM ${P} USING pgrst_affected_rows ` +
      `WHERE ${P}."id" = "pgrst_affected_rows"."id" RETURNING 1`,
    ["0", "1", "0"],
  ]);
});

Deno.test("returning: representation returns star or the selected+pk+fk columns", () => {
  const rep = { Prefer: "return=representation" };
  const [star] = mutSql("", { body: '{"id":1}', headers: rep });
  assertStringIncludes(star, `RETURNING ${P}.*`);
  const [cols] = mutSql("?select=name", { body: '{"id":1}', headers: rep });
  assertStringIncludes(cols, `RETURNING ${P}."id", ${P}."name"`);
  // embeds add their fk columns so the join can succeed
  const [emb] = mutSql("?select=name,projects(name)", { table: "tasks", body: '{"id":1}', headers: rep });
  assertStringIncludes(emb, `RETURNING ${T}."id", ${T}."name", ${T}."project_id"`);
});

Deno.test("prepareWrite: minimal has no location/inserted tracking and selects the CTE", () => {
  const plan = mutPlanFor("", { body: '{"id":1}' });
  const { text } = renderSnippet(prepareWrite(
    readPlanToQuery(plan.mrReadPlan),
    mutatePlanToQuery(plan.mrMutatePlan),
    true,
    false,
    plan.mrHandler,
    null,
    null,
    ["id"],
  ));
  const t = normalize(text);
  assertStringIncludes(t, "WITH pgrst_source AS (INSERT INTO");
  assertStringIncludes(t, "'' AS total_result_set");
  assertStringIncludes(t, "array[]::text[] AS header");
  assertStringIncludes(t, "'' AS response_inserted");
  assertStringIncludes(t, "FROM (SELECT * FROM pgrst_source) _postgrest_t");
});

Deno.test("prepareWrite: headers-only inserts compute the Location bindings", () => {
  const plan = mutPlanFor("", { body: '{"id":1}', headers: { Prefer: "return=headers-only" } });
  const { text } = renderSnippet(prepareWrite(
    readPlanToQuery(plan.mrReadPlan),
    mutatePlanToQuery(plan.mrMutatePlan),
    true,
    false,
    plan.mrHandler,
    "HeadersOnly",
    null,
    ["id"],
  ));
  const t = normalize(text);
  assertStringIncludes(t, "CASE WHEN pg_catalog.count(_postgrest_t) = 1 THEN coalesce((");
  assertStringIncludes(t, "WHERE json_data.key IN ('id')");
  assertStringIncludes(t, "ELSE array[]::text[] END AS header");
});

Deno.test("prepareWrite: upserts/PUT read back the pgrst.inserted counter", () => {
  const plan = mutPlanFor("", { body: '{"id":1}', headers: { Prefer: "resolution=merge-duplicates" } });
  const { text } = renderSnippet(prepareWrite(
    readPlanToQuery(plan.mrReadPlan),
    mutatePlanToQuery(plan.mrMutatePlan),
    true,
    false,
    plan.mrHandler,
    null,
    "MergeDuplicates",
    ["id"],
  ));
  assertStringIncludes(normalize(text), "nullif(current_setting('pgrst.inserted', true),'')::int AS response_inserted");
});

Deno.test("mutations negotiate NoAgg unless return=representation", () => {
  assertEquals(mutPlanFor("", { body: "{}" }).mrHandler.kind, "NoAgg");
  assertEquals(mutPlanFor("", { body: "{}", headers: { Prefer: "return=representation" } }).mrHandler.kind, "BuiltinOvAggJson");
  // singular media still negotiates for the failNotSingular check
  assertEquals(
    mutPlanFor("", { body: "{}", headers: { Accept: "application/vnd.pgrst.object+json" } }).mrMedia.kind,
    "MTVndSingularJSON",
  );
});

// --------------------------------------------------------------------------
// RPC — callPlanToQuery / prepareCall (phase 7)
// --------------------------------------------------------------------------

const rpcParam = (name: string, type: string, opts: Partial<RoutineParam> = {}): RoutineParam => ({
  name,
  type,
  typeMaxLength: opts.typeMaxLength ?? type,
  required: opts.required ?? true,
  variadic: opts.variadic ?? false,
});

function rpcRoutine(name: string, params: RoutineParam[], opts: Partial<Routine> = {}): Routine {
  return {
    schema: "test",
    name,
    description: null,
    params,
    returnType: {
      kind: "single",
      pgType: { qi: { schema: "pg_catalog", name: "int4" }, composite: false, compositeAlias: false },
    },
    volatility: "immutable",
    hasVariadic: params.some((p) => p.variadic),
    isolationLvl: null,
    funcSettings: [],
    ...opts,
  };
}

const setofProjects: Routine["returnType"] = {
  kind: "setof",
  pgType: { qi: { schema: "test", name: "projects" }, composite: true, compositeAlias: false },
};
const setofTextRet: Routine["returnType"] = {
  kind: "setof",
  pgType: { qi: { schema: "pg_catalog", name: "text" }, composite: false, compositeAlias: false },
};

const rpcRoutines: Routine[] = [
  rpcRoutine("add", [rpcParam("a", "integer"), rpcParam("b", "integer")]),
  rpcRoutine("getprojs", [rpcParam("min_id", "integer", { required: false })], { returnType: setofProjects, volatility: "stable" }),
  rpcRoutine("getnames", [], { returnType: setofTextRet, volatility: "stable" }),
  rpcRoutine("vconcat", [rpcParam("v", "text[]", { variadic: true })]),
  rpcRoutine("jecho", [rpcParam("", "json")]),
  rpcRoutine("techo", [rpcParam("", "text")]),
];

const rpcCache: SchemaCache = {
  ...cache,
  routines: new Map(
    rpcRoutines.map((r): [string, Routine[]] => [`${r.schema}.${r.name}`, [r]]),
  ),
};

interface RpcOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function callPlanFor(fn: string, query: string, opts: RpcOpts = {}): CallReadPlan {
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
  return callReadPlan(act.db.qi, conf, rpcCache, apiReq, act.db.invMethod);
}

function callSql(fn: string, query: string, opts: RpcOpts = {}): [string, (string | null)[]] {
  const { text, values } = renderSnippet(callPlanToQuery(callPlanFor(fn, query, opts).crCallPlan));
  return [normalize(text), values];
}

Deno.test("callPlanToQuery: named key params build the args CTE + LATERAL `:=` call", () => {
  assertEquals(callSql("add", "", { body: '{"a":1,"b":2}' }), [
    `SELECT pgrst_call.pgrst_scalar FROM (SELECT $1::json AS json_data) pgrst_payload, ` +
    `LATERAL (SELECT "a", "b" FROM json_to_record(pgrst_payload.json_data) AS _("a" integer, "b" integer) LIMIT 1) pgrst_body , ` +
    `LATERAL (SELECT "test"."add"("a" := pgrst_body."a", "b" := pgrst_body."b") pgrst_scalar) pgrst_call`,
    ['{"a":1,"b":2}'],
  ]);
});

Deno.test("callPlanToQuery: GET args go through jsonRpcParams into the same shape", () => {
  const [text, values] = callSql("add", "?a=1&b=2", { method: "GET" });
  assertStringIncludes(text, `LATERAL (SELECT "test"."add"("a" := pgrst_body."a", "b" := pgrst_body."b") pgrst_scalar) pgrst_call`);
  assertEquals(values, ['{"a":"1","b":"2"}']);
});

Deno.test("callPlanToQuery: only the specified optional params are passed", () => {
  // no args: KeyParams [] → bare call (the default select=* returns pgrst_call.*)
  assertEquals(callSql("getprojs", "", { body: "{}" }), [
    `SELECT "pgrst_call".* FROM "test"."getprojs"() pgrst_call`,
    [],
  ]);
  const [text, values] = callSql("getprojs", "?min_id=1", { method: "GET" });
  assertEquals(text,
    `SELECT "pgrst_call".* FROM (SELECT $1::json AS json_data) pgrst_payload, ` +
    `LATERAL (SELECT "min_id" FROM json_to_record(pgrst_payload.json_data) AS _("min_id" integer) LIMIT 1) pgrst_body , ` +
    `LATERAL "test"."getprojs"("min_id" := pgrst_body."min_id") pgrst_call`);
  assertEquals(values, ['{"min_id":"1"}']);
});

Deno.test("callPlanToQuery: select columns become pgrst_call returnings", () => {
  const [text] = callSql("getprojs", "?select=id,name", { body: "{}" });
  assertEquals(text, `SELECT "pgrst_call"."id", "pgrst_call"."name" FROM "test"."getprojs"() pgrst_call`);
});

Deno.test("callPlanToQuery: embeds add FK columns to the returnings", () => {
  const [text] = callSql("getprojs", "?select=name,clients(name)", { body: "{}" });
  assertEquals(text, `SELECT "pgrst_call"."client_id", "pgrst_call"."name" FROM "test"."getprojs"() pgrst_call`);
});

Deno.test("callPlanToQuery: variadic params use the VARIADIC form", () => {
  const [text, values] = callSql("vconcat", "?v=x&v=y", { method: "GET" });
  assertStringIncludes(text, `LATERAL (SELECT "test"."vconcat"(VARIADIC "v" := pgrst_body."v") pgrst_scalar) pgrst_call`);
  assertStringIncludes(text, `AS _("v" text[]) LIMIT 1) pgrst_body`);
  assertEquals(values, ['{"v":["x","y"]}']);
});

Deno.test("callPlanToQuery: setof scalar wraps in pgrst_scalar", () => {
  assertEquals(callSql("getnames", "", { method: "GET" }), [
    `SELECT pgrst_call.pgrst_scalar FROM (SELECT "test"."getnames"() pgrst_scalar) pgrst_call`,
    [],
  ]);
});

Deno.test("callPlanToQuery: single unnamed json param calls positionally with the raw body", () => {
  assertEquals(callSql("jecho", "", { body: '{"x":[1,2]}' }), [
    `SELECT pgrst_call.pgrst_scalar FROM (SELECT "test"."jecho"($1::json) pgrst_scalar) pgrst_call`,
    ['{"x":[1,2]}'],
  ]);
});

Deno.test("callPlanToQuery: single unnamed text param binds the raw body with a ::text cast", () => {
  assertEquals(callSql("techo", "", { headers: { "Content-Type": "text/plain" }, body: "hello" }), [
    `SELECT pgrst_call.pgrst_scalar FROM (SELECT "test"."techo"($1::text) pgrst_scalar) pgrst_call`,
    ["hello"],
  ]);
});

Deno.test("prepareCall: scalar body aggregates pgrst_scalar and page_total is 1", () => {
  const plan = callPlanFor("add", "", { body: '{"a":1,"b":2}' });
  const { text } = renderSnippet(prepareCall(
    plan.crProc,
    callPlanToQuery(plan.crCallPlan),
    readPlanToQuery(plan.crReadPlan),
    readPlanToCountQuery(plan.crReadPlan),
    false,
    plan.crHandler,
  ));
  const t = normalize(text);
  assertStringIncludes(t, "WITH pgrst_source AS (SELECT pgrst_call.pgrst_scalar FROM");
  assertStringIncludes(t, "null::bigint AS total_result_set, 1 AS page_total");
  assertStringIncludes(t, "(coalesce(json_agg(_postgrest_t.pgrst_scalar)->0, 'null'))::text AS body");
  assertStringIncludes(t, `FROM (SELECT "add".* FROM "pgrst_source" AS "add" ) _postgrest_t`);
});

Deno.test("prepareCall: setof composite counts rows and aggregates whole rows", () => {
  const plan = callPlanFor("getprojs", "", { method: "GET", headers: { Prefer: "count=exact" } });
  const { text } = renderSnippet(prepareCall(
    plan.crProc,
    callPlanToQuery(plan.crCallPlan),
    readPlanToQuery(plan.crReadPlan),
    readPlanToCountQuery(plan.crReadPlan),
    true,
    plan.crHandler,
  ));
  const t = normalize(text);
  assertStringIncludes(t, ", pgrst_source_count AS (SELECT 1 FROM");
  assertStringIncludes(t, "(SELECT pg_catalog.count(*) FROM pgrst_source_count) AS total_result_set");
  assertStringIncludes(t, "pg_catalog.count(_postgrest_t) AS page_total");
  assertStringIncludes(t, "(coalesce(json_agg(_postgrest_t), '[]'))::text AS body");
});

Deno.test("prepareCall: setof scalar aggregates pgrst_scalar as an array", () => {
  const plan = callPlanFor("getnames", "", { method: "GET" });
  const { text } = renderSnippet(prepareCall(
    plan.crProc,
    callPlanToQuery(plan.crCallPlan),
    readPlanToQuery(plan.crReadPlan),
    readPlanToCountQuery(plan.crReadPlan),
    false,
    plan.crHandler,
  ));
  assertStringIncludes(normalize(text), "(coalesce(json_agg(_postgrest_t.pgrst_scalar), '[]'))::text AS body");
});

Deno.test("prepareCall: singular accept aggregates the first scalar (asJsonSingleF)", () => {
  const plan = callPlanFor("add", "", {
    body: '{"a":1,"b":2}',
    headers: { Accept: "application/vnd.pgrst.object+json" },
  });
  const { text } = renderSnippet(prepareCall(
    plan.crProc,
    callPlanToQuery(plan.crCallPlan),
    readPlanToQuery(plan.crReadPlan),
    readPlanToCountQuery(plan.crReadPlan),
    false,
    plan.crHandler,
  ));
  assertStringIncludes(normalize(text), "(coalesce(json_agg(_postgrest_t.pgrst_scalar)->0, 'null'))::text AS body");
});

Deno.test("prepareCall: HEAD negotiates NoAgg (empty body aggregation)", () => {
  const plan = callPlanFor("getprojs", "", { method: "HEAD" });
  const { text } = renderSnippet(prepareCall(
    plan.crProc,
    callPlanToQuery(plan.crCallPlan),
    readPlanToQuery(plan.crReadPlan),
    readPlanToCountQuery(plan.crReadPlan),
    false,
    plan.crHandler,
  ));
  assertStringIncludes(normalize(text), "(''::text)::text AS body");
});

// --------------------------------------------------------------------------
// singleParameter (SqlFragment.hs) — raw bodies for OnePosParam RPCs
// --------------------------------------------------------------------------

Deno.test("singleParameter: raw body bytes reach a bytea param as pg hex input", () => {
  // Upstream binds the raw request bytes with a typed HE.bytea encoder; the
  // text-protocol equivalent is the '\x...' hex input form + the ::bytea cast.
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  const { text, values } = renderSnippet(singleParameter(bytes, "bytea"));
  assertEquals(text, "$1::bytea");
  assertEquals(values, ["\\x89504e4700ff"]);
});

Deno.test("singleParameter: byte bodies for text-ish params decode as UTF-8; strings pass through", () => {
  const utf8 = new TextEncoder().encode("héllo");
  assertEquals(renderSnippet(singleParameter(utf8, "text")).values, ["héllo"]);
  assertEquals(renderSnippet(singleParameter("plain", "text")), { text: "$1::text", values: ["plain"] });
});

// --------------------------------------------------------------------------
// decodeCustomBody (Statements.hs HD.bytea emulation per domain base type)
// --------------------------------------------------------------------------

const customHandler = (baseType: string) =>
  ({ kind: "CustomFunc", funcQi: { schema: "test", name: "h" }, target: { kind: "RelId", qi: { schema: "test", name: "t" } }, baseType }) as Parameters<typeof decodeCustomBody>[0];

const rsWithBody = (rsBody: string) => ({
  kind: "RSStandard",
  rsTableTotal: null,
  rsQueryTotal: 1,
  rsLocation: [],
  rsBody,
  rsGucHeaders: null,
  rsGucStatus: null,
  rsInserted: null,
}) as Parameters<typeof decodeCustomBody>[1];

Deno.test("decodeCustomBody: jsonb-based domains keep the jsonb binary version byte 0x01", () => {
  // Hasql reads the body column in binary format: jsonb_send = 0x01 + text.
  const out = decodeCustomBody(customHandler("jsonb"), rsWithBody('{"a": 1}')).rsBody;
  assertEquals(out, new Uint8Array([0x01, ...new TextEncoder().encode('{"a": 1}')]));
  // an empty result set sent no jsonb value — no version byte
  assertEquals(decodeCustomBody(customHandler("jsonb"), rsWithBody("")).rsBody, "");
});

Deno.test("decodeCustomBody: bytea-based domains hex-decode; other base types pass through", () => {
  assertEquals(decodeCustomBody(customHandler("bytea"), rsWithBody("\\x0102ff")).rsBody, new Uint8Array([1, 2, 0xff]));
  assertEquals(decodeCustomBody(customHandler("text"), rsWithBody("\nhi")).rsBody, "\nhi");
  assertEquals(decodeCustomBody(customHandler("json"), rsWithBody('{"a":1}')).rsBody, '{"a":1}');
});

Deno.test("decodeCustomBody: xml-based domains run xml_out_internal", () => {
  assertEquals(decodeCustomBody(customHandler("xml"), rsWithBody("\n<html>x</html>")).rsBody, "<html>x</html>");
});

Deno.test("xmlOutInternal ports pg's xml.c for a UTF-8 client", () => {
  // no declaration: eat exactly one leading newline
  assertEquals(xmlOutInternal("\n<a/>"), "<a/>");
  assertEquals(xmlOutInternal("\n\n<a/>"), "\n<a/>");
  assertEquals(xmlOutInternal("<a/>"), "<a/>");
  // a version-1.0 declaration without standalone is dropped (print_xml_decl
  // returns false for a UTF-8 target encoding), eating the following newline
  assertEquals(xmlOutInternal('<?xml version="1.0"?>\n<a/>'), "<a/>");
  assertEquals(xmlOutInternal('<?xml version="1.0" encoding="UTF-8"?><a/>'), "<a/>");
  // a standalone attribute forces the declaration to be re-printed
  assertEquals(xmlOutInternal('<?xml version="1.0" standalone="yes"?>\n<a/>'), '<?xml version="1.0" standalone="yes"?>\n<a/>');
  // <?xml-stylesheet is a PI, not a declaration
  assertEquals(xmlOutInternal("<?xml-stylesheet href='x'?><a/>"), "<?xml-stylesheet href='x'?><a/>");
});
