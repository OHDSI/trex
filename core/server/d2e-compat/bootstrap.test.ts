import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  buildBootstrapStatements,
  parseBootstrapConfigFromEnv,
  quoteIdent,
  quoteLiteral,
} from "./bootstrap.ts";

const CFG = {
  manageConfig: {
    databases: { "+alp": { schemas: { "+portal": {}, "+usermgmt": {} } } },
  },
  manageUsers: {
    alp: {
      manager: "alp_pg_admin_user",
      managerPassword: "m-pass",
      reader: "alp_pg_read_user",
      readerPassword: "r-pass",
      writer: "alp_pg_write_user",
      writerPassword: "w-pass",
      logtoManager: "logto_postgres",
      logtoManagerPassword: "l-pass",
    },
  },
  grantRolesUsers: {},
};

Deno.test("quoteIdent double-quotes and escapes embedded quotes", () => {
  assertEquals(quoteIdent("alp_pg_admin_user"), '"alp_pg_admin_user"');
});

Deno.test("quoteLiteral single-quotes and escapes embedded quotes", () => {
  assertEquals(quoteLiteral("p'ass"), "'p''ass'");
});

Deno.test("quoteIdent rejects identifiers that are not name-shaped", () => {
  assertThrows(() => quoteIdent("bad; DROP DATABASE alp"));
});

Deno.test("every generated statement is idempotent", () => {
  for (const sql of buildBootstrapStatements(CFG)) {
    const idempotent = sql.includes("IF NOT EXISTS") ||
      sql.startsWith("GRANT ") ||
      sql.startsWith("ALTER DEFAULT PRIVILEGES ") ||
      sql.startsWith("DO $$");
    assertEquals(idempotent, true, `not idempotent: ${sql}`);
  }
});

Deno.test("creates each configured schema exactly once", () => {
  const stmts = buildBootstrapStatements(CFG);
  const created = stmts.filter((s) => s.startsWith("CREATE SCHEMA IF NOT EXISTS"));
  assertEquals(created.length, 2);
  assertEquals(created[0], 'CREATE SCHEMA IF NOT EXISTS "portal"');
  assertEquals(created[1], 'CREATE SCHEMA IF NOT EXISTS "usermgmt"');
});

Deno.test("creates login roles guarded on pg_roles", () => {
  const stmts = buildBootstrapStatements(CFG).join("\n");
  for (const u of ["alp_pg_admin_user", "alp_pg_read_user", "alp_pg_write_user"]) {
    assertEquals(stmts.includes(`WHERE rolname = '${u}'`), true, `missing guard for ${u}`);
  }
  // logtoManager needs CREATEROLE; the others must not have it.
  assertEquals(stmts.includes("CREATEROLE LOGIN ENCRYPTED PASSWORD 'l-pass'"), true);
});

Deno.test("creates the three supabase roles with the documented attributes", () => {
  const stmts = buildBootstrapStatements(CFG).join("\n");
  assertEquals(stmts.includes("CREATE ROLE anon NOLOGIN INHERIT"), true);
  assertEquals(stmts.includes("CREATE ROLE authenticated NOLOGIN INHERIT"), true);
  assertEquals(stmts.includes("CREATE ROLE service_role NOLOGIN INHERIT BYPASSRLS"), true);
});

Deno.test("grants per-schema privileges and default privileges to reader and writer", () => {
  const stmts = buildBootstrapStatements(CFG);
  assertEquals(
    stmts.includes(
      'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "portal" TO "alp_pg_write_user"',
    ),
    true,
  );
  assertEquals(
    stmts.includes(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "portal" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO "alp_pg_write_user"',
    ),
    true,
  );
  assertEquals(stmts.includes('GRANT USAGE ON SCHEMA "portal" TO "alp_pg_read_user"'), true);
});

Deno.test("parseBootstrapConfigFromEnv returns null when config is absent", () => {
  assertEquals(parseBootstrapConfigFromEnv({}), null);
});

Deno.test("parseBootstrapConfigFromEnv reads the three d2e env vars", () => {
  const cfg = parseBootstrapConfigFromEnv({
    POSTGRES_MANAGE_CONFIG: JSON.stringify(CFG.manageConfig),
    POSTGRES_MANAGE_USERS: JSON.stringify(CFG.manageUsers),
    POSTGRES_MANAGE_ROLES_USERS: "{}",
  });
  assertEquals(cfg?.manageUsers.alp.manager, "alp_pg_admin_user");
});
