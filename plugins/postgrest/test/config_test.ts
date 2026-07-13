// Tests for functions/config.ts — env parsing, layered precedence and the
// Config/JSPath.hs parser. No database required: the merge helpers are
// exercised with fake rows.
import { assertEquals, assertThrows } from "std/assert/mod.ts";
import { Pool } from "pg";
import {
  type JSPath,
  loadDbConfig,
  parseRoleClaimKey,
  queryDbSettings,
  queryRoleSettings,
  queryTrexSettings,
  readEnvConfig,
  resolveConfig,
  toIsolationLevel,
  trexSettingsToSource,
} from "../functions/config.ts";

const key = (k: string) => ({ kind: "key" as const, key: k });
const idx = (i: number) => ({ kind: "idx" as const, idx: i });

Deno.test("defaults match Config.hs", () => {
  const c = readEnvConfig({});
  assertEquals(c.dbSchemas, ["public"]);
  assertEquals(c.dbAnonRole, null);
  assertEquals(c.dbPreRequest, null);
  assertEquals(c.dbMaxRows, null);
  assertEquals(c.dbExtraSearchPath, ["public"]);
  assertEquals(c.dbTxEnd, "commit");
  assertEquals(c.dbAggregatesEnabled, false);
  assertEquals(c.dbPlanEnabled, false);
  assertEquals(c.dbChannel, "pgrst");
  assertEquals(c.dbChannelEnabled, true);
  assertEquals(c.dbConfig, true);
  assertEquals(c.dbPool, 10);
  assertEquals(c.dbPoolAcquisitionTimeout, 10);
  assertEquals(c.dbPreparedStatements, true);
  assertEquals(c.dbHoistedTxSettings, ["statement_timeout", "plan_filter.statement_cost_limit", "default_transaction_isolation"]);
  assertEquals(c.jwtSecret, null);
  assertEquals(c.jwtSecretIsBase64, false);
  assertEquals(c.jwtAud, null);
  assertEquals(c.jwtRoleClaimKey, [key("role")] as JSPath);
  assertEquals(c.openApiMode, "follow-privileges");
  assertEquals(c.openApiSecurityActive, false);
  assertEquals(c.openApiServerProxyUri, null);
  assertEquals(c.serverTimingEnabled, false);
  assertEquals(c.appSettings, {});
});

Deno.test("env parsing: lists are comma-separated with optional whitespace", () => {
  const c = readEnvConfig({
    PGRST_DB_SCHEMAS: "tenant1, tenant2 ,public",
    PGRST_DB_EXTRA_SEARCH_PATH: "extensions,util",
    PGRST_DB_HOISTED_TX_SETTINGS: "statement_timeout",
  });
  assertEquals(c.dbSchemas, ["tenant1", "tenant2", "public"]);
  assertEquals(c.dbExtraSearchPath, ["extensions", "util"]);
  assertEquals(c.dbHoistedTxSettings, ["statement_timeout"]);
});

Deno.test("env parsing: booleans accept true/false in any case and integers", () => {
  assertEquals(readEnvConfig({ PGRST_DB_CHANNEL_ENABLED: "false" }).dbChannelEnabled, false);
  assertEquals(readEnvConfig({ PGRST_DB_CHANNEL_ENABLED: "FALSE" }).dbChannelEnabled, false);
  assertEquals(readEnvConfig({ PGRST_DB_AGGREGATES_ENABLED: "TRUE" }).dbAggregatesEnabled, true);
  assertEquals(readEnvConfig({ PGRST_DB_AGGREGATES_ENABLED: '"true"' }).dbAggregatesEnabled, true);
  assertEquals(readEnvConfig({ PGRST_DB_AGGREGATES_ENABLED: "1" }).dbAggregatesEnabled, true);
  assertEquals(readEnvConfig({ PGRST_DB_AGGREGATES_ENABLED: "0" }).dbAggregatesEnabled, false);
  // unparseable → default
  assertEquals(readEnvConfig({ PGRST_DB_AGGREGATES_ENABLED: "yes" }).dbAggregatesEnabled, false);
});

