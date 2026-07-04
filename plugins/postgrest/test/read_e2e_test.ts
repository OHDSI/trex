// End-to-end tests for the read pipeline (phase 4b) — DB-gated on
// PGRST_DB_URI. Creates a throwaway schema + nologin anon role, drives
// handle(new Request(...)) and drops everything in finally.

import { assertEquals, assertMatch, assertStringIncludes } from "std/assert/mod.ts";
import { Pool } from "pg";
import { handle, shutdownForTests } from "../functions/app.ts";
import { resetConfigForTests } from "../functions/config.ts";
import { closePoolForTests } from "../functions/db.ts";
import { resetSchemaCacheStateForTests } from "../functions/schema-cache/index.ts";

const dsn = Deno.env.get("PGRST_DB_URI");

const SCHEMA = "pgrsttest_read";
const ROLE = "pgrsttest_read_anon";

// Env vars the groups toggle; saved/restored around the whole test.
const MANAGED_ENV = [
  "PGRST_DB_SCHEMAS",
  "PGRST_DB_ANON_ROLE",
  "PGRST_DB_CHANNEL_ENABLED",
  "PGRST_DB_PRE_REQUEST",
  "PGRST_DB_MAX_ROWS",
  "PGRST_DB_AGGREGATES_ENABLED",
  "PGRST_JWT_SECRET",
];

/** Applies a group's env and resets the config/pool/cache singletons. */
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

function get(pathAndQuery: string, headers: Record<string, string> = {}, method = "GET"): Promise<Response> {
  return handle(new Request(`http://localhost/postgrest${pathAndQuery}`, { method, headers }));
}

async function jsonBody(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}

const SETUP_SQL = `
  drop schema if exists ${SCHEMA} cascade;
  create schema ${SCHEMA};
  create type ${SCHEMA}.mood as enum ('happy','sad');
  create domain ${SCHEMA}.code5 as text check (length(value) <= 5);
  create table ${SCHEMA}.items (
    id   int primary key,
    name text,
    qty  int,
    tags text[],
    data jsonb,
    tsv  tsvector,
    mood ${SCHEMA}.mood,
    code ${SCHEMA}.code5
  );
  insert into ${SCHEMA}.items values
    (1, 'apple',  10, '{red,fruit}', '{"a":{"b":1},"n":null}', to_tsvector('english','apple pie'),    'happy', 'A1'),
    (2, 'banana', null, '{yellow}',  '{"a":{"b":2}}',          to_tsvector('english','banana split'), 'sad',   'B2'),
    (3, 'cherry', 30, '{red}',       null,                     to_tsvector('english','cherry cake'),  null,    null);
  analyze ${SCHEMA}.items;
  create function ${SCHEMA}.pre_ok() returns void language sql as
    $$ select set_config('response.headers', '[{"X-Custom":"hi"},{"Cache-Control":"no-store"}]', true) $$;
  create function ${SCHEMA}.pre_bad_headers() returns void language sql as
    $$ select set_config('response.headers', 'not-json', true) $$;
  create function ${SCHEMA}.pre_status() returns void language sql as
    $$ select set_config('response.status', '418', true) $$;
  do $do$ begin create role ${ROLE} nologin; exception when duplicate_object then null; end $do$;
  grant usage on schema ${SCHEMA} to ${ROLE};
  grant select on all tables in schema ${SCHEMA} to ${ROLE};
  grant execute on all functions in schema ${SCHEMA} to ${ROLE};
`;

