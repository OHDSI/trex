// End-to-end tests for phase 8 (custom media types, vnd.pgrst.plan, OpenAPI
// root, OPTIONS) — DB-gated on PGRST_DB_URI. Creates a throwaway schema +
// nologin anon role, drives handle(new Request(...)) and drops everything in
// finally.

import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { Pool } from "pg";
import { handle, shutdownForTests } from "../functions/app.ts";
import { resetConfigForTests } from "../functions/config.ts";
import { closePoolForTests } from "../functions/db.ts";
import { resetSchemaCacheStateForTests } from "../functions/schema-cache/index.ts";

const dsn = Deno.env.get("PGRST_DB_URI");

const SCHEMA = "pgrsttest_media";
const ROLE = "pgrsttest_media_anon";

const MANAGED_ENV = [
  "PGRST_DB_SCHEMAS",
  "PGRST_DB_ANON_ROLE",
  "PGRST_DB_CHANNEL_ENABLED",
  "PGRST_DB_PLAN_ENABLED",
  "PGRST_DB_ROOT_SPEC",
  "PGRST_OPENAPI_MODE",
  "PGRST_OPENAPI_SECURITY_ACTIVE",
  "PGRST_OPENAPI_SERVER_PROXY_URI",
];

async function resetWithEnv(env: Record<string, string> = {}): Promise<void> {
  await shutdownForTests();
  await closePoolForTests();
  resetConfigForTests();
  resetSchemaCacheStateForTests();
  for (const key of MANAGED_ENV) Deno.env.delete(key);
  Deno.env.set("PGRST_DB_SCHEMAS", SCHEMA);
  Deno.env.set("PGRST_DB_ANON_ROLE", ROLE);
  Deno.env.set("PGRST_DB_CHANNEL_ENABLED", "false");
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
}

