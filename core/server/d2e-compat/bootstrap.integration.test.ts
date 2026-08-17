// Opt-in: set TEST_PG_URL to run. Skipped otherwise so `make test-deno` stays hermetic.
import { assertEquals } from "jsr:@std/assert";
import { Pool } from "pg";
import { buildBootstrapStatements } from "./bootstrap.ts";

const url = Deno.env.get("TEST_PG_URL");

Deno.test({
  name: "bootstrap SQL is idempotent against a live Postgres",
  ignore: !url,
  fn: async () => {
    const pool = new Pool({ connectionString: url });
    const cfg = {
      manageConfig: { databases: { "+postgres": { schemas: { "+portal": {}, "+usermgmt": {} } } } },
      manageUsers: {
        postgres: {
          manager: "it_admin_user",
          managerPassword: "m-pass",
          reader: "it_write_user",
          readerPassword: "w-pass",
          writer: "it_write_user",
          writerPassword: "w-pass",
        },
      },
      grantRolesUsers: {},
    };
    const statements = buildBootstrapStatements(cfg);

    // Two consecutive passes must both succeed — the second proves idempotency.
    for (let pass = 1; pass <= 2; pass++) {
      for (const sql of statements) {
        await pool.query(sql);
      }
    }

    const roles = await pool.query(
      "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','it_admin_user','it_write_user')",
    );
    assertEquals(roles.rowCount, 5);

    const schemas = await pool.query(
      "SELECT nspname FROM pg_namespace WHERE nspname IN ('portal','usermgmt')",
    );
    assertEquals(schemas.rowCount, 2);

    await pool.end();
  },
});