Deno.test({
  name: "read e2e (phase 4b)",
  ignore: !dsn,
  fn: async (t) => {
    const savedEnv = new Map(MANAGED_ENV.map((k) => [k, Deno.env.get(k)] as const));
    const admin = new Pool({ connectionString: dsn, max: 1 });
    try {
      await admin.query(SETUP_SQL);
      await resetWithEnv();

      await t.step("select all with order returns json rows", async () => {
        const res = await get("/items?select=id,name&order=id");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "application/json; charset=utf-8");
        assertEquals(res.headers.get("Content-Range"), "0-2/*");
        assertEquals(await jsonBody(res), [
          { id: 1, name: "apple" },
          { id: 2, name: "banana" },
          { id: 3, name: "cherry" },
        ]);
      });

      await t.step("Content-Location carries the canonical query string", async () => {
        const res = await get("/items?select=id&id=eq.1");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Location"), "/items?id=eq.1&select=id");
        await res.body?.cancel();
      });

      await t.step("projections: aliases, casts, json paths", async () => {
        const res = await get("/items?select=label:name,qty::text,data->a->>b&order=id");
        assertEquals(await jsonBody(res), [
          { label: "apple", qty: "10", b: "1" },
          { label: "banana", qty: null, b: "2" },
          { label: "cherry", qty: "30", b: null },
        ]);
      });

      const names = async (query: string, headers: Record<string, string> = {}): Promise<unknown> => {
        const res = await get(`/items?select=name&order=id${query}`, headers);
        assertEquals(res.status, 200);
        return ((await jsonBody(res)) as { name: string }[]).map((r) => r.name);
      };

      await t.step("operators: eq/neq/gt/gte/lt/lte", async () => {
        assertEquals(await names("&id=eq.1"), ["apple"]);
        assertEquals(await names("&id=neq.1"), ["banana", "cherry"]);
        assertEquals(await names("&qty=gt.10"), ["cherry"]);
        assertEquals(await names("&qty=gte.10"), ["apple", "cherry"]);
        assertEquals(await names("&qty=lt.30"), ["apple"]);
        assertEquals(await names("&qty=lte.10"), ["apple"]);
      });

      await t.step("operators: like/ilike/match/imatch with * translation", async () => {
        assertEquals(await names("&name=like.*an*"), ["banana"]);
        assertEquals(await names("&name=ilike.A*"), ["apple"]);
        assertEquals(await names("&name=match.^b"), ["banana"]);
        assertEquals(await names("&name=imatch.^B"), ["banana"]);
      });

      await t.step("operators: in lists (incl. empty)", async () => {
        assertEquals(await names("&id=in.(1,3)"), ["apple", "cherry"]);
        assertEquals(await names("&id=in.()"), []);
        assertEquals(await names('&name=in.("apple",cherry)'), ["apple", "cherry"]);
      });

      await t.step("operators: is / isdistinct", async () => {
        assertEquals(await names("&qty=is.null"), ["banana"]);
        assertEquals(await names("&mood=is.null"), ["cherry"]);
        assertEquals(await names("&qty=isdistinct.10"), ["banana", "cherry"]);
        assertEquals(await names("&qty=not.is.null"), ["apple", "cherry"]);
      });

      await t.step("operators: array contains/contained/overlap", async () => {
        assertEquals(await names("&tags=cs.{red}"), ["apple", "cherry"]);
        assertEquals(await names("&tags=cd.{red,fruit,extra}"), ["apple", "cherry"]);
        assertEquals(await names("&tags=ov.{yellow,fruit}"), ["apple", "banana"]);
      });

      await t.step("operators: full text search", async () => {
        assertEquals(await names("&tsv=fts(english).apple"), ["apple"]);
        assertEquals(await names("&tsv=plfts.banana"), ["banana"]);
        assertEquals(await names("&tsv=phfts(english).cherry cake"), ["cherry"]);
        assertEquals(await names("&tsv=wfts.split"), ["banana"]);
      });

      await t.step("operators: quantified any/all", async () => {
        assertEquals(await names("&id=eq(any).{1,3}"), ["apple", "cherry"]);
        assertEquals(await names("&qty=gt(all).{5,9}"), ["apple", "cherry"]);
        assertEquals(await names("&name=like(any).{a*,b*}"), ["apple", "banana"]);
      });

      await t.step("operators: not and and/or logic trees", async () => {
        assertEquals(await names("&id=not.eq.2"), ["apple", "cherry"]);
        assertEquals(await names("&and=(qty.gte.10,or(name.eq.apple,name.eq.cherry))"), ["apple", "cherry"]);
        assertEquals(await names("&not.or=(id.eq.1,id.eq.2)"), ["cherry"]);
      });

      await t.step("operators: enum, domain and json-path filters", async () => {
        assertEquals(await names("&mood=eq.happy"), ["apple"]);
        assertEquals(await names("&code=eq.A1"), ["apple"]);
        assertEquals(await names("&data->a->>b=eq.2"), ["banana"]);
      });

      await t.step("order: direction and nulls", async () => {
        assertEquals(
          ((await jsonBody(await get("/items?select=name&order=qty.desc.nullsfirst"))) as { name: string }[]).map((r) => r.name),
          ["banana", "cherry", "apple"],
        );
        assertEquals(
          ((await jsonBody(await get("/items?select=name&order=qty.desc.nullslast"))) as { name: string }[]).map((r) => r.name),
          ["cherry", "apple", "banana"],
        );
      });

      await t.step("limit/offset + Content-Range", async () => {
        const res = await get("/items?select=name&order=id&limit=1&offset=1");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Range"), "1-1/*");
        assertEquals(await jsonBody(res), [{ name: "banana" }]);
      });

      await t.step("Range header selects a slice", async () => {
        const res = await get("/items?select=name&order=id", { Range: "1-2" });
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Range"), "1-2/*");
        assertEquals(await jsonBody(res), [{ name: "banana" }, { name: "cherry" }]);
      });

      await t.step("count=exact: 206 + total, Preference-Applied", async () => {
        const res = await get("/items?select=name&order=id&limit=2", { Prefer: "count=exact" });
        assertEquals(res.status, 206);
        assertEquals(res.headers.get("Content-Range"), "0-1/3");
        assertEquals(res.headers.get("Preference-Applied"), "count=exact");
        await res.body?.cancel();
        const full = await get("/items?select=name&order=id", { Prefer: "count=exact" });
        assertEquals(full.status, 200);
        assertEquals(full.headers.get("Content-Range"), "0-2/3");
        await full.body?.cancel();
      });

      await t.step("count=planned uses the EXPLAIN estimate", async () => {
        const res = await get("/items?select=name&order=id", { Prefer: "count=planned" });
        assertMatch(res.headers.get("Content-Range") ?? "", /^0-2\/\d+$/);
        await res.body?.cancel();
      });

      await t.step("count=exact out-of-range offset is 416 PGRST103", async () => {
        const res = await get("/items?select=name&offset=10", { Prefer: "count=exact" });
        assertEquals(res.status, 416);
        const body = (await jsonBody(res)) as { code: string; details: string };
        assertEquals(body.code, "PGRST103");
        assertEquals(body.details, "An offset of 10 was requested, but there are only 3 rows.");
      });

      await t.step("HEAD: no body, same headers", async () => {
        const res = await get("/items?select=name&order=id&limit=2", { Prefer: "count=exact" }, "HEAD");
        assertEquals(res.status, 206);
        assertEquals(res.headers.get("Content-Range"), "0-1/3");
        assertEquals(await res.text(), "");
      });

      await t.step("text/csv: exact body with header row", async () => {
        const res = await get("/items?select=id,name&order=id", { Accept: "text/csv" });
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
        assertEquals(await res.text(), "id,name\n1,apple\n2,banana\n3,cherry");
      });

      await t.step("vnd.pgrst.object: 200 on one row, 406 PGRST116 otherwise", async () => {
        const one = await get("/items?select=id,name&id=eq.1", { Accept: "application/vnd.pgrst.object+json" });
        assertEquals(one.status, 200);
        assertEquals(one.headers.get("Content-Type"), "application/vnd.pgrst.object+json; charset=utf-8");
        assertEquals(await jsonBody(one), { id: 1, name: "apple" });

        const none = await get("/items?id=eq.99", { Accept: "application/vnd.pgrst.object+json" });
        assertEquals(none.status, 406);
        const noneBody = (await jsonBody(none)) as { code: string; details: string };
        assertEquals(noneBody.code, "PGRST116");
        assertEquals(noneBody.details, "The result contains 0 rows");

        const many = await get("/items", { Accept: "application/vnd.pgrst.object+json" });
        assertEquals(many.status, 406);
        assertEquals(((await jsonBody(many)) as { details: string }).details, "The result contains 3 rows");
      });

      await t.step("vnd.pgrst.array+json behaves like json", async () => {
        const res = await get("/items?select=id&id=eq.1", { Accept: "application/vnd.pgrst.array+json" });
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), [{ id: 1 }]);
      });

      await t.step("unsupported Accept is 406 PGRST107", async () => {
        const res = await get("/items", { Accept: "text/xml" });
        assertEquals(res.status, 406);
        assertEquals(((await jsonBody(res)) as { code: string }).code, "PGRST107");
      });

      await t.step("unknown column passes through as 400 42703", async () => {
        const res = await get("/items?nope=eq.1");
        assertEquals(res.status, 400);
        const body = (await jsonBody(res)) as { code: string; message: string };
        assertEquals(body.code, "42703");
        assertStringIncludes(body.message, "nope");
      });

      await t.step("unknown table matches upstream: 404 with 42P01 passthrough", async () => {
        // Plan.hs readPlan does not validate the table against the schema
        // cache — the query runs and pg's undefined_table maps to 404.
        const res = await get("/nope_table");
        assertEquals(res.status, 404);
        const body = (await jsonBody(res)) as { code: string };
        assertEquals(body.code, "42P01");
      });

      await t.step("aggregates are refused while disabled (PGRST123)", async () => {
        const res = await get("/items?select=qty.sum()");
        assertEquals(res.status, 400);
        assertEquals(((await jsonBody(res)) as { code: string }).code, "PGRST123");
      });

      await t.step("embedding stubs: select relation 500, embed path PGRST108", async () => {
        const emb = await get("/items?select=*,foo(*)");
        assertEquals(emb.status, 500);
        assertEquals(((await jsonBody(emb)) as { code: string }).code, "PGRSTX00");
        const flt = await get("/items?foo.id=eq.1");
        assertEquals(flt.status, 400);
        assertEquals(((await jsonBody(flt)) as { code: string }).code, "PGRST108");
      });

      // ---- config variant groups -----------------------------------------

      await t.step("db-max-rows clamps silently; estimated count kicks in past it", async () => {
        await resetWithEnv({ PGRST_DB_MAX_ROWS: "2" });
        const res = await get("/items?select=name&order=id");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Range"), "0-1/*");
        assertEquals(await jsonBody(res), [{ name: "apple" }, { name: "banana" }]);

        const est = await get("/items?select=name&order=id", { Prefer: "count=estimated" });
        assertEquals(est.status, 206);
        assertEquals(est.headers.get("Content-Range"), "0-1/3");
        await est.body?.cancel();
      });

      await t.step("aggregates work when db-aggregates-enabled=true", async () => {
        await resetWithEnv({ PGRST_DB_AGGREGATES_ENABLED: "true" });
        const res = await get("/items?select=qty.sum()");
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), [{ sum: 40 }]);
        const grouped = await get("/items?select=mood,c:id.count()&mood=not.is.null&order=mood");
        assertEquals(await jsonBody(grouped), [{ mood: "happy", c: 1 }, { mood: "sad", c: 1 }]);
      });

      await t.step("response.headers GUC merges into the response", async () => {
        await resetWithEnv({ PGRST_DB_PRE_REQUEST: `${SCHEMA}.pre_ok` });
        const res = await get("/items?select=id&id=eq.1");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("X-Custom"), "hi");
        assertEquals(res.headers.get("Cache-Control"), "no-store");
        await res.body?.cancel();
      });

      await t.step("malformed response.headers GUC is 500 PGRST111", async () => {
        await resetWithEnv({ PGRST_DB_PRE_REQUEST: `${SCHEMA}.pre_bad_headers` });
        const res = await get("/items?select=id");
        assertEquals(res.status, 500);
        assertEquals(((await jsonBody(res)) as { code: string }).code, "PGRST111");
      });

      await t.step("response.status GUC overrides the status", async () => {
        await resetWithEnv({ PGRST_DB_PRE_REQUEST: `${SCHEMA}.pre_status` });
        const res = await get("/items?select=id&id=eq.1");
        assertEquals(res.status, 418);
        await res.body?.cancel();
      });
    } finally {
      await shutdownForTests();
      await closePoolForTests();
      resetConfigForTests();
      resetSchemaCacheStateForTests();
      for (const [k, v] of savedEnv) {
        if (v === undefined) Deno.env.delete(k);
        else Deno.env.set(k, v);
      }
      try {
        await admin.query(`drop schema if exists ${SCHEMA} cascade`);
        await admin.query(`drop role if exists ${ROLE}`);
      } finally {
        await admin.end();
      }
    }
  },
});