function req(
  method: string,
  pathAndQuery: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<Response> {
  const h = new Headers(headers);
  if (body !== undefined && !h.has("content-type")) h.set("Content-Type", "application/json");
  return handle(new Request(`http://localhost/postgrest${pathAndQuery}`, { method, headers: h, body }));
}

async function jsonBody(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}

const SETUP_SQL = `
  drop schema if exists ${SCHEMA} cascade;
  create schema ${SCHEMA};
  comment on schema ${SCHEMA} is E'My test API\ndescription of it';

  -- media-type domains (SchemaCache.hs mediaHandlers targets)
  create domain ${SCHEMA}."text/plain" as text;
  create domain ${SCHEMA}."text/xml" as pg_catalog.xml;
  create domain ${SCHEMA}."application/octet-stream" as bytea;
  create domain ${SCHEMA}."text/tab-separated-values" as text;

  create table ${SCHEMA}.items (id int primary key, name text);
  comment on table ${SCHEMA}.items is E'Item summary\n\nItem description';
  comment on column ${SCHEMA}.items.name is 'the item name';
  insert into ${SCHEMA}.items values (1, 'one'), (2, 'two');

  create table ${SCHEMA}.lines (id int primary key, name text);
  insert into ${SCHEMA}.lines values (1, 'one'), (2, 'two');

  -- an aggregate-backed view is not auto-updatable (OPTIONS: GET/HEAD only)
  create view ${SCHEMA}.stats_view as select count(*) as total from ${SCHEMA}.items;

  -- a table the anon role cannot see (follow-privileges vs ignore-privileges)
  create table ${SCHEMA}.secret (id int primary key);

  -- custom media handler: tab-separated aggregate over lines
  create function ${SCHEMA}.tsv_trans (state ${SCHEMA}."text/tab-separated-values", next ${SCHEMA}.lines)
    returns ${SCHEMA}."text/tab-separated-values" immutable language sql as
    $$ select (state || next.id::text || E'\t' || next.name || E'\n')::${SCHEMA}."text/tab-separated-values" $$;
  create aggregate ${SCHEMA}.tsv_agg (${SCHEMA}.lines) (
    initcond = ''
  , stype = ${SCHEMA}."text/tab-separated-values"
  , sfunc = ${SCHEMA}.tsv_trans
  );

  -- scalar functions returning media-type domains (raw output)
  create function ${SCHEMA}.welcome() returns ${SCHEMA}."text/plain"
    stable language sql as $$ select 'Welcome to PostgREST'::${SCHEMA}."text/plain" $$;
  create function ${SCHEMA}.ret_xml() returns ${SCHEMA}."text/xml"
    stable language sql as $$ select '<my-xml-tag/>'::xml::${SCHEMA}."text/xml" $$;
  create function ${SCHEMA}.ret_bytes() returns ${SCHEMA}."application/octet-stream"
    stable language sql as $$ select '\\x00ff10'::bytea::${SCHEMA}."application/octet-stream" $$;

  -- plain functions for plan / OPTIONS / db-root-spec
  create function ${SCHEMA}.getitems() returns setof ${SCHEMA}.items
    stable language sql as $$ select * from ${SCHEMA}.items $$;
  create function ${SCHEMA}.ins_item(id int, name text) returns void
    volatile language sql as $$ insert into ${SCHEMA}.items values (id, name) $$;
  create function ${SCHEMA}.reset_items() returns void
    volatile language sql as $$ delete from ${SCHEMA}.items where false $$;
  create function ${SCHEMA}.root_override() returns json
    stable language sql as $$ select json_build_object('hello', 'root') $$;

  do $do$ begin create role ${ROLE} nologin; exception when duplicate_object then null; end $do$;
  grant usage on schema ${SCHEMA} to ${ROLE};
  grant select on ${SCHEMA}.items, ${SCHEMA}.lines, ${SCHEMA}.stats_view to ${ROLE};
  grant insert on ${SCHEMA}.items to ${ROLE};
  grant execute on all functions in schema ${SCHEMA} to ${ROLE};
`;

Deno.test({
  name: "media types + plan + openapi + options e2e (phase 8)",
  ignore: !dsn,
  fn: async (t) => {
    const savedEnv = new Map(MANAGED_ENV.map((k) => [k, Deno.env.get(k)] as const));
    const admin = new Pool({ connectionString: dsn, max: 1 });
    try {
      await admin.query(SETUP_SQL);
      await resetWithEnv();

      // ------------------------------------------------------------------
      // Raw scalar outputs via media-type domains
      // ------------------------------------------------------------------

      await t.step("scalar RPC with text/plain domain returns raw text", async () => {
        const res = await req("GET", "/rpc/welcome", { Accept: "text/plain" });
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "text/plain; charset=utf-8");
        assertEquals(await res.text(), "Welcome to PostgREST");
      });

      await t.step("scalar RPC with text/xml domain returns raw xml", async () => {
        const res = await req("GET", "/rpc/ret_xml", { Accept: "text/xml" });
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "text/xml; charset=utf-8");
        assertEquals(await res.text(), "<my-xml-tag/>");
      });

      await t.step("scalar RPC with octet-stream domain roundtrips bytes", async () => {
        const res = await req("GET", "/rpc/ret_bytes", { Accept: "application/octet-stream" });
        assertEquals(res.status, 200);
        // no charset on octet-stream (MediaType.hs toContentType)
        assertEquals(res.headers.get("Content-Type"), "application/octet-stream");
        assertEquals(new Uint8Array(await res.arrayBuffer()), new Uint8Array([0x00, 0xff, 0x10]));
      });

      await t.step("raw accepts without a handler are 406 PGRST107 (exact payload)", async () => {
        // v12 has no builtin raw output: tables need a media-type domain handler
        const res = await req("GET", "/items", { Accept: "text/plain" });
        assertEquals(res.status, 406);
        assertEquals(await jsonBody(res), {
          code: "PGRST107",
          message: "None of these media types are available: text/plain",
          details: null,
          hint: null,
        });
        // a text/plain function does not satisfy text/xml
        const res2 = await req("GET", "/rpc/welcome", { Accept: "text/xml" });
        assertEquals(res2.status, 406);
        assertEquals(await jsonBody(res2), {
          code: "PGRST107",
          message: "None of these media types are available: text/xml",
          details: null,
          hint: null,
        });
      });

      // ------------------------------------------------------------------
      // Custom media handler aggregate over a table
      // ------------------------------------------------------------------

      await t.step("custom aggregate handler drives the body and Content-Type", async () => {
        const res = await req("GET", "/lines", { Accept: "text/tab-separated-values" });
        assertEquals(res.status, 200);
        // custom media types carry no charset (MTOther)
        assertEquals(res.headers.get("Content-Type"), "text/tab-separated-values");
        assertEquals(await res.text(), "1\tone\n2\ttwo\n");
      });

      await t.step("custom aggregate handler works with filters", async () => {
        const res = await req("GET", "/lines?id=eq.2", { Accept: "text/tab-separated-values" });
        assertEquals(res.status, 200);
        assertEquals(await res.text(), "2\ttwo\n");
      });

      await t.step("custom aggregate handler refuses an explicit select (406)", async () => {
        const res = await req("GET", "/lines?select=id", { Accept: "text/tab-separated-values" });
        assertEquals(res.status, 406);
        assertEquals(await jsonBody(res), {
          code: "PGRST107",
          message: "None of these media types are available: text/tab-separated-values",
          details: null,
          hint: null,
        });
      });

      // ------------------------------------------------------------------
      // vnd.pgrst.plan
      // ------------------------------------------------------------------

      await t.step("plan accepts are refused while db-plan-enabled=false", async () => {
        const res = await req("GET", "/items", { Accept: "application/vnd.pgrst.plan" });
        assertEquals(res.status, 406);
        assertEquals(await jsonBody(res), {
          code: "PGRST107",
          message: 'None of these media types are available: application/vnd.pgrst.plan+text; for="application/json"',
          details: null,
          hint: null,
        });
      });

      await resetWithEnv({ PGRST_DB_PLAN_ENABLED: "true" });

      await t.step("read plan: text format", async () => {
        const res = await req("GET", "/items", { Accept: "application/vnd.pgrst.plan" });
        assertEquals(res.status, 200);
        assertEquals(
          res.headers.get("Content-Type"),
          'application/vnd.pgrst.plan+text; for="application/json"; charset=utf-8',
        );
        const body = await res.text();
        assertStringIncludes(body, "Aggregate");
        assertStringIncludes(body, "(cost=");
      });

      await t.step("read plan: json format parses and holds a Plan node", async () => {
        const res = await req("GET", "/items", { Accept: "application/vnd.pgrst.plan+json" });
        assertEquals(res.status, 200);
        assertEquals(
          res.headers.get("Content-Type"),
          'application/vnd.pgrst.plan+json; for="application/json"; charset=utf-8',
        );
        const parsed = JSON.parse(await res.text()) as { Plan: Record<string, unknown> }[];
        assertEquals(Array.isArray(parsed), true);
        assertEquals(typeof parsed[0].Plan, "object");
      });

      await t.step("read plan: the analyze option executes the plan", async () => {
        const res = await req("GET", "/items", { Accept: "application/vnd.pgrst.plan+text; options=analyze" });
        assertEquals(res.status, 200);
        assertStringIncludes(
          res.headers.get("Content-Type") ?? "",
          'application/vnd.pgrst.plan+text; for="application/json"; options=analyze',
        );
        assertStringIncludes(await res.text(), "actual time");
      });

      await t.step("mutation plan: EXPLAIN of the insert statement", async () => {
        const res = await req(
          "POST",
          "/items",
          { Accept: "application/vnd.pgrst.plan" },
          '{"id":99,"name":"ninetynine"}',
        );
        assertEquals(res.status, 200);
        assertStringIncludes(await res.text(), "Insert on items");
        // plain EXPLAIN does not execute: the row must not exist
        const check = await req("GET", "/items?id=eq.99");
        assertEquals(await check.text(), "[]");
      });

      await t.step("rpc plan: EXPLAIN of the call statement", async () => {
        const res = await req("GET", "/rpc/getitems", { Accept: "application/vnd.pgrst.plan" });
        assertEquals(res.status, 200);
        assertStringIncludes(await res.text(), "(cost=");
      });

      // ------------------------------------------------------------------
      // OpenAPI root
      // ------------------------------------------------------------------

      await resetWithEnv();

      await t.step("GET / returns the swagger doc reflecting tables/columns/comments/rpc", async () => {
        const res = await req("GET", "/");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "application/openapi+json; charset=utf-8");
        const doc = await jsonBody(res) as Record<string, Record<string, Record<string, unknown>>>;
        assertEquals(doc.swagger as unknown, "2.0");
        assertEquals(doc.info.title as unknown, "My test API");
        assertEquals(doc.info.description as unknown, "description of it");
        assertEquals(doc.info.version as unknown, "12.2.3");
        // paths: tables + rpc + root
        assertEquals("/items" in doc.paths, true);
        assertEquals("/lines" in doc.paths, true);
        assertEquals("/rpc/welcome" in doc.paths, true);
        assertEquals("/rpc/ins_item" in doc.paths, true);
        assertEquals((doc.paths["/items"].get as Record<string, unknown>).summary, "Item summary");
        assertEquals((doc.paths["/items"].get as Record<string, unknown>).description, "Item description");
        // stats_view is read-only → only get
        assertEquals(Object.keys(doc.paths["/stats_view"]), ["get"]);
        // definitions carry the column metadata
        const items = doc.definitions.items as Record<string, Record<string, Record<string, unknown>>>;
        assertEquals(items.properties.id.type, "integer");
        assertStringIncludes(String(items.properties.id.description), "This is a Primary Key.<pk/>");
        assertEquals(items.properties.name.description, "the item name");
        assertEquals((items as unknown as Record<string, unknown>).required, ["id"]);
        // per-column rowFilter parameter defs
        const params = doc.parameters as Record<string, unknown>;
        assertEquals("rowFilter.items.id" in params, true);
      });

      await t.step("HEAD / responds 200 with the openapi Content-Type and no body", async () => {
        const res = await req("HEAD", "/");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "application/openapi+json; charset=utf-8");
        assertEquals(await res.text(), "");
      });

      await t.step("GET / with an unacceptable Accept is 406", async () => {
        const res = await req("GET", "/", { Accept: "text/csv" });
        assertEquals(res.status, 406);
        assertEquals((await jsonBody(res) as { code: string }).code, "PGRST107");
      });

      await t.step("follow-privileges hides inaccessible tables; ignore-privileges shows them", async () => {
        // default openapi-mode is follow-privileges; anon has no grant on secret
        const followDoc = await jsonBody(await req("GET", "/")) as { paths: Record<string, unknown> };
        assertEquals("/secret" in followDoc.paths, false);
        assertEquals("/items" in followDoc.paths, true);

        await resetWithEnv({ PGRST_OPENAPI_MODE: "ignore-privileges" });
        const ignoreDoc = await jsonBody(await req("GET", "/")) as { paths: Record<string, unknown> };
        assertEquals("/secret" in ignoreDoc.paths, true);
      });

      await t.step("openapi-mode=disabled 404s the root", async () => {
        await resetWithEnv({ PGRST_OPENAPI_MODE: "disabled" });
        const res = await req("GET", "/");
        assertEquals(res.status, 404);
      });

      await t.step("db-root-spec replaces the root with the routine's response", async () => {
        await resetWithEnv({ PGRST_DB_ROOT_SPEC: "root_override" });
        const res = await req("GET", "/");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "application/json; charset=utf-8");
        assertEquals(await jsonBody(res), { hello: "root" });
        // OPTIONS / routes to the routine info of the root spec (stable fn)
        const opt = await req("OPTIONS", "/");
        assertEquals(opt.headers.get("Allow"), "OPTIONS,GET,HEAD,POST");
      });

      // ------------------------------------------------------------------
      // OPTIONS
      // ------------------------------------------------------------------

      await resetWithEnv();

      await t.step("OPTIONS on a table lists the writable verbs (PK enables PUT)", async () => {
        const res = await req("OPTIONS", "/items");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Allow"), "OPTIONS,GET,HEAD,POST,PUT,PATCH,DELETE");
        assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
        assertEquals(await res.text(), "");
      });

      await t.step("OPTIONS on a non-auto-updatable view is read-only", async () => {
        const res = await req("OPTIONS", "/stats_view");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Allow"), "OPTIONS,GET,HEAD");
      });

      await t.step("OPTIONS on an unknown relation is 404", async () => {
        const res = await req("OPTIONS", "/missing");
        assertEquals(res.status, 404);
      });

      await t.step("OPTIONS on routines follows volatility", async () => {
        const stable = await req("OPTIONS", "/rpc/welcome");
        assertEquals(stable.status, 200);
        assertEquals(stable.headers.get("Allow"), "OPTIONS,GET,HEAD,POST");
        const volatile = await req("OPTIONS", "/rpc/reset_items");
        assertEquals(volatile.headers.get("Allow"), "OPTIONS,POST");
        const missing = await req("OPTIONS", "/rpc/nope");
        assertEquals(missing.status, 404);
        // a function whose required args cannot match an empty OPTIONS query
        // also 404s (upstream plans OPTIONS through findProc)
        const reqArgs = await req("OPTIONS", "/rpc/ins_item");
        assertEquals(reqArgs.status, 404);
      });

      await t.step("OPTIONS on the root allows GET/HEAD", async () => {
        const res = await req("OPTIONS", "/");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Allow"), "OPTIONS,GET,HEAD");
      });
    } finally {
      await shutdownForTests();
      await closePoolForTests();
      for (const [k, v] of savedEnv) {
        if (v === undefined) Deno.env.delete(k);
        else Deno.env.set(k, v);
      }
      resetConfigForTests();
      resetSchemaCacheStateForTests();
      await admin.query(`drop schema if exists ${SCHEMA} cascade; drop role if exists ${ROLE};`).catch(() => {});
      await admin.end();
    }
  },
});
