// Snapshot-style tests for the read SQL generation: query string → plan →
// SQL text + ordered params. SQL strings are asserted whitespace-normalized
// so phase 5 diffs stay reviewable.

import { assertEquals, assertStringIncludes, assertThrows } from "std/assert/mod.ts";
import { resolveConfig } from "../functions/config.ts";
import { PgrstError } from "../functions/errors.ts";
import { userApiRequest } from "../functions/parse/api-request.ts";
import { type WrappedReadPlan, wrappedReadPlan } from "../functions/plan/read-plan.ts";
import { renderSnippet } from "../functions/sql/builder.ts";
import { limitedQuery, readPlanToCountQuery, readPlanToQuery } from "../functions/sql/query-builder.ts";
import { preparePlanRows, prepareRead } from "../functions/sql/statements.ts";
import {
  type Column,
  type Relationship,
  relsMapKey,
  repKey,
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

function mainSql(query: string, opts: PlanOpts = {}): [string, string[]] {
  const { text, values } = renderSnippet(readPlanToQuery(planFor(query, opts).wrReadPlan));
  return [normalize(text), values];
}

function countSql(query: string, opts: PlanOpts = {}): [string, string[]] {
  const { text, values } = renderSnippet(readPlanToCountQuery(planFor(query, opts).wrReadPlan));
  return [normalize(text), values];
}

/** The WHERE..LIMIT tail of the main query (after the FROM clause). */
function tailSql(query: string, opts: PlanOpts = {}): [string, string[]] {
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
  // ...and negotiates when enabled (execution is stubbed until phase 8)
  assertEquals(
    planFor("", { headers: { Accept: "application/vnd.pgrst.plan+json" }, env: { PGRST_DB_PLAN_ENABLED: "true" } }).wrMedia.kind,
    "MTVndPlan",
  );
});
