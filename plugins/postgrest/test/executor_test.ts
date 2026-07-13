// Tests for functions/query/executor.ts — DB-gated on PGRST_DB_URI.
// Creates a throwaway schema + role and drops them in finally.
import { assert, assertEquals, assertStringIncludes } from "std/assert/mod.ts";
import { Pool } from "pg";
import type { AuthResult } from "../functions/auth/jwt.ts";
import { type AppConfig, readEnvConfig } from "../functions/config.ts";
import { closePoolForTests } from "../functions/db.ts";
import { PgrstError } from "../functions/errors.ts";
import { buildSetPgLocals, runQuery, type RunQueryOptions } from "../functions/query/executor.ts";

const dsn = Deno.env.get("PGRST_DB_URI");

const SCHEMA = "pgrsttest_exec";
const ROLE = "pgrsttest_exec_role";

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...readEnvConfig({}),
    dbSchemas: [SCHEMA],
    dbExtraSearchPath: ["public"],
    dbAnonRole: "pgrsttest_exec_anon",
    ...overrides,
  };
}

const AUTH: AuthResult = {
  claims: { role: ROLE, sub: "jdoe" },
  role: ROLE,
  authed: true,
};

function reqCtx(method: string) {
  return {
    path: "/items",
    method,
    headers: { "user-agent": "deno-test", accept: "*/*" },
    cookies: { session: "abc123" },
  };
}

function opts(method: string, sql: string, overrides: Partial<RunQueryOptions> = {}): RunQueryOptions {
  return {
    authResult: AUTH,
    config: testConfig(),
    req: reqCtx(method),
    mainQuery: { text: sql },
    ...overrides,
  };
}

async function expectPgrst(p: Promise<unknown>, status: number, code: string): Promise<PgrstError> {
  try {
    await p;
  } catch (err) {
    assert(err instanceof PgrstError, `expected PgrstError, got ${err}`);
    assertEquals(err.status, status);
    assertEquals(err.body.code, code);
    return err;
  }
  throw new Error("expected rejection");
}

Deno.test("buildSetPgLocals ports the Query.hs setPgLocals GUC set and order", () => {
  const { text, values } = buildSetPgLocals(opts("GET", "select 1", {
    config: testConfig({ appSettings: { foo: "bar" } }),
    roleSettings: { statement_timeout: "7s" },
    funcSettings: [["work_mem", "8MB"]],
    timezone: "America/New_York",
  }));
  assertEquals(
    text,
    "select set_config('search_path', $1, true), set_config($2, $3, true), " +
      "set_config('role', $4, true), set_config('request.jwt.claims', $5, true), " +
      "set_config('request.method', $6, true), set_config('request.path', $7, true), " +
      "set_config('request.headers', $8, true), set_config('request.cookies', $9, true), " +
      "set_config('timezone', $10, true), set_config($11, $12, true), set_config($13, $14, true)",
  );
  assertEquals(values, [
    `"${SCHEMA}", "public"`,
    "statement_timeout",
    "7s",
    ROLE,
    JSON.stringify(AUTH.claims),
    "GET",
    "/items",
    '{"user-agent":"deno-test","accept":"*/*"}',
    '{"session":"abc123"}',
    "America/New_York",
    "work_mem",
    "8MB",
    "app.settings.foo",
    "bar",
  ]);
});

