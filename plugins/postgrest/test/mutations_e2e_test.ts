// End-to-end tests for the mutation pipeline (phase 6) — DB-gated on
// PGRST_DB_URI. Creates a throwaway schema + nologin anon role, drives
// handle(new Request(...)) for POST/PUT/PATCH/DELETE and drops everything in
// finally.

import { assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { Pool } from "pg";
import { handle, shutdownForTests } from "../functions/app.ts";
import { resetConfigForTests } from "../functions/config.ts";
import { closePoolForTests } from "../functions/db.ts";
import { resetSchemaCacheStateForTests } from "../functions/schema-cache/index.ts";

const dsn = Deno.env.get("PGRST_DB_URI");

const SCHEMA = "pgrsttest_mut";
const ROLE = "pgrsttest_mut_anon";

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
  // allow-override so Prefer: tx=rollback is honored
  Deno.env.set("PGRST_DB_TX_END", "commit-allow-override");
  for (const [k, v] of Object.entries(env)) Deno.env.set(k, v);
}

function req(
  method: string,
  pathAndQuery: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<Response> {
  const h = new Headers(headers);
  // the Fetch API defaults string bodies to text/plain; PostgREST's default
  // Content-Type is application/json
  if (body !== undefined && !h.has("content-type")) h.set("Content-Type", "application/json");
  return handle(new Request(`http://localhost/postgrest${pathAndQuery}`, { method, headers: h, body }));
}

async function jsonBody(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}

/** GET helper returning parsed rows. */
async function rows(pathAndQuery: string): Promise<unknown> {
  const res = await req("GET", pathAndQuery);
  assertEquals(res.status, 200);
  return await jsonBody(res);
}

const SETUP_SQL = `
  drop schema if exists ${SCHEMA} cascade;
  create schema ${SCHEMA};
  create table ${SCHEMA}.clients (id int primary key, name text);
  insert into ${SCHEMA}.clients values (1, 'Microsoft'), (2, 'Apple');
  create table ${SCHEMA}.items (
    id        int primary key,
    name      text,
    qty       int default 5,
    client_id int references ${SCHEMA}.clients(id)
  );
  insert into ${SCHEMA}.items values (1, 'one', 10, 1), (2, 'two', 20, 2);
  create table ${SCHEMA}.uniq (id bigint generated always as identity, ukey int unique, val text);
  insert into ${SCHEMA}.uniq (ukey, val) values (100, 'A');
  create table ${SCHEMA}.lim (id int primary key, val text);
  insert into ${SCHEMA}.lim values (1, 'a'), (2, 'b'), (3, 'c');
  create table ${SCHEMA}.dups (id int primary key, grp int);
  insert into ${SCHEMA}.dups values (1, 1), (2, 1), (3, 2);
  create table ${SCHEMA}.readonly_tbl (id int primary key);
  do $do$ begin create role ${ROLE} nologin; exception when duplicate_object then null; end $do$;
  grant usage on schema ${SCHEMA} to ${ROLE};
  grant select on all tables in schema ${SCHEMA} to ${ROLE};
  grant insert, update, delete on ${SCHEMA}.clients, ${SCHEMA}.items, ${SCHEMA}.uniq, ${SCHEMA}.lim, ${SCHEMA}.dups to ${ROLE};
  grant usage on all sequences in schema ${SCHEMA} to ${ROLE};
`;

Deno.test({
  name: "mutations e2e (phase 6)",
  ignore: !dsn,
  fn: async (t) => {
    const savedEnv = new Map(MANAGED_ENV.map((k) => [k, Deno.env.get(k)] as const));
    const admin = new Pool({ connectionString: dsn, max: 1 });
    try {
      await admin.query(SETUP_SQL);
      await resetWithEnv();

      await t.step("POST defaults to return=minimal: 201, no Location, Content-Range */*", async () => {
        const res = await req("POST", "/items", {}, '{"id":3,"name":"three","client_id":1}');
        assertEquals(res.status, 201);
        assertEquals(res.headers.get("Location"), null);
        assertEquals(res.headers.get("Content-Range"), "*/*");
        assertEquals(res.headers.get("Preference-Applied"), null);
        assertEquals(await res.text(), "");
        // the qty column default applied because the key was absent
        assertEquals(await rows("/items?id=eq.3&select=id,name,qty"), [{ id: 3, name: "three", qty: 5 }]);
      });

      await t.step("POST with return=headers-only sets the Location header", async () => {
        const res = await req("POST", "/items", { Prefer: "return=headers-only" }, '{"id":4,"name":"four","qty":1,"client_id":null}');
        assertEquals(res.status, 201);
        assertEquals(res.headers.get("Location"), "/items?id=eq.4");
        assertEquals(res.headers.get("Preference-Applied"), "return=headers-only");
        assertEquals(await res.text(), "");
      });

      await t.step("POST with return=representation runs the read pipeline (select + embed)", async () => {
        const res = await req(
          "POST",
          "/items?select=id,name,qty,clients(name)",
          { Prefer: "return=representation" },
          '{"id":5,"name":"five","client_id":2}',
        );
        assertEquals(res.status, 201);
        assertEquals(res.headers.get("Content-Type"), "application/json; charset=utf-8");
        assertEquals(res.headers.get("Preference-Applied"), "return=representation");
        assertEquals(await jsonBody(res), [{ id: 5, name: "five", qty: 5, clients: { name: "Apple" } }]);
      });

      await t.step("bulk POST with columns= and missing=default", async () => {
        const res = await req(
          "POST",
          "/items?columns=id,name,qty&select=id,qty",
          { Prefer: "missing=default, return=representation" },
          '[{"id":6,"name":"six","junk":"ignored"},{"id":7,"name":"seven","qty":9}]',
        );
        assertEquals(res.status, 201);
        assertEquals(res.headers.get("Preference-Applied"), "missing=default, return=representation");
        assertEquals(await jsonBody(res), [{ id: 6, qty: 5 }, { id: 7, qty: 9 }]);
      });

      await t.step("upsert merge-duplicates: 201 when it inserts, 200 when it only updates", async () => {
        const mixed = await req(
          "POST",
          "/items?select=id,name",
          { Prefer: "resolution=merge-duplicates, return=representation" },
          '[{"id":1,"name":"ONE","qty":10,"client_id":1},{"id":8,"name":"eight","qty":8,"client_id":null}]',
        );
        assertEquals(mixed.status, 201);
        assertEquals(mixed.headers.get("Preference-Applied"), "resolution=merge-duplicates, return=representation");
        assertEquals(await jsonBody(mixed), [{ id: 1, name: "ONE" }, { id: 8, name: "eight" }]);

        const updatesOnly = await req(
          "POST",
          "/items",
          { Prefer: "resolution=merge-duplicates" },
          '[{"id":1,"name":"one-again","qty":10,"client_id":1}]',
        );
        assertEquals(updatesOnly.status, 200);
        await updatesOnly.body?.cancel();
      });

      await t.step("upsert ignore-duplicates keeps existing rows and responds 201", async () => {
        const res = await req(
          "POST",
          "/items?select=id,name",
          { Prefer: "resolution=ignore-duplicates, return=representation" },
          '[{"id":1,"name":"nope","qty":1,"client_id":null},{"id":9,"name":"nine","qty":9,"client_id":null}]',
        );
        assertEquals(res.status, 201);
        assertEquals(res.headers.get("Preference-Applied"), "resolution=ignore-duplicates, return=representation");
        assertEquals(await jsonBody(res), [{ id: 9, name: "nine" }]);
        assertEquals(await rows("/items?id=eq.1&select=name"), [{ name: "one-again" }]);
      });

      await t.step("upsert on a unique key via ?on_conflict=", async () => {
        const res = await req(
          "POST",
          "/uniq?on_conflict=ukey&select=ukey,val",
          { Prefer: "resolution=merge-duplicates, return=representation" },
          '[{"ukey":100,"val":"B"},{"ukey":200,"val":"C"}]',
        );
        assertEquals(res.status, 201);
        assertStringIncludes(res.headers.get("Preference-Applied") ?? "", "resolution=merge-duplicates");
        const body = (await jsonBody(res)) as { ukey: number; val: string }[];
        assertEquals(body.toSorted((a, b) => a.ukey - b.ukey), [{ ukey: 100, val: "B" }, { ukey: 200, val: "C" }]);
      });

      await t.step("PUT updates an existing row (204 by default, no Content-Range)", async () => {
        const res = await req("PUT", "/items?id=eq.2", {}, '{"id":2,"name":"TWO","qty":22,"client_id":2}');
        assertEquals(res.status, 204);
        assertEquals(res.headers.get("Content-Range"), null);
        assertEquals(await res.text(), "");
        assertEquals(await rows("/items?id=eq.2&select=name,qty"), [{ name: "TWO", qty: 22 }]);
      });

      await t.step("PUT with return=representation: 201 on insert, 200 on update", async () => {
        const ins = await req(
          "PUT",
          "/items?id=eq.50",
          { Prefer: "return=representation" },
          '{"id":50,"name":"fifty","qty":1,"client_id":null}',
        );
        assertEquals(ins.status, 201);
        assertEquals((await jsonBody(ins) as { id: number }[])[0].id, 50);

        const upd = await req(
          "PUT",
          "/items?id=eq.50",
          { Prefer: "return=representation" },
          '{"id":50,"name":"FIFTY","qty":2,"client_id":null}',
        );
        assertEquals(upd.status, 200);
        assertEquals((await jsonBody(upd) as { name: string }[])[0].name, "FIFTY");
      });

      await t.step("PUT payload pk must match the URL (PGRST115, rolled back)", async () => {
        const res = await req("PUT", "/items?id=eq.2", {}, '{"id":999,"name":"x","qty":0,"client_id":null}');
        assertEquals(res.status, 400);
        assertEquals(((await jsonBody(res)) as { code: string }).code, "PGRST115");
        assertEquals(await rows("/items?id=eq.2&select=name"), [{ name: "TWO" }]);
        assertEquals(await rows("/items?id=eq.999"), []);
      });

      await t.step("PUT requires eq filters on exactly the pk (PGRST105) and no limit (PGRST114)", async () => {
        const nonPk = await req("PUT", "/items?name=eq.TWO", {}, '{"id":2,"name":"TWO"}');
        assertEquals(nonPk.status, 405);
        assertEquals(((await jsonBody(nonPk)) as { code: string }).code, "PGRST105");

        const lim = await req("PUT", "/items?id=eq.2&limit=1", {}, '{"id":2,"name":"TWO"}');
        assertEquals(lim.status, 400);
        assertEquals(((await jsonBody(lim)) as { code: string }).code, "PGRST114");
      });

      await t.step("PATCH: 204 + Content-Range 0-0/* by default, 200 with representation", async () => {
        const res = await req("PATCH", "/items?id=eq.3", {}, '{"name":"three!"}');
        assertEquals(res.status, 204);
        assertEquals(res.headers.get("Content-Range"), "0-0/*");
        assertEquals(await res.text(), "");

        const rep = await req(
          "PATCH",
          "/items?id=eq.3&select=id,name",
          { Prefer: "return=representation" },
          '{"name":"3"}',
        );
        assertEquals(rep.status, 200);
        assertEquals(await jsonBody(rep), [{ id: 3, name: "3" }]);
      });

      await t.step("PATCH with an empty object body is a no-op (WHERE false)", async () => {
        const res = await req("PATCH", "/items?id=eq.3", {}, "{}");
        assertEquals(res.status, 204);
        assertEquals(res.headers.get("Content-Range"), "*/*");
      });

      await t.step("limited PATCH updates only the ordered slice", async () => {
        const res = await req("PATCH", "/lim?order=id&limit=2", {}, '{"val":"z"}');
        assertEquals(res.status, 204);
        assertEquals(await rows("/lim?order=id&select=val"), [{ val: "z" }, { val: "z" }, { val: "c" }]);
      });

      await t.step("limited PATCH without order is PGRST109", async () => {
        const res = await req("PATCH", "/lim?limit=2", {}, '{"val":"y"}');
        assertEquals(res.status, 400);
        assertEquals(((await jsonBody(res)) as { code: string }).code, "PGRST109");
      });

      await t.step("limited PATCH exceeding the limit is PGRST110 and rolls back", async () => {
        // ordering by a non-unique column makes the key-match update 2 rows with limit=1
        const res = await req("PATCH", "/dups?grp=eq.1&order=grp&limit=1", {}, '{"grp":5}');
        assertEquals(res.status, 400);
        assertEquals(((await jsonBody(res)) as { code: string }).code, "PGRST110");
        assertEquals(await rows("/dups?grp=eq.1&select=id&order=id"), [{ id: 1 }, { id: 2 }]);
      });

      await t.step("max-affected enforced under handling=strict (PGRST124, rolled back)", async () => {
        const bad = await req("PATCH", "/dups?grp=eq.1", { Prefer: "handling=strict, max-affected=1" }, '{"grp":9}');
        assertEquals(bad.status, 400);
        assertEquals(((await jsonBody(bad)) as { code: string }).code, "PGRST124");
        assertEquals(await rows("/dups?grp=eq.1&select=id&order=id"), [{ id: 1 }, { id: 2 }]);

        const ok = await req("PATCH", "/dups?grp=eq.1", { Prefer: "handling=strict, max-affected=5" }, '{"grp":1}');
        assertEquals(ok.status, 204);
        assertStringIncludes(ok.headers.get("Preference-Applied") ?? "", "max-affected=1".replace("1", "5"));

        // without strict handling the preference is not enforced
        const lenient = await req("PATCH", "/dups?grp=eq.1", { Prefer: "max-affected=1" }, '{"grp":1}');
        assertEquals(lenient.status, 204);
      });

      await t.step("handling=strict rejects invalid preferences (PGRST122)", async () => {
        const res = await req("PATCH", "/items?id=eq.3", { Prefer: "handling=strict, anything=else" }, '{"name":"x"}');
        assertEquals(res.status, 400);
        const body = (await jsonBody(res)) as { code: string; details: string };
        assertEquals(body.code, "PGRST122");
        assertEquals(body.details, "Invalid preferences: anything=else");
      });

      await t.step("DELETE: 204 + Content-Range */*, count=exact totals, representation", async () => {
        const res = await req("DELETE", "/items?id=eq.9");
        assertEquals(res.status, 204);
        assertEquals(res.headers.get("Content-Range"), "*/*");
        assertEquals(await rows("/items?id=eq.9"), []);

        const counted = await req("DELETE", "/items?id=eq.8", { Prefer: "count=exact" });
        assertEquals(counted.status, 204);
        assertEquals(counted.headers.get("Content-Range"), "*/1");
        assertEquals(counted.headers.get("Preference-Applied"), "count=exact");

        const rep = await req("DELETE", "/items?id=eq.50&select=id,name", { Prefer: "return=representation" });
        assertEquals(rep.status, 200);
        assertEquals(await jsonBody(rep), [{ id: 50, name: "FIFTY" }]);
      });

      await t.step("limited DELETE removes only the ordered slice", async () => {
        const res = await req("DELETE", "/lim?order=id&limit=1");
        assertEquals(res.status, 204);
        assertEquals(await rows("/lim?select=id&order=id"), [{ id: 2 }, { id: 3 }]);
      });

      await t.step("Prefer: tx=rollback leaves no rows behind", async () => {
        const res = await req("POST", "/items", { Prefer: "tx=rollback" }, '{"id":60,"name":"gone","qty":0,"client_id":null}');
        assertEquals(res.status, 201);
        assertEquals(res.headers.get("Preference-Applied"), "tx=rollback");
        assertEquals(await rows("/items?id=eq.60"), []);
      });

      await t.step("singular mutation on many rows is 406 and rolls back", async () => {
        const res = await req(
          "PATCH",
          "/items?id=gt.0",
          { Accept: "application/vnd.pgrst.object+json" },
          '{"name":"nope"}',
        );
        assertEquals(res.status, 406);
        const body = (await jsonBody(res)) as { code: string; details: string };
        assertEquals(body.code, "PGRST116");
        assertStringIncludes(body.details, "rows");
        // the update was rolled back — no row was renamed
        assertEquals(await rows("/items?name=eq.nope"), []);
      });

      await t.step("anon role without INSERT grant maps to 401 (42501)", async () => {
        const res = await req("POST", "/readonly_tbl", {}, '{"id":1}');
        assertEquals(res.status, 401);
        assertEquals(res.headers.get("WWW-Authenticate"), "Bearer");
        assertEquals(((await jsonBody(res)) as { code: string }).code, "42501");
        assertEquals(await rows("/readonly_tbl"), []);
      });

      await t.step("csv body insert", async () => {
        const res = await req(
          "POST",
          "/items?select=id,name,client_id",
          { "Content-Type": "text/csv", Prefer: "return=representation" },
          "id,name,client_id\n70,csv1,NULL",
        );
        assertEquals(res.status, 201);
        assertEquals(await jsonBody(res), [{ id: 70, name: "csv1", client_id: null }]);
      });

      await t.step("x-www-form-urlencoded body insert", async () => {
        const res = await req(
          "POST",
          "/items",
          { "Content-Type": "application/x-www-form-urlencoded" },
          "id=71&name=url+enc",
        );
        assertEquals(res.status, 201);
        assertEquals(await rows("/items?id=eq.71&select=name"), [{ name: "url enc" }]);
      });

      await t.step("unacceptable Content-Type on a mutation is PGRST102", async () => {
        const res = await req("POST", "/items", { "Content-Type": "text/plain" }, "raw");
        assertEquals(res.status, 400);
        const body = (await jsonBody(res)) as { code: string; message: string };
        assertEquals(body.code, "PGRST102");
        assertEquals(body.message, "Content-Type not acceptable: text/plain");
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