Deno.test("env parsing: empty strings fall back to defaults (unset ${VAR} templates)", () => {
  const c = readEnvConfig({ PGRST_JWT_SECRET: "", PGRST_DB_MAX_ROWS: "", PGRST_DB_ANON_ROLE: "" });
  assertEquals(c.jwtSecret, null);
  assertEquals(c.dbMaxRows, null);
  assertEquals(c.dbAnonRole, null);
});

Deno.test("env parsing: scalars, aliases and qualified identifiers", () => {
  const c = readEnvConfig({
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_DB_MAX_ROWS: "1000",
    PGRST_DB_PRE_REQUEST: "public.pre_req",
    PGRST_JWT_AUD: "myaud",
    PGRST_DB_TX_END: "rollback-allow-override",
    PGRST_JWT_ROLE_CLAIM_KEY: ".realm.roles[0]",
  });
  assertEquals(c.dbAnonRole, "anon");
  assertEquals(c.dbMaxRows, 1000);
  assertEquals(c.dbPreRequest, { schema: "public", name: "pre_req" });
  assertEquals(c.jwtAud, "myaud");
  assertEquals(c.dbTxEnd, "rollback-allow-override");
  assertEquals(c.jwtRoleClaimKey, [key("realm"), key("roles"), idx(0)] as JSPath);
  // db-schema is an alias for db-schemas; the primary key wins when both are set
  assertEquals(readEnvConfig({ PGRST_DB_SCHEMA: "one" }).dbSchemas, ["one"]);
  assertEquals(readEnvConfig({ PGRST_DB_SCHEMA: "one", PGRST_DB_SCHEMAS: "two" }).dbSchemas, ["two"]);
});

Deno.test("env parsing: invalid enum values throw like Config.hs fails", () => {
  assertThrows(() => readEnvConfig({ PGRST_DB_TX_END: "sometimes" }), Error, "Invalid transaction termination");
  assertThrows(() => readEnvConfig({ PGRST_OPENAPI_MODE: "wat" }), Error, "Invalid openapi-mode");
});

Deno.test("PGRST_APP_SETTINGS_* prefix scan", () => {
  const c = readEnvConfig({ PGRST_APP_SETTINGS_app_provider: "stripe", PGRST_APP_SETTINGS_LIMIT: "10" });
  assertEquals(c.appSettings, { app_provider: "stripe", LIMIT: "10" });
});

Deno.test("precedence: env < trexdb.setting < pgrst.* db settings", () => {
  const env = { PGRST_DB_MAX_ROWS: "1", PGRST_DB_POOL: "5" };
  const trex = trexSettingsToSource([
    { key: "postgrest.maxRows", value: "2" },
    { key: "postgrest.dbSchema", value: "trex1,trex2" },
    { key: "postgrest.dbExtraSearchPath", value: "ext" },
    { key: "postgrest.dbPool", value: "7" },
    { key: "postgrest.unknown", value: "ignored" },
  ]);
  const overTrex = resolveConfig({ env, trex });
  assertEquals(overTrex.dbMaxRows, 2);
  assertEquals(overTrex.dbSchemas, ["trex1", "trex2"]);
  assertEquals(overTrex.dbExtraSearchPath, ["ext"]);
  assertEquals(overTrex.dbPool, 7);

  const db = { db_max_rows: "3", db_tx_end: "rollback", jwt_secret: "fromdb" };
  const full = resolveConfig({ env, trex, db });
  assertEquals(full.dbMaxRows, 3);
  assertEquals(full.dbTxEnd, "rollback");
  assertEquals(full.jwtSecret, "fromdb");
  // trex layer still beats env where the db layer is silent
  assertEquals(full.dbPool, 7);
  assertEquals(resolveConfig({ env, db }).dbPool, 5);
});

