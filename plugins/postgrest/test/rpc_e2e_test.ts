// End-to-end tests for the RPC pipeline (phase 7) — DB-gated on
// PGRST_DB_URI. Creates a throwaway schema + nologin anon role, drives
// handle(new Request(...)) for GET/HEAD/POST /rpc/fn and drops everything in
// finally.

import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { Pool } from "pg";
import { handle, shutdownForTests } from "../functions/app.ts";
import { resetConfigForTests } from "../functions/config.ts";
import { closePoolForTests } from "../functions/db.ts";
import { resetSchemaCacheStateForTests } from "../functions/schema-cache/index.ts";

const dsn = Deno.env.get("PGRST_DB_URI");

const SCHEMA = "pgrsttest_rpc";
const ROLE = "pgrsttest_rpc_anon";

const MANAGED_ENV = [
  "PGRST_DB_SCHEMAS",
  "PGRST_DB_ANON_ROLE",
  "PGRST_DB_CHANNEL_ENABLED",
  "PGRST_DB_TX_END",
  "PGRST_JWT_SECRET",
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
  create table ${SCHEMA}.clients (id int primary key, name text);
  insert into ${SCHEMA}.clients values (1, 'Acme'), (2, 'Umbrella');
  create table ${SCHEMA}.items (id int primary key, name text, client_id int references ${SCHEMA}.clients(id));
  insert into ${SCHEMA}.items values (1, 'apple', 1), (2, 'banana', 1), (3, 'cherry', 2);

  -- table-returning (embeddable via the items->clients FK), with a default arg
  create function ${SCHEMA}.getitems(min_id int default 0) returns setof ${SCHEMA}.items
    stable language sql as $$ select * from ${SCHEMA}.items where id >= min_id $$;
  -- setof scalar
  create function ${SCHEMA}.getnames() returns setof text
    stable language sql as $$ select name from ${SCHEMA}.items order by id $$;
  -- scalar int
  create function ${SCHEMA}.add_them(a int, b int) returns int
    immutable language sql as $$ select a + b $$;
  -- scalar json
  create function ${SCHEMA}.get_json() returns json
    stable language sql as $$ select json_build_object('k', 1) $$;
  -- volatile insert
  create function ${SCHEMA}.ins_item(id int, name text) returns setof ${SCHEMA}.items
    volatile language sql as $$ insert into ${SCHEMA}.items values (id, name, null) returning * $$;
  -- stable function observing the transaction mode
  create function ${SCHEMA}.is_readonly() returns text
    stable language sql as $$ select current_setting('transaction_read_only') $$;
  -- overloaded pair (ambiguous for argument key {a})
  create function ${SCHEMA}.overl(a int) returns int immutable language sql as $$ select a $$;
  create function ${SCHEMA}.overl(a text) returns text immutable language sql as $$ select a $$;
  -- variadic
  create function ${SCHEMA}.vconcat(variadic v text[]) returns text
    immutable language sql as $$ select array_to_string(v, ',') $$;
  -- single unnamed json / text params
  create function ${SCHEMA}.jecho(json) returns json immutable language sql as $$ select $1 $$;
  create function ${SCHEMA}.techo(text) returns text immutable language sql as $$ select $1 $$;
  -- named single json param for Prefer: params=single-object
  create function ${SCHEMA}.sobj(payload json) returns text
    immutable language sql as $$ select payload->>'x' $$;
  -- request.jwt.claims / request.headers GUCs
  create function ${SCHEMA}.whoami() returns text
    stable language sql as $$ select current_setting('request.jwt.claims', true)::json->>'role' $$;
  create function ${SCHEMA}.get_header(name text) returns text
    stable language sql as $$ select current_setting('request.headers', true)::json->>name $$;
  -- proconfig SET statement_timeout: hoisted to the tx, cancels the sleep
  create function ${SCHEMA}.sleepy() returns void
    volatile language sql set statement_timeout = '50ms' as $$ select pg_sleep(1) $$;
  -- proconfig default_transaction_isolation drives the BEGIN isolation level
  create function ${SCHEMA}.iso_lvl() returns text
    stable language sql set default_transaction_isolation = 'serializable'
    as $$ select current_setting('transaction_isolation') $$;
  -- void
  create function ${SCHEMA}.noop() returns void volatile language plpgsql as $$ begin null; end $$;
  -- RAISE with a custom PGRST error for full response control
  create function ${SCHEMA}.forbidden() returns void volatile language plpgsql as $$
    begin
      raise sqlstate 'PGRST' using
        message = '{"code":"P0042","message":"custom error","details":"deets","hint":"hinty"}',
        detail  = '{"status":403,"headers":{"X-Custom":"val"}}';
    end $$;

  do $do$ begin create role ${ROLE} nologin; exception when duplicate_object then null; end $do$;
  grant usage on schema ${SCHEMA} to ${ROLE};
  grant select on all tables in schema ${SCHEMA} to ${ROLE};
  grant insert on ${SCHEMA}.items to ${ROLE};
  grant execute on all functions in schema ${SCHEMA} to ${ROLE};
`;

Deno.test({
  name: "rpc e2e (phase 7)",
  ignore: !dsn,
  fn: async (t) => {
    const savedEnv = new Map(MANAGED_ENV.map((k) => [k, Deno.env.get(k)] as const));
    const admin = new Pool({ connectionString: dsn, max: 1 });
    try {
      await admin.query(SETUP_SQL);
      await resetWithEnv();

      await t.step("POST scalar function with json args", async () => {
        const res = await req("POST", "/rpc/add_them", {}, '{"a":2,"b":3}');
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "application/json; charset=utf-8");
        // funcReturnsSingle → page_total = 1
        assertEquals(res.headers.get("Content-Range"), "0-0/*");
        assertEquals(await res.text(), "5");
      });

      await t.step("GET scalar function with query-string args", async () => {
        const res = await req("GET", "/rpc/add_them?a=2&b=3");
        assertEquals(res.status, 200);
        assertEquals(await res.text(), "5");
      });

      await t.step("scalar json function returns the json value", async () => {
        const res = await req("GET", "/rpc/get_json");
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), { k: 1 });
      });

      await t.step("setof scalar aggregates into a json array", async () => {
        const res = await req("GET", "/rpc/getnames");
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), ["apple", "banana", "cherry"]);
      });

      await t.step("table-returning function: all rows, default arg", async () => {
        const res = await req("GET", "/rpc/getitems?order=id");
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), [
          { id: 1, name: "apple", client_id: 1 },
          { id: 2, name: "banana", client_id: 1 },
          { id: 3, name: "cherry", client_id: 2 },
        ]);
      });

      await t.step("table-returning function: arg from the query string", async () => {
        const res = await req("GET", "/rpc/getitems?min_id=2&order=id");
        assertEquals(await jsonBody(res), [
          { id: 2, name: "banana", client_id: 1 },
          { id: 3, name: "cherry", client_id: 2 },
        ]);
      });

      await t.step("read pipeline over the call: select/filter/order/embed", async () => {
        const res = await req("GET", "/rpc/getitems?select=id,name,clients(name)&id=gt.1&order=id.desc");
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), [
          { id: 3, name: "cherry", clients: { name: "Umbrella" } },
          { id: 2, name: "banana", clients: { name: "Acme" } },
        ]);
      });

      await t.step("count=exact + limit produce a ranged 206 response", async () => {
        const res = await req("GET", "/rpc/getitems?limit=2&order=id", { Prefer: "count=exact" });
        assertEquals(res.status, 206);
        assertEquals(res.headers.get("Content-Range"), "0-1/3");
        assertEquals(res.headers.get("Preference-Applied"), "count=exact");
      });

      await t.step("singular object accept on rpc results", async () => {
        const one = await req("GET", "/rpc/getitems?id=eq.1", { Accept: "application/vnd.pgrst.object+json" });
        assertEquals(one.status, 200);
        assertEquals(await jsonBody(one), { id: 1, name: "apple", client_id: 1 });
        const many = await req("GET", "/rpc/getitems", { Accept: "application/vnd.pgrst.object+json" });
        assertEquals(many.status, 406);
        assertEquals((await jsonBody(many) as { code: string }).code, "PGRST116");
      });

      await t.step("csv output of table results", async () => {
        const res = await req("GET", "/rpc/getitems?select=id,name&order=id", { Accept: "text/csv" });
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
        assertEquals(await res.text(), "id,name\n1,apple\n2,banana\n3,cherry");
      });

      await t.step("csv output of a scalar uses the pgrst_scalar wrapper column", async () => {
        const res = await req("GET", "/rpc/add_them?a=1&b=2", { Accept: "text/csv" });
        assertEquals(res.status, 200);
        assertEquals(await res.text(), "pgrst_scalar\n3");
      });

      await t.step("unacceptable accept type is a 406 PGRST107", async () => {
        const res = await req("GET", "/rpc/add_them?a=1&b=2", { Accept: "text/html" });
        assertEquals(res.status, 406);
        assertEquals((await jsonBody(res) as { code: string }).code, "PGRST107");
      });

      await t.step("HEAD /rpc: headers only, no body", async () => {
        const res = await req("HEAD", "/rpc/getitems");
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "application/json; charset=utf-8");
        assertEquals(await res.text(), "");
      });

      await t.step("variadic args: repeated GET keys collect in order (incl. quoting)", async () => {
        assertEquals(await (await req("GET", "/rpc/vconcat?v=a&v=b&v=c")).text(), '"a,b,c"');
        assertEquals(await (await req("GET", "/rpc/vconcat?v=x")).text(), '"x"');
        assertEquals(await (await req("GET", "/rpc/vconcat?v=hello%20world&v=b")).text(), '"hello world,b"');
      });

      await t.step("single unnamed json param echoes the raw body", async () => {
        const res = await req("POST", "/rpc/jecho", {}, '{"a":[1,2],"b":null}');
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), { a: [1, 2], b: null });
      });

      await t.step("single unnamed text param takes a text/plain body", async () => {
        const res = await req("POST", "/rpc/techo", { "Content-Type": "text/plain" }, "hello world");
        assertEquals(res.status, 200);
        assertEquals(await res.text(), '"hello world"');
      });

      await t.step("Prefer: params=single-object passes the body as one json argument", async () => {
        const res = await req("POST", "/rpc/sobj", { Prefer: "params=single-object" }, '{"x":"hi","y":1}');
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Preference-Applied"), "params=single-object");
        assertEquals(await res.text(), '"hi"');
      });

      await t.step("volatile insert via POST commits", async () => {
        const res = await req("POST", "/rpc/ins_item", {}, '{"id":9,"name":"nine"}');
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), [{ id: 9, name: "nine", client_id: null }]);
        const check = await req("GET", "/items?id=eq.9&select=id,name");
        assertEquals(await jsonBody(check), [{ id: 9, name: "nine" }]);
      });

      await t.step("volatile function via GET runs read-only: 25006 → 405", async () => {
        const res = await req("GET", "/rpc/ins_item?id=10&name=ten");
        assertEquals(res.status, 405);
        assertEquals((await jsonBody(res) as { code: string }).code, "25006");
        // nothing was inserted
        const check = await req("GET", "/items?id=eq.10");
        assertEquals(await jsonBody(check), []);
      });

      await t.step("POST of a stable function also runs in a read-only tx", async () => {
        assertEquals(await (await req("POST", "/rpc/is_readonly", {}, "{}")).text(), '"on"');
        assertEquals(await (await req("GET", "/rpc/is_readonly")).text(), '"on"');
      });

      await t.step("request.jwt.claims / request.headers GUCs reach the function", async () => {
        assertEquals(await (await req("GET", "/rpc/whoami")).text(), `"${ROLE}"`);
        const res = await req("GET", "/rpc/get_header?name=x-special", { "X-Special": "abc" });
        assertEquals(await res.text(), '"abc"');
      });

      await t.step("proconfig statement_timeout is hoisted to the transaction", async () => {
        const res = await req("POST", "/rpc/sleepy", {}, "{}");
        assertEquals(res.status, 500);
        // 57014 query_canceled proves the timeout applied before the call
        assertEquals((await jsonBody(res) as { code: string }).code, "57014");
      });

      await t.step("proconfig default_transaction_isolation sets the BEGIN isolation level", async () => {
        const res = await req("GET", "/rpc/iso_lvl");
        assertEquals(res.status, 200);
        assertEquals(await res.text(), '"serializable"');
      });

      await t.step("void functions respond 204 with no body", async () => {
        const res = await req("POST", "/rpc/noop", {}, "{}");
        assertEquals(res.status, 204);
        assertEquals(await res.text(), "");
      });

      await t.step("RAISE SQLSTATE 'PGRST' gives full response control", async () => {
        const res = await req("POST", "/rpc/forbidden", {}, "{}");
        assertEquals(res.status, 403);
        assertEquals(res.headers.get("X-Custom"), "val");
        assertEquals(await jsonBody(res), { code: "P0042", message: "custom error", details: "deets", hint: "hinty" });
      });

      await t.step("unknown function is a 404 PGRST202 with a fuzzy hint", async () => {
        const res = await req("GET", "/rpc/getitemz");
        assertEquals(res.status, 404);
        const body = await jsonBody(res) as Record<string, unknown>;
        assertEquals(body.code, "PGRST202");
        assertEquals(body.message, `Could not find the function ${SCHEMA}.getitemz without parameters in the schema cache`);
        assertEquals(body.hint, `Perhaps you meant to call the function ${SCHEMA}.getitems`);
      });

      await t.step("wrong argument keys suggest the overload's parameter list", async () => {
        const res = await req("GET", "/rpc/add_them?a=1");
        assertEquals(res.status, 404);
        const body = await jsonBody(res) as Record<string, unknown>;
        assertEquals(body.code, "PGRST202");
        assertEquals(body.hint, `Perhaps you meant to call the function ${SCHEMA}.add_them(a, b)`);
      });

      await t.step("ambiguous overloads are a 300 PGRST203", async () => {
        const res = await req("POST", "/rpc/overl", {}, '{"a":1}');
        assertEquals(res.status, 300);
        const body = await jsonBody(res) as Record<string, unknown>;
        assertEquals(body.code, "PGRST203");
        assertStringIncludes(body.message as string, `${SCHEMA}.overl(a => integer), ${SCHEMA}.overl(a => text)`);
      });

      await t.step("PATCH /rpc is a 405 PGRST101", async () => {
        const res = await req("PATCH", "/rpc/add_them", {}, '{"a":1,"b":2}');
        assertEquals(res.status, 405);
        const body = await jsonBody(res) as Record<string, unknown>;
        assertEquals(body.code, "PGRST101");
        assertEquals(body.message, "Cannot use the PATCH method on RPC");
      });

      await t.step("Prefer: tx=rollback discards the rpc write", async () => {
        await resetWithEnv({ PGRST_DB_TX_END: "commit-allow-override" });
        const res = await req("POST", "/rpc/ins_item", { Prefer: "tx=rollback" }, '{"id":11,"name":"gone"}');
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), [{ id: 11, name: "gone", client_id: null }]);
        const check = await req("GET", "/items?id=eq.11");
        assertEquals(await jsonBody(check), []);
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
      await admin.query(`drop schema if exists ${SCHEMA} cascade`);
      await admin.query(`drop role if exists ${ROLE}`);
      await admin.end();
    }
  },
});