Deno.test({
  name: "executor lifecycle (DB)",
  ignore: !dsn,
  fn: async (t) => {
    const admin = new Pool({ connectionString: dsn, max: 2 });
    try {
      await admin.query(`drop schema if exists ${SCHEMA} cascade`);
      await admin.query(`drop role if exists ${ROLE}`);
      await admin.query(`create role ${ROLE} nologin`);
      await admin.query(`create schema ${SCHEMA}`);
      await admin.query(`grant usage on schema ${SCHEMA} to ${ROLE}`);
      await admin.query(`create table ${SCHEMA}.items (id int primary key)`);
      await admin.query(`grant select, insert, delete on ${SCHEMA}.items to ${ROLE}`);
      await admin.query(
        `create function ${SCHEMA}.prereq() returns void language plpgsql as
         $$ begin perform set_config('pgrsttest.prereq', 'called', true); end $$`,
      );

      await t.step("impersonates the role via set_config('role', ...)", async () => {
        const { main } = await runQuery(opts("GET", "select current_user as u, current_setting('search_path') as sp"));
        assertEquals(main.rows[0].u, ROLE);
        assertStringIncludes(main.rows[0].sp, `"${SCHEMA}"`);
        assertStringIncludes(main.rows[0].sp, '"public"');
      });

      await t.step("request GUCs are visible via current_setting", async () => {
        const { main } = await runQuery(opts(
          "GET",
          `select current_setting('request.jwt.claims') as claims,
                  current_setting('request.method') as method,
                  current_setting('request.path') as path,
                  current_setting('request.headers') as headers,
                  current_setting('request.cookies') as cookies,
                  current_setting('app.settings.foo') as app_foo,
                  current_setting('statement_timeout') as st,
                  current_setting('timezone') as tz`,
          {
            config: testConfig({ appSettings: { foo: "bar" } }),
            roleSettings: { statement_timeout: "7s" },
            timezone: "America/New_York",
          },
        ));
        const row = main.rows[0];
        assertEquals(JSON.parse(row.claims), { role: ROLE, sub: "jdoe" });
        assertEquals(row.method, "GET");
        assertEquals(row.path, "/items");
        assertEquals(JSON.parse(row.headers), { "user-agent": "deno-test", accept: "*/*" });
        assertEquals(JSON.parse(row.cookies), { session: "abc123" });
        assertEquals(row.app_foo, "bar");
        assertEquals(row.st, "7s");
        assertEquals(row.tz, "America/New_York");
      });

      await t.step("db-pre-request function runs before the main query", async () => {
        const { main } = await runQuery(opts("GET", "select current_setting('pgrsttest.prereq', true) as v", {
          config: testConfig({ dbPreRequest: { schema: SCHEMA, name: "prereq" } }),
        }));
        assertEquals(main.rows[0].v, "called");
      });

      await t.step("GET runs READ ONLY: writes map to 405 (25006)", async () => {
        await expectPgrst(
          runQuery(opts("GET", `insert into ${SCHEMA}.items values (99)`)),
          405,
          "25006",
        );
        const check = await admin.query(`select count(*)::int as n from ${SCHEMA}.items where id = 99`);
        assertEquals(check.rows[0].n, 0);
      });

      await t.step("pg errors roll back the transaction and map SQLSTATEs", async () => {
        const first = await runQuery(opts("POST", `insert into ${SCHEMA}.items values (1)`));
        assertEquals(first.committed, true);
        assertEquals(first.main.rowCount, 1);
        // duplicate key → 23505 → 409
        await expectPgrst(runQuery(opts("POST", `insert into ${SCHEMA}.items values (1)`)), 409, "23505");
        const check = await admin.query(`select count(*)::int as n from ${SCHEMA}.items`);
        assertEquals(check.rows[0].n, 1);
      });

      await t.step("Prefer tx=rollback discards writes when db-tx-end allows override", async () => {
        const res = await runQuery(opts("POST", `insert into ${SCHEMA}.items values (2)`, {
          config: testConfig({ dbTxEnd: "commit-allow-override" }),
          preferTx: "rollback",
        }));
        assertEquals(res.committed, false);
        assertEquals(res.main.rowCount, 1); // the statement itself ran
        const check = await admin.query(`select count(*)::int as n from ${SCHEMA}.items where id = 2`);
        assertEquals(check.rows[0].n, 0);
      });

      await t.step("Prefer tx=rollback is ignored without allow-override", async () => {
        const res = await runQuery(opts("POST", `insert into ${SCHEMA}.items values (3)`, { preferTx: "rollback" }));
        assertEquals(res.committed, true);
        const check = await admin.query(`select count(*)::int as n from ${SCHEMA}.items where id = 3`);
        assertEquals(check.rows[0].n, 1);
        await admin.query(`delete from ${SCHEMA}.items where id = 3`);
      });

      await t.step("db-tx-end=rollback discards; tx=commit overrides when allowed", async () => {
        const rolled = await runQuery(opts("POST", `insert into ${SCHEMA}.items values (4)`, {
          config: testConfig({ dbTxEnd: "rollback" }),
        }));
        assertEquals(rolled.committed, false);
        // tx=commit only wins with rollback-allow-override
        const kept = await runQuery(opts("POST", `insert into ${SCHEMA}.items values (5)`, {
          config: testConfig({ dbTxEnd: "rollback-allow-override" }),
          preferTx: "commit",
        }));
        assertEquals(kept.committed, true);
        const check = await admin.query(`select array_agg(id order by id) as ids from ${SCHEMA}.items where id in (4, 5)`);
        assertEquals(check.rows[0].ids, [5]);
        await admin.query(`delete from ${SCHEMA}.items where id = 5`);
      });

      await t.step("permission errors carry the authed distinction (42501 → 403)", async () => {
        await admin.query(`revoke insert on ${SCHEMA}.items from ${ROLE}`);
        await expectPgrst(runQuery(opts("POST", `insert into ${SCHEMA}.items values (6)`)), 403, "42501");
        const anon = await expectPgrst(
          runQuery(opts("POST", `insert into ${SCHEMA}.items values (6)`, {
            authResult: { ...AUTH, authed: false },
          })),
          401,
          "42501",
        );
        assertEquals(anon.headers["WWW-Authenticate"], "Bearer");
        await admin.query(`grant insert on ${SCHEMA}.items to ${ROLE}`);
      });
    } finally {
      await admin.query(`drop schema if exists ${SCHEMA} cascade`).catch(() => {});
      await admin.query(`drop role if exists ${ROLE}`).catch(() => {});
      await admin.end();
      await closePoolForTests();
    }
  },
});