Deno.test("JSPath parser: Config/JSPath.hs grammar", () => {
  assertEquals(parseRoleClaimKey(".role"), [key("role")] as JSPath);
  assertEquals(parseRoleClaimKey(".a.b[1].c"), [key("a"), key("b"), idx(1), key("c")] as JSPath);
  assertEquals(parseRoleClaimKey('."foo-bar"[2]'), [key("foo-bar"), idx(2)] as JSPath);
  assertEquals(parseRoleClaimKey('."https://example.com/roles"[0]'), [key("https://example.com/roles"), idx(0)] as JSPath);
  assertEquals(parseRoleClaimKey(".$a_b@"), [key("$a_b@")] as JSPath);
  // failures: no leading period, empty segment, bad index, trailing garbage
  assertThrows(() => parseRoleClaimKey("role"));
  assertThrows(() => parseRoleClaimKey(".a..b"));
  assertThrows(() => parseRoleClaimKey(".a[b]"));
  assertThrows(() => parseRoleClaimKey(".a[1"));
  assertThrows(() => parseRoleClaimKey(".a-b"));
});

Deno.test("toIsolationLevel maps like Config/Database.hs", () => {
  assertEquals(toIsolationLevel("repeatable read"), "repeatable read");
  assertEquals(toIsolationLevel("serializable"), "serializable");
  assertEquals(toIsolationLevel("read committed"), "read committed");
  assertEquals(toIsolationLevel("whatever"), "read committed");
});

const dsn = Deno.env.get("PGRST_DB_URI");

Deno.test({
  name: "in-db config queries (DB)",
  ignore: !dsn,
  fn: async () => {
    const pool = new Pool({ connectionString: dsn, max: 2 });
    const ROLE = "pgrsttest_cfg_role";
    try {
      // pgrst.* settings of the connected role (queryDbSettings)
      await pool.query("alter role current_user set pgrst.db_max_rows = '42'");
      await pool.query("alter role current_user set pgrst.db_tx_end = 'rollback'");
      // role settings of a member role (queryRoleSettings)
      await pool.query(`drop role if exists ${ROLE}`);
      await pool.query(`create role ${ROLE} nologin`);
      await pool.query(`alter role ${ROLE} set statement_timeout = '5s'`);
      await pool.query(`alter role ${ROLE} set default_transaction_isolation = 'serializable'`);
      await pool.query(`grant ${ROLE} to current_user`);
      // trexdb.setting layer
      await pool.query("create schema if not exists trexdb");
      await pool.query("create table if not exists trexdb.setting (key text primary key, value text)");
      await pool.query("insert into trexdb.setting values ('postgrest.maxRows', '7'), ('postgrest.dbPool', '3') on conflict (key) do nothing");

      const db = await queryDbSettings(pool, null);
      assertEquals(db.db_max_rows, "42");
      assertEquals(db.db_tx_end, "rollback");

      const { roleSettings, roleIsolationLvl } = await queryRoleSettings(pool);
      assertEquals(roleSettings[ROLE], { statement_timeout: "5s" });
      assertEquals(roleIsolationLvl[ROLE], "serializable");

      const trex = await queryTrexSettings(pool);
      assertEquals(trex, { "db-max-rows": "7", "db-pool": "3" });

      // precedence: pgrst.* (42) beats trexdb.setting (7) beats env (1)
      const effective = await loadDbConfig(pool, { PGRST_DB_MAX_ROWS: "1" });
      assertEquals(effective.dbMaxRows, 42);
      assertEquals(effective.dbPool, 3);
      assertEquals(effective.dbTxEnd, "rollback");
      assertEquals(effective.roleSettings[ROLE], { statement_timeout: "5s" });

      // db-config=false skips the pgrst.* layer but keeps trex + role settings
      const noDbConf = await loadDbConfig(pool, { PGRST_DB_CONFIG: "false", PGRST_DB_MAX_ROWS: "1" });
      assertEquals(noDbConf.dbMaxRows, 7);
      assertEquals(noDbConf.dbTxEnd, "commit");
      assertEquals(noDbConf.roleSettings[ROLE], { statement_timeout: "5s" });
    } finally {
      await pool.query("alter role current_user reset pgrst.db_max_rows").catch(() => {});
      await pool.query("alter role current_user reset pgrst.db_tx_end").catch(() => {});
      await pool.query("delete from trexdb.setting where key like 'postgrest.%'").catch(() => {});
      await pool.query(`drop role if exists ${ROLE}`).catch(() => {});
      await pool.end();
    }
  },
});
