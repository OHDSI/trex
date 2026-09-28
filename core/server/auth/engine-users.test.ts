import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { PLACEHOLDER_EMAIL_DOMAIN } from "./engine-address.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));
const PREFIX = "engine-users-";

// deno-lint-ignore no-explicit-any
type Pool = any;

function dbTest(name: string, fn: (pool: Pool) => Promise<void>) {
  Deno.test({
    name,
    ignore: !DATABASE_URL,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
      const { pool } = await import("../db.ts");
      try {
        await fn(pool);
      } finally {
        await pool.query(`DELETE FROM trexdb."user" WHERE email LIKE $1`, [`${PREFIX}%`]);
      }
    },
  });
}

const unique = (domain = "example.com") => `${PREFIX}${crypto.randomUUID().slice(0, 8)}@${domain}`;

async function row(pool: Pool, id: string) {
  const { rows } = await pool.query(`SELECT * FROM trexdb."user" WHERE id = $1`, [id]);
  return rows[0];
}

dbTest("createEngineUser writes a credential the engine verifies", async (pool) => {
  const { createEngineUser } = await import("./engine-users.ts");
  const email = unique();
  const { id } = await createEngineUser({ email, password: "correct-horse", name: "E", role: "user" });

  const { auth } = await import("./better-auth.ts");
  const signedIn = await auth.api.signInEmail({ body: { email, password: "correct-horse" } });
  assertEquals(signedIn.user.id, id);

  const u = await row(pool, id);
  assertEquals(u.emailVerified, true);
  assertNotEquals(u.email_confirmed_at, null);
  assertEquals(u.is_placeholder_email, false);
  assertEquals(u.role, "user");
  assertEquals(u.password_hash, null);
});

dbTest("createEngineUser flags a placeholder-domain address", async (pool) => {
  const { createEngineUser } = await import("./engine-users.ts");
  const { id } = await createEngineUser({
    email: unique(PLACEHOLDER_EMAIL_DOMAIN), password: "correct-horse", name: "P", role: "user",
  });
  const u = await row(pool, id);
  assertEquals(u.is_placeholder_email, true);
  assertEquals(u.emailVerified, false);
  assertEquals(u.email_confirmed_at, null);
});

dbTest("flagPlaceholder:false leaves a placeholder-domain address verified", async (pool) => {
  const { createEngineUser } = await import("./engine-users.ts");
  const { id } = await createEngineUser({
    email: unique(PLACEHOLDER_EMAIL_DOMAIN), password: "correct-horse", name: "S", role: "user",
    flagPlaceholder: false,
  });
  const u = await row(pool, id);
  assertEquals(u.is_placeholder_email, false);
  assertEquals(u.emailVerified, true);
});

dbTest("createEngineUser without a password writes no credential", async (pool) => {
  const { createEngineUser } = await import("./engine-users.ts");
  const { id } = await createEngineUser({ email: unique(), name: "N", role: "user" });
  const { rows } = await pool.query(
    `SELECT 1 FROM trexdb.account WHERE "userId" = $1 AND "providerId" = 'credential'`, [id],
  );
  assertEquals(rows.length, 0);
});

dbTest("createEngineUser case-folds the address and keeps user_metadata", async (pool) => {
  const { createEngineUser } = await import("./engine-users.ts");
  const typed = `${PREFIX.toUpperCase()}${crypto.randomUUID().slice(0, 8)}@Example.COM`;
  const created = await createEngineUser({
    email: typed, name: "C", role: "admin", userMetadata: { team: "x" },
  });
  assertEquals(created.email, typed.toLowerCase());
  const u = await row(pool, created.id);
  assertEquals(u.email, typed.toLowerCase());
  assertEquals(u.role, "admin");
  assertEquals(u.user_metadata, { team: "x" });
});
