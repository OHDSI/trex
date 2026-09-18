// The MCP user tools' one address-writing door.
//
// user-create is reachable with an admin API key — the same privilege tier as
// POST /admin/users — and its schema is a bare z.string(), so before the guard
// nothing between the caller and the INSERT looked at the address. These tests
// pin the guard and, just as importantly, pin how narrow it is.
//
// Gated on DATABASE_URL and dynamically imported for the same reason
// federation/admin.test.ts is: db.ts throws at module load without one, so a
// static import would fail the file before `ignore` could skip it.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

const dbUrl = Deno.env.get("DATABASE_URL");

// deno-lint-ignore no-explicit-any
type Handler = (args: any) => Promise<any>;

/**
 * registerUserTools' handlers are closures it never returns, so the only way to
 * reach one is to be the server it registers against. A recorder is enough: the
 * real McpServer contributes nothing the handler reads.
 */
async function userCreate(): Promise<Handler> {
  const { registerUserTools } = await import("./users.ts");
  const tools = new Map<string, Handler>();
  const server = {
    tool: (name: string, _desc: string, _schema: unknown, fn: Handler) => tools.set(name, fn),
    // deno-lint-ignore no-explicit-any
  } as any;
  registerUserTools(server);
  const handler = tools.get("user-create");
  if (!handler) throw new Error("user-create is no longer registered");
  return handler;
}

async function withDb(fn: (db: PgTestClient, run: string) => Promise<void>) {
  const { Client } = await import("npm:pg");
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const run = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  try {
    await fn(db, run);
  } finally {
    // Both halves: user-create writes an account row too when given a password.
    await db.query(
      `DELETE FROM trexdb.account WHERE "userId" IN
         (SELECT id FROM trexdb."user" WHERE email LIKE $1)`,
      [`%${run}%`],
    );
    await db.query(`DELETE FROM trexdb."user" WHERE email LIKE $1`, [`%${run}%`]);
    await db.end();
  }
}

// deno-lint-ignore no-explicit-any
type PgTestClient = any;

const dbTest = (name: string, fn: (db: PgTestClient, run: string) => Promise<void>) =>
  Deno.test({ name: `[db] ${name}`, ignore: !dbUrl, fn: () => withDb(fn) });

async function rowsFor(db: PgTestClient, email: string) {
  const { rows } = await db.query(`SELECT id FROM trexdb."user" WHERE email = $1`, [email]);
  return rows;
}

// A single-label domain: the shape V17 refuses, and the shape an
// IDP__INITIAL_USER__DOMAIN of "localhost" produces.
dbTest("user-create refuses an address the engine cannot serve", async (db, run) => {
  const create = await userCreate();
  const email = `mcp-${run}@localhost`;

  const res = await create({ name: "Jo", email });
  assertEquals(res.isError, true);
  // The address is echoed so an operator can see which call was refused.
  assertStringIncludes(res.content[0].text, email);
  assertEquals(await rowsFor(db, email), []);
});

// The refusal is ahead of BOTH inserts. The password branch writes the user and
// then an account row, so a guard placed one statement later would leave half a
// user behind on every refused call.
dbTest("a refused user-create writes neither the user nor its credential", async (db, run) => {
  const create = await userCreate();
  const email = `mcp-pw-${run}@localhost`;

  const res = await create({ name: "Jo", email, password: "a-long-password" });
  assertEquals(res.isError, true);
  assertEquals(await rowsFor(db, email), []);
  const { rows } = await db.query(
    `SELECT a.id FROM trexdb.account a JOIN trexdb."user" u ON u.id = a."userId" WHERE u.email = $1`,
    [email],
  );
  assertEquals(rows, []);
});

// Narrowness, and the reason the two tests above are not enough on their own: a
// guard that refused everything would satisfy them.
dbTest("user-create still creates a user with a servable address", async (db, run) => {
  const create = await userCreate();
  const email = `mcp-ok-${run}@example.test`;

  const res = await create({ name: "Jo", email, password: "a-long-password" });
  assertEquals(res.isError, undefined);
  assertEquals((await rowsFor(db, email)).length, 1);
});
