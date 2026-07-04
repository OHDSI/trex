// End-to-end tests for resource embedding (phase 5) — DB-gated on
// PGRST_DB_URI. Creates a throwaway schema (clients/projects/tasks, an M2M
// users/users_projects junction, a self-referencing staff table, a computed
// relationship function, a view over projects and an ambiguous orders →
// addresses pair), drives handle(new Request(...)) and drops everything in
// finally.

import { assertEquals } from "std/assert/mod.ts";
import { Pool } from "pg";
import { handle, shutdownForTests } from "../functions/app.ts";
import { resetConfigForTests } from "../functions/config.ts";
import { closePoolForTests } from "../functions/db.ts";
import { resetSchemaCacheStateForTests } from "../functions/schema-cache/index.ts";

const dsn = Deno.env.get("PGRST_DB_URI");

const SCHEMA = "pgrsttest_embed";
const ROLE = "pgrsttest_embed_anon";

const MANAGED_ENV = [
  "PGRST_DB_SCHEMAS",
  "PGRST_DB_ANON_ROLE",
  "PGRST_DB_CHANNEL_ENABLED",
  "PGRST_DB_AGGREGATES_ENABLED",
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

function get(pathAndQuery: string, headers: Record<string, string> = {}): Promise<Response> {
  return handle(new Request(`http://localhost/postgrest${pathAndQuery}`, { headers }));
}

async function jsonBody(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}

const SETUP_SQL = `
  drop schema if exists ${SCHEMA} cascade;
  create schema ${SCHEMA};
  set local search_path to ${SCHEMA};
  create table clients (id int primary key, name text);
  create table projects (id int primary key, name text, budget int, client_id int references clients(id));
  create table tasks (id int primary key, name text, hours int, project_id int references projects(id));
  create table users (id int primary key, name text);
  create table users_projects (
    user_id int references users(id),
    project_id int references projects(id),
    primary key (user_id, project_id)
  );
  create table staff (id int primary key, name text, boss_id int references staff(id));
  create table addresses (id int primary key, city text);
  create table orders (
    id int primary key,
    name text,
    billing_address_id int references addresses(id),
    shipping_address_id int references addresses(id)
  );
  create view projects_view as select * from projects;
  create function client_of(projects) returns setof clients rows 1 language sql stable as
    $$ select * from ${SCHEMA}.clients where id = $1.client_id $$;

  insert into clients values (1, 'client 1'), (2, 'client 2'), (3, 'client 3');
  insert into projects values
    (1, 'p1', 100, 1), (2, 'p2', 200, 1), (3, 'p3', 300, 2), (4, 'p4', 400, null);
  insert into tasks values
    (1, 't1', 5, 1), (2, 't2', 6, 1), (3, 't3', 7, 2), (4, 't4', 8, 3);
  insert into users values (1, 'u1'), (2, 'u2');
  insert into users_projects values (1, 1), (1, 2), (2, 3);
  insert into staff values (1, 'boss', null), (2, 'emp a', 1), (3, 'emp b', 1);
  insert into addresses values (1, 'berlin'), (2, 'paris');
  insert into orders values (1, 'o1', 1, 2);

  do $do$ begin create role ${ROLE} nologin; exception when duplicate_object then null; end $do$;
  grant usage on schema ${SCHEMA} to ${ROLE};
  grant select on all tables in schema ${SCHEMA} to ${ROLE};
  grant execute on all functions in schema ${SCHEMA} to ${ROLE};
`;

Deno.test({
  name: "embed e2e (phase 5)",
  ignore: !dsn,
  fn: async (t) => {
    const savedEnv = new Map(MANAGED_ENV.map((k) => [k, Deno.env.get(k)] as const));
    const admin = new Pool({ connectionString: dsn, max: 1 });
    try {
      await admin.query(SETUP_SQL);
      await resetWithEnv();

      await t.step("to-one embed: object (or null) under the relation key", async () => {
        const res = await get("/projects?select=id,name,clients(name)&order=id");
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), [
          { id: 1, name: "p1", clients: { name: "client 1" } },
          { id: 2, name: "p2", clients: { name: "client 1" } },
          { id: 3, name: "p3", clients: { name: "client 2" } },
          { id: 4, name: "p4", clients: null },
        ]);
      });

      await t.step("to-many embed: array under the relation key, [] when empty", async () => {
        const res = await get("/clients?select=name,projects(name)&order=id&projects.order=id");
        assertEquals(await jsonBody(res), [
          { name: "client 1", projects: [{ name: "p1" }, { name: "p2" }] },
          { name: "client 2", projects: [{ name: "p3" }] },
          { name: "client 3", projects: [] },
        ]);
      });

      await t.step("embed aliasing renames the key and routes embed params", async () => {
        const res = await get("/projects?select=id,the_client:clients(name)&id=eq.1");
        assertEquals(await jsonBody(res), [{ id: 1, the_client: { name: "client 1" } }]);
        const aliased = await get("/clients?select=name,ps:projects(id,name)&ps.order=id.desc&ps.limit=1&id=eq.1");
        assertEquals(await jsonBody(aliased), [{ name: "client 1", ps: [{ id: 2, name: "p2" }] }]);
      });

      await t.step("nested embedding, three levels deep", async () => {
        const res = await get(
          "/clients?select=name,projects(name,tasks(name))&id=eq.1&projects.order=id&projects.tasks.order=id",
        );
        assertEquals(await jsonBody(res), [
          {
            name: "client 1",
            projects: [
              { name: "p1", tasks: [{ name: "t1" }, { name: "t2" }] },
              { name: "p2", tasks: [{ name: "t3" }] },
            ],
          },
        ]);
      });

      await t.step("!inner filters parents; !left keeps them", async () => {
        const inner = await get("/clients?select=name,projects!inner(name)&order=id&projects.order=id");
        assertEquals(await jsonBody(inner), [
          { name: "client 1", projects: [{ name: "p1" }, { name: "p2" }] },
          { name: "client 2", projects: [{ name: "p3" }] },
        ]);
        const left = await get("/clients?select=name,projects!left(name)&order=id&projects.order=id");
        assertEquals(((await jsonBody(left)) as unknown[]).length, 3);
        // !inner + embed filter also filters the parents
        const filtered = await get("/clients?select=name,projects!inner(name)&projects.name=eq.p3&order=id");
        assertEquals(await jsonBody(filtered), [{ name: "client 2", projects: [{ name: "p3" }] }]);
      });

      await t.step("count=exact with !inner: Content-Range counts the filtered parents", async () => {
        const res = await get("/clients?select=name,projects!inner(name)&order=id&projects.order=id", {
          Prefer: "count=exact",
        });
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Range"), "0-1/2");
        await res.body?.cancel();
      });

      await t.step("emb=is.null / emb=not.is.null filter by embed presence", async () => {
        const isNull = await get("/clients?select=name,projects(name)&projects=is.null");
        assertEquals(await jsonBody(isNull), [{ name: "client 3", projects: [] }]);
        const notNull = await get("/clients?select=name,projects(name)&projects=not.is.null&order=id&projects.order=id");
        assertEquals(
          ((await jsonBody(notNull)) as { name: string }[]).map((r) => r.name),
          ["client 1", "client 2"],
        );
        // count queries flip the null-embed filters into (NOT) EXISTS
        const counted = await get("/clients?select=name,projects(name)&projects=is.null", { Prefer: "count=exact" });
        assertEquals(counted.headers.get("Content-Range"), "0-0/1");
        await counted.body?.cancel();
      });

      await t.step("empty embed with a null filter omits the key (#3093)", async () => {
        const res = await get("/clients?select=name,projects()&projects=is.null");
        assertEquals(await jsonBody(res), [{ name: "client 3" }]);
      });

      await t.step("per-embed select/filter/order/limit/offset", async () => {
        const res = await get(
          "/clients?select=name,projects(id,name)&id=eq.1&projects.order=id.desc&projects.limit=1&projects.offset=1",
        );
        assertEquals(await jsonBody(res), [{ name: "client 1", projects: [{ id: 1, name: "p1" }] }]);
        const filtered = await get("/clients?select=name,projects(name)&id=eq.1&projects.name=eq.p2");
        assertEquals(await jsonBody(filtered), [{ name: "client 1", projects: [{ name: "p2" }] }]);
        // filters on embeds don't filter the parent (unlike !inner)
        const unfiltered = await get("/clients?select=name,projects(name)&projects.name=eq.p3&order=id");
        assertEquals(await jsonBody(unfiltered), [
          { name: "client 1", projects: [] },
          { name: "client 2", projects: [{ name: "p3" }] },
          { name: "client 3", projects: [] },
        ]);
      });

      await t.step("order=emb(col) works both directions on to-one embeds", async () => {
        const desc = await get("/projects?select=id,clients(name)&order=clients(name).desc.nullslast,id");
        assertEquals(
          ((await jsonBody(desc)) as { id: number }[]).map((r) => r.id),
          [3, 1, 2, 4],
        );
        const asc = await get("/projects?select=id,clients(name)&order=clients(name).asc.nullsfirst,id");
        assertEquals(
          ((await jsonBody(asc)) as { id: number }[]).map((r) => r.id),
          [4, 1, 2, 3],
        );
      });

      await t.step("order=emb(col) on a to-many embed is PGRST118", async () => {
        const res = await get("/clients?select=name,projects(id)&order=projects(id)");
        assertEquals(res.status, 400);
        const body = (await jsonBody(res)) as { code: string; message: string; details: string };
        assertEquals(body.code, "PGRST118");
        assertEquals(body.message, "A related order on 'projects' is not possible");
        assertEquals(body.details, "'clients' and 'projects' do not form a many-to-one or one-to-one relationship");
      });

      await t.step("spread embed flattens to-one columns into the parent", async () => {
        const res = await get("/projects?select=name,...clients(client_name:name)&id=eq.1");
        assertEquals(await jsonBody(res), [{ name: "p1", client_name: "client 1" }]);
      });

      await t.step("spread on a to-many embed is PGRST119", async () => {
        const res = await get("/clients?select=...projects(*)");
        assertEquals(res.status, 400);
        const body = (await jsonBody(res)) as { code: string; message: string; details: string };
        assertEquals(body.code, "PGRST119");
        assertEquals(body.message, "A spread operation on 'projects' is not possible");
        assertEquals(body.details, "'clients' and 'projects' do not form a many-to-one or one-to-one relationship");
      });

      await t.step("M2M embedding through the junction, both directions + junction hint", async () => {
        const res = await get("/users?select=name,projects(name)&order=id&projects.order=id");
        assertEquals(await jsonBody(res), [
          { name: "u1", projects: [{ name: "p1" }, { name: "p2" }] },
          { name: "u2", projects: [{ name: "p3" }] },
        ]);
        const inverse = await get("/projects?select=name,users(name)&id=eq.1");
        assertEquals(await jsonBody(inverse), [{ name: "p1", users: [{ name: "u1" }] }]);
        const hinted = await get("/users?select=name,projects!users_projects(name)&id=eq.2");
        assertEquals(await jsonBody(hinted), [{ name: "u2", projects: [{ name: "p3" }] }]);
      });

      await t.step("self reference: parent by FK column, children by table name, !hint", async () => {
        const boss = await get("/staff?select=name,boss:boss_id(name)&order=id");
        assertEquals(await jsonBody(boss), [
          { name: "boss", boss: null },
          { name: "emp a", boss: { name: "boss" } },
          { name: "emp b", boss: { name: "boss" } },
        ]);
        const subs = await get("/staff?select=name,subordinates:staff(name)&id=eq.1&staff.order=id");
        assertEquals(await jsonBody(subs), [{ name: "boss", subordinates: [{ name: "emp a" }, { name: "emp b" }] }]);
        const hinted = await get("/staff?select=name,subs:staff!boss_id(name)&id=eq.1&staff.order=id");
        assertEquals(await jsonBody(hinted), [{ name: "boss", subs: [{ name: "emp a" }, { name: "emp b" }] }]);
      });

      await t.step("computed relationship (rows 1 setof function) embeds as to-one", async () => {
        const res = await get("/projects?select=name,client_of(name)&id=eq.1");
        assertEquals(await jsonBody(res), [{ name: "p1", client_of: { name: "client 1" } }]);
      });

      await t.step("embedding through a view over projects, both directions", async () => {
        const viaView = await get("/projects_view?select=name,clients(name)&id=eq.1");
        assertEquals(await jsonBody(viaView), [{ name: "p1", clients: { name: "client 1" } }]);
        const toView = await get("/clients?select=name,projects_view(name)&id=eq.2");
        assertEquals(await jsonBody(toView), [{ name: "client 2", projects_view: [{ name: "p3" }] }]);
      });

      await t.step("two FKs to the same table: PGRST201 (300) with details + hint; hints fix it", async () => {
        const res = await get("/orders?select=addresses(city)");
        assertEquals(res.status, 300);
        const body = (await jsonBody(res)) as { code: string; message: string; details: unknown; hint: string };
        assertEquals(body.code, "PGRST201");
        assertEquals(body.message, "Could not embed because more than one relationship was found for 'orders' and 'addresses'");
        assertEquals(body.details, [
          {
            embedding: "orders with addresses",
            cardinality: "many-to-one",
            relationship: "orders_billing_address_id_fkey using orders(billing_address_id) and addresses(id)",
          },
          {
            embedding: "orders with addresses",
            cardinality: "many-to-one",
            relationship: "orders_shipping_address_id_fkey using orders(shipping_address_id) and addresses(id)",
          },
        ]);
        assertEquals(
          body.hint,
          "Try changing 'addresses' to one of the following: 'addresses!orders_billing_address_id_fkey', " +
            "'addresses!orders_shipping_address_id_fkey'. Find the desired relationship in the 'details' key.",
        );
        const byConstraint = await get(
          "/orders?select=name,billing:addresses!orders_billing_address_id_fkey(city),shipping:addresses!shipping_address_id(city)",
        );
        assertEquals(await jsonBody(byConstraint), [
          { name: "o1", billing: { city: "berlin" }, shipping: { city: "paris" } },
        ]);
      });

      await t.step("unknown embed: PGRST200 (400) with the fuzzy 'Perhaps you meant' hint", async () => {
        const res = await get("/projects?select=id,client(*)");
        assertEquals(res.status, 400);
        const body = (await jsonBody(res)) as { code: string; message: string; details: string; hint: string };
        assertEquals(body.code, "PGRST200");
        assertEquals(body.message, "Could not find a relationship between 'projects' and 'client' in the schema cache");
        assertEquals(
          body.details,
          `Searched for a foreign key relationship between 'projects' and 'client' in the schema '${SCHEMA}', but no matches were found.`,
        );
        assertEquals(body.hint, "Perhaps you meant 'clients' instead of 'client'.");
      });

      await t.step("embeds in CSV output", async () => {
        const res = await get("/projects?select=id,clients(name)&id=eq.1", { Accept: "text/csv" });
        assertEquals(res.status, 200);
        assertEquals(res.headers.get("Content-Type"), "text/csv; charset=utf-8");
        assertEquals(await res.text(), `id,clients\n1,"{""name"": ""client 1""}"`);
      });

      await t.step("singular object with embeds", async () => {
        const res = await get("/projects?select=id,clients(name),tasks(name)&id=eq.1&tasks.order=id", {
          Accept: "application/vnd.pgrst.object+json",
        });
        assertEquals(res.status, 200);
        assertEquals(await jsonBody(res), {
          id: 1,
          clients: { name: "client 1" },
          tasks: [{ name: "t1" }, { name: "t2" }],
        });
      });

      // ---- aggregates group -------------------------------------------------

      await t.step("aggregates inside embeds and hoisted spread aggregates", async () => {
        await resetWithEnv({ PGRST_DB_AGGREGATES_ENABLED: "true" });
        const inEmbed = await get("/clients?select=name,projects(total:budget.sum())&id=eq.1");
        assertEquals(await jsonBody(inEmbed), [{ name: "client 1", projects: [{ total: 300 }] }]);
        // spread aggregates hoist to the parent level and group the parent fields
        const hoisted = await get("/tasks?select=project_id,...projects(total:budget.sum())&order=project_id");
        assertEquals(await jsonBody(hoisted), [
          { project_id: 1, total: 200 },
          { project_id: 2, total: 200 },
          { project_id: 3, total: 300 },
        ]);
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
