// What changed when /auth/v1 stopped verifying passwords itself.
//
// auth-router.contract.test.ts pins the wire — the envelopes, the statuses, the
// error strings — and is the reason this cutover is safe to make at all. It
// cannot see the things the cutover is *for*, because none of them are visible
// in a response body: the engine's session row, the engine's cookie, and the
// credential being in the one place the engine reads. Those are pinned here.
//
// Gated on DATABASE_URL for the same reason as the contract file: auth-router.ts
// imports ../db.ts, which opens a pool while it evaluates.
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import express from "express";
import { _resetRootKeyCache } from "./keys.ts";
import { _resetJwtSecretCache, signAccessToken } from "./jwt.ts";
import { hashPassword, verifyPassword } from "./password.ts";

// deno-lint-ignore no-explicit-any
type PgPool = any;

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived signing key is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

/** Every fixture user carries this domain, and only this file purges it. */
const TEST_DOMAIN = "@cutover.test";

const PASSWORD = "correct-horse-battery";

interface Ctx {
  url: string;
  pool: PgPool;
}

function cutoverTest(name: string, fn: (c: Ctx) => Promise<void>) {
  Deno.test({
    name,
    ignore: !DATABASE_URL,
    // ../db.ts owns a pool that deliberately outlives every test.
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      _resetRootKeyCache();
      _resetJwtSecretCache();
      Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
      Deno.env.delete("TREX_NATIVE_PASSWORD_LOGIN_ENABLED");

      const { pool } = await import("../db.ts");
      const { authRouter } = await import("./auth-router.ts");
      await purge(pool);

      const app = express();
      app.use("/trex/auth/v1", authRouter);
      const server = app.listen(0, "127.0.0.1");
      await new Promise<void>((r) => server.once("listening", () => r()));
      const { port } = server.address() as { port: number };
      try {
        await fn({ url: `http://127.0.0.1:${port}/trex/auth/v1`, pool });
      } finally {
        await new Promise<void>((r) => server.close(() => r()));
        await purge(pool);
      }
    },
  });
}

async function purge(pool: PgPool) {
  await pool.query(`DELETE FROM trexdb."user" WHERE email LIKE $1`, [`%${TEST_DOMAIN}`]);
}

let seq = 0;
function uniqueEmail(label: string): string {
  seq += 1;
  return `cutover-${label}-${seq}-${crypto.randomUUID().slice(0, 8)}${TEST_DOMAIN}`;
}

/**
 * A user whose password lives only on user.password_hash and who has no account
 * row at all — the shape every row had before V17, and the shape the engine
 * cannot authenticate until something puts the credential where it reads.
 */
async function createLegacyUser(
  pool: PgPool,
  opts: { email?: string; password?: string; role?: string } = {},
): Promise<{ id: string; email: string; role: string }> {
  const id = crypto.randomUUID();
  const email = opts.email ?? uniqueEmail("user");
  const role = opts.role ?? "user";
  await pool.query(
    `INSERT INTO trexdb."user" (id, name, email, "emailVerified", email_confirmed_at, role, password_hash)
     VALUES ($1, 'Cutover User', $2, true, NOW(), $3, $4)`,
    [id, email, role, await hashPassword(opts.password ?? PASSWORD)],
  );
  return { id, email, role };
}

function bearer(user: { id: string; email: string; role: string }): Promise<string> {
  return signAccessToken({ id: user.id, email: user.email, role: user.role }, crypto.randomUUID());
}

function request(method: string, url: string, body?: unknown, token?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token !== undefined) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

const post = (url: string, body?: unknown, token?: string) => request("POST", url, body, token);

function grant(url: string, email: string, password: string): Promise<Response> {
  return post(`${url}/token?grant_type=password`, { email, password });
}

function engineCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith("better-auth.session_token="));
}

async function credential(pool: PgPool, userId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT password FROM trexdb.account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [userId],
  );
  return rows[0]?.password ?? null;
}

async function storedHash(pool: PgPool, userId: string): Promise<string | null> {
  const { rows } = await pool.query(`SELECT password_hash FROM trexdb."user" WHERE id = $1`, [userId]);
  return rows[0]?.password_hash ?? null;
}

async function sessionCount(pool: PgPool, userId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM trexdb.session WHERE "userId" = $1`,
    [userId],
  );
  return rows[0].n;
}

// ── The session and the cookie phase 2 needs ────────────────────────────────

cutoverTest("the password grant leaves a Better Auth session and its cookie", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);

  const res = await grant(url, user.email, PASSWORD);
  assertEquals(res.status, 200);
  const body = await res.json();

  // The row on its own would be write-only: @better-auth/oauth-provider
  // authenticates /oauth2/authorize through getSessionFromCtx, which reads this
  // cookie and nothing else. trex's own cookie is untouched beside it.
  assertEquals(await sessionCount(pool, user.id), 1);
  assertNotEquals(engineCookie(res), undefined);
  assertEquals(
    res.headers.getSetCookie().some((c) => c.startsWith(`sb-access-token=${body.access_token};`)),
    true,
  );
});

cutoverTest("signing up leaves the same session and cookie as signing in", async ({ url, pool }) => {
  const email = uniqueEmail("signup");
  // Saved and handed back, because this is a developer's own database as often
  // as it is a throwaway one.
  const { rows: before } = await pool.query(
    `SELECT value FROM trexdb.setting WHERE key = 'auth.selfRegistration'`,
  );
  await pool.query(
    `INSERT INTO trexdb.setting (key, value) VALUES ('auth.selfRegistration', 'true'::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
  const previousAdmin = Deno.env.get("ADMIN_EMAIL");
  Deno.env.delete("ADMIN_EMAIL");
  try {
    const res = await post(`${url}/signup`, { email, password: PASSWORD });
    assertEquals(res.status, 200);
    const body = await res.json();

    // A registration that could not be signed in would be an account nobody can
    // use, so signup goes through the engine rather than only writing rows.
    assertEquals(await sessionCount(pool, body.user.id), 1);
    assertNotEquals(engineCookie(res), undefined);
    assertEquals(await credential(pool, body.user.id), await storedHash(pool, body.user.id));
  } finally {
    if (previousAdmin !== undefined) Deno.env.set("ADMIN_EMAIL", previousAdmin);
    if (before.length > 0) {
      await pool.query(
        `UPDATE trexdb.setting SET value = $1::jsonb WHERE key = 'auth.selfRegistration'`,
        [JSON.stringify(before[0].value)],
      );
    } else {
      await pool.query(`DELETE FROM trexdb.setting WHERE key = 'auth.selfRegistration'`);
    }
  }
});

cutoverTest("logging out ends the engine's session, not only trex's", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);
  const signedIn = await grant(url, user.email, PASSWORD);
  assertEquals(signedIn.status, 200);
  const { access_token } = await signedIn.json();
  const cookie = engineCookie(signedIn)!.split(";")[0];
  assertEquals(await sessionCount(pool, user.id), 1);

  const res = await fetch(`${url}/logout`, {
    method: "POST",
    headers: { authorization: `Bearer ${access_token}`, cookie },
  });
  assertEquals(res.status, 204);
  await res.text();

  // Otherwise someone who has logged out of trex is still signed in to the
  // OAuth provider, which reads that session and never sees this request.
  assertEquals(await sessionCount(pool, user.id), 0);
});

// ── The credential, where the engine reads it ───────────────────────────────

cutoverTest("a credential only the user row carried is adopted and signs in", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);
  assertEquals(await credential(pool, user.id), null);

  const res = await grant(url, user.email, PASSWORD);
  assertEquals(res.status, 200);
  await res.text();

  // The engine reports an account with no credential row as a wrong password,
  // so a row written before V17 would have locked its holder out.
  assertEquals(await credential(pool, user.id), await storedHash(pool, user.id));
});

cutoverTest("an adopted credential is never overwritten by the mirror", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);
  // The password the engine holds is the current one; user.password_hash is a
  // mirror that may be older. Filling an empty credential must not turn into
  // resurrecting a superseded one.
  const current = await hashPassword("the-current-password");
  await pool.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId", password)
     VALUES ($1, $2, $2, 'credential', $3)`,
    [crypto.randomUUID(), user.id, current],
  );

  assertEquals((await grant(url, user.email, PASSWORD)).status, 400);
  const res = await grant(url, user.email, "the-current-password");
  assertEquals(res.status, 200);
  await res.text();
  assertEquals(await credential(pool, user.id), current);
});

// Each of these writes a password and used to reach account.password with an
// UPDATE, which changed nothing at all for a user who had no credential row —
// a federated account setting its first password, or any row this router had
// not created. The old password went on working and the new one was refused.
const PASSWORD_WRITES: Array<{
  name: string;
  write: (
    url: string,
    user: { id: string; email: string; role: string },
    admin: string,
    next: string,
  ) => Promise<Response>;
}> = [
  {
    name: "PUT /user",
    write: async (url, user, _admin, next) =>
      await request("PUT", `${url}/user`, { password: next }, await bearer(user)),
  },
  {
    name: "POST /change-password",
    write: async (url, user, _admin, next) =>
      await post(
        `${url}/change-password`,
        { currentPassword: PASSWORD, newPassword: next },
        await bearer(user),
      ),
  },
  {
    name: "PUT /admin/users/:id",
    write: (url, user, admin, next) =>
      request("PUT", `${url}/admin/users/${user.id}`, { password: next }, admin),
  },
];

for (const { name, write } of PASSWORD_WRITES) {
  cutoverTest(`${name} writes the password where the engine reads it`, async ({ url, pool }) => {
    const admin = await createLegacyUser(pool, { role: "admin" });
    const user = await createLegacyUser(pool);
    assertEquals(await credential(pool, user.id), null);

    const next = "a-brand-new-password";
    const res = await write(url, user, await bearer(admin), next);
    assertEquals(res.status, 200);
    await res.text();

    assertEquals(await credential(pool, user.id), await storedHash(pool, user.id));
    assertEquals((await grant(url, user.email, PASSWORD)).status, 400);
    const signedIn = await grant(url, user.email, next);
    assertEquals(signedIn.status, 200);
    await signedIn.text();
  });
}

// ── The address the engine can resolve ──────────────────────────────────────

cutoverTest("an address stored in another case still signs in, folded", async ({ url, pool }) => {
  const user = await createLegacyUser(pool, { email: uniqueEmail("Mixed").toUpperCase() });

  // The engine matches a user by exact equality against the address it has
  // lower-cased, so a stored spelling that is not already folded is invisible
  // to it and its holder would be told their password is wrong.
  const res = await grant(url, user.email, PASSWORD);
  assertEquals(res.status, 200);
  await res.text();

  const { rows } = await pool.query(`SELECT email FROM trexdb."user" WHERE id = $1`, [user.id]);
  assertEquals(rows[0].email, user.email.toLowerCase());
  assertEquals(await sessionCount(pool, user.id), 1);
});

// ── A failed request changes nothing ────────────────────────────────────────

cutoverTest("a PUT /user that fails leaves the old password working", async ({ url, pool }) => {
  const taken = await createLegacyUser(pool);
  const user = await createLegacyUser(pool);

  // The contract-pinned 500: the address is already held, so the row UPDATE
  // violates user_email_lower_key. account.password is the column sign-in reads
  // now, so a credential written before that failure does not leave a stale
  // mirror — it changes the password of a request the caller was told had done
  // nothing, and the mirror's IS NULL guard cannot repair a column that is
  // merely out of date.
  const res = await request(
    "PUT",
    `${url}/user`,
    { email: taken.email, password: "a-brand-new-password" },
    await bearer(user),
  );
  assertEquals(res.status, 500);
  await res.text();

  assertEquals((await grant(url, user.email, "a-brand-new-password")).status, 400);
  const signedIn = await grant(url, user.email, PASSWORD);
  assertEquals(signedIn.status, 200);
  await signedIn.text();
  assertEquals(await credential(pool, user.id), await storedHash(pool, user.id));
});

// ── The pooled connection a password write borrows ──────────────────────────

/**
 * Clients borrowed from the pool and not yet given back — pg exposes the two
 * counters this is the difference of.
 */
function borrowed(pool: PgPool): number {
  return pool.totalCount - pool.idleCount;
}

/** Settles within a second, or says what it saw. A leaked client never does. */
async function assertPoolSettles(pool: PgPool, label: string) {
  for (let i = 0; i < 50 && borrowed(pool) > 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assertEquals(
    borrowed(pool),
    0,
    `${label}: ${borrowed(pool)} pooled client(s) never came back ` +
      `(total=${pool.totalCount} idle=${pool.idleCount} waiting=${pool.waitingCount})`,
  );
}

cutoverTest("a password write gives its pooled connection back", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);
  await assertPoolSettles(pool, "before the write");

  // A password write is the one thing in this router that borrows a client
  // instead of going through pool.query, because it needs a transaction. A
  // borrow that is never returned is invisible to any single test — ../db.ts
  // takes pg's default of ten clients and nothing else here comes close — and
  // then the eleventh password change blocks forever, with
  // connectionTimeoutMillis at its default of 0 meaning every later query in
  // the process waits behind it. Counted rather than provoked: a suite that
  // hangs tells CI far less than one that fails.
  const first = await request(
    "PUT",
    `${url}/user`,
    { password: "a-brand-new-password" },
    await bearer(user),
  );
  assertEquals(first.status, 200);
  await first.text();
  await assertPoolSettles(pool, "after one successful write");

  // More successful writes than the pool holds. With the connection returned
  // this is unremarkable; without it the assertion above has already failed, so
  // this can never be the thing that hangs. It is here because "released on
  // some paths" is a real shape of this bug that one write would not see.
  const writes = 12;
  for (let i = 0; i < writes; i++) {
    const res = await request(
      "PUT",
      `${url}/user`,
      { password: `rotation-number-${i}-is-long-enough` },
      await bearer(user),
    );
    assertEquals(res.status, 200, `write ${i}`);
    await res.text();
  }
  await assertPoolSettles(pool, `after ${writes} successful writes`);

  // And the account still works, so the connections came back after the
  // transaction committed rather than instead of it.
  const signedIn = await grant(url, user.email, `rotation-number-${writes - 1}-is-long-enough`);
  assertEquals(signedIn.status, 200);
  await signedIn.text();
});

cutoverTest("a rolled-back password write gives its connection back too", async ({ url, pool }) => {
  const taken = await createLegacyUser(pool);
  const user = await createLegacyUser(pool);
  await assertPoolSettles(pool, "before the write");

  // The failure path borrows the same client. Driven through the
  // contract-pinned duplicate-address 500, which is the failure this
  // transaction exists to survive.
  const res = await request(
    "PUT",
    `${url}/user`,
    { email: taken.email, password: "a-brand-new-password" },
    await bearer(user),
  );
  assertEquals(res.status, 500);
  await res.text();
  await assertPoolSettles(pool, "after a rolled-back write");
});

// ── Verification failures are the caller's, or nobody's ─────────────────────

cutoverTest("a password that is not a string is invalid_grant, not a 500", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);

  // Better Auth raises a body-schema failure from better-call, whose APIError
  // is the base class of the one better-auth exports, so an `instanceof` test
  // against the subclass misses it and this route answers 500 for the one case
  // that is plainly the caller's fault.
  const res = await grant(url, user.email, 12345 as unknown as string);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "invalid_grant",
    error_description: "Invalid login credentials",
  });
});

cutoverTest("an engine failure is a 500, not a wrong password", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);

  // A failure inside the engine — here its session insert, the same shape as a
  // scrypt or a connection failure — must not come back as invalid_grant. That
  // was the old swallow: a broken installation told every user their password
  // was wrong, and the logs said the same.
  //
  // OR REPLACE and IF EXISTS because a run killed between here and the drops
  // below would otherwise leave the function behind, and every later run would
  // fail on this CREATE rather than on the thing under test — a failure that
  // looks like a flake and is not one.
  await pool.query(
    `CREATE OR REPLACE FUNCTION trexdb.cutover_break_session() RETURNS trigger LANGUAGE plpgsql AS
       $fn$ BEGIN RAISE EXCEPTION 'cutover: session store unavailable'; END $fn$`,
  );
  await pool.query(`DROP TRIGGER IF EXISTS cutover_break_session ON trexdb.session`);
  await pool.query(
    `CREATE TRIGGER cutover_break_session BEFORE INSERT ON trexdb.session
       FOR EACH ROW EXECUTE FUNCTION trexdb.cutover_break_session()`,
  );
  try {
    const res = await grant(url, user.email, PASSWORD);
    assertEquals(res.status, 500);
    assertEquals(await res.json(), {
      error: "server_error",
      error_description: "Internal server error",
    });
  } finally {
    await pool.query(`DROP TRIGGER cutover_break_session ON trexdb.session`);
    await pool.query(`DROP FUNCTION trexdb.cutover_break_session()`);
  }
});

// ── The address rule, and who owns it ───────────────────────────────────────

/**
 * Addresses the engine accepts and rejects. The rejected ones are what a signup
 * used to write rows for and then delete again under a 500.
 */
const ADDRESSES: Array<[string, boolean]> = [
  ["plain@example.test", true],
  ["dotted.local.part@sub.example.test", true],
  ["plus+tag@example.test", true],
  ["o'brien@example.test", true],
  ["_under@example.test", true],
  ["synthesised-placeholder@d2e.local", true],
  // The shape V2's seeded admin has — a dotted, non-public TLD. Spelled so that
  // nothing can hold it, because the engine is asked these addresses for real
  // and a table entry somebody owns turns the probe into a password attempt
  // against their account. The seeded address itself is asserted below, where
  // no engine call is involved.
  ["not-the-seed@trex.local", true],
  ["not-an-address", false],
  ["no-domain@", false],
  ["@no-local.test", false],
  ["spaces in@example.test", false],
  ["trailing.dot.@example.test", false],
  // What locked a real account out: V1 imposed no format, and the engine wants
  // a dotted domain.
  ["no.tld@localhost", false],
  // The one shape V17's own placeholder backfill can still mint: `.` survives
  // slugification, so an upstream subject containing `..` yields a local part
  // with an empty atom, which zod rejects. V17's check runs after the backfill
  // precisely so it sees this.
  ["foo..bar@d2e.local", false],
];

cutoverTest("signup refuses an address the engine could never resolve", async ({ url, pool }) => {
  const { rows: before } = await pool.query(
    `SELECT value FROM trexdb.setting WHERE key = 'auth.selfRegistration'`,
  );
  await pool.query(
    `INSERT INTO trexdb.setting (key, value) VALUES ('auth.selfRegistration', 'true'::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );
  try {
    // 422 before anything is written, not a 500 after a user and an account
    // have been created and deleted again. Registering an address nobody could
    // ever sign in with was never right; this is the route saying so.
    const res = await post(`${url}/signup`, { email: "not-an-address", password: PASSWORD });
    assertEquals(res.status, 422);
    assertEquals(await res.json(), {
      error: "signup_invalid",
      error_description: "Email must be a valid address",
    });
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM trexdb."user" WHERE email = 'not-an-address'`,
    );
    assertEquals(rows[0].n, 0);
  } finally {
    if (before.length > 0) {
      await pool.query(
        `UPDATE trexdb.setting SET value = $1::jsonb WHERE key = 'auth.selfRegistration'`,
        [JSON.stringify(before[0].value)],
      );
    } else {
      await pool.query(`DELETE FROM trexdb.setting WHERE key = 'auth.selfRegistration'`);
    }
  }
});

/**
 * V17's refusal, lifted out of the migration text so the parity test can ask it
 * the same questions the router and the engine are asked. Read from the file
 * rather than restated here, because a third hand-written copy would be a third
 * thing to drift.
 */
async function v17AddressExpression(): Promise<string> {
  const sql = await Deno.readTextFile(
    new URL("../../schema/V17__better_auth_canonical_tables.sql", import.meta.url),
  );
  const match = sql.match(/AND email !~ '(.+)';/);
  if (!match) throw new Error("V17 no longer carries an `AND email !~ '…';` line");
  return match[1];
}

cutoverTest("trex's address rule is the engine's and V17's, over one table", async ({ pool }) => {
  // isEngineAddressable is a copy of zod's z.email(), which is what Better Auth
  // checks first on every credential endpoint, and V17 restates it again in SQL
  // to refuse an installation the engine could not serve. Three copies of one
  // rule, each of which would drift silently: a router that accepts what the
  // engine rejects writes rows and then fails, and a migration that accepts
  // what the engine rejects waves through the lockout it exists to prevent. So
  // all three are asked the same addresses and have to agree on every one.
  const { isEngineAddressable } = await import("./auth-router.ts");
  const { auth } = await import("./better-auth.ts");
  const expression = await v17AddressExpression();

  for (const [address, valid] of ADDRESSES) {
    assertEquals(isEngineAddressable(address), valid, `router: ${address}`);

    // This is a real sign-in attempt, which is the point — the engine's actual
    // answer, not a re-reading of its source. Every address above is therefore
    // chosen so that no installation can hold it: against a developer's own
    // DATABASE_URL an address somebody owns would make this a password attempt
    // on their account, logged by the engine as one. A well-formed address
    // reaches "no such user" and a malformed one is refused before the lookup;
    // either way it throws, and the code says which question it answered.
    const refusal = await auth.api.signInEmail({
      body: { email: address, password: "long-enough-password" },
    }).then(() => null, (err: { body?: { code?: string } }) => err.body?.code);
    assertEquals(refusal !== "INVALID_EMAIL", valid, `engine: ${address}`);

    // `!~` is what V17 writes, so a true here means "V17 would name this row".
    const { rows } = await pool.query(`SELECT ($1::text !~ $2::text) AS refused`, [
      address,
      expression,
    ]);
    assertEquals(rows[0].refused, !valid, `V17: ${address}`);
  }
  // The address V2 seeds into every installation, asserted against the predicate
  // alone: if a stock install could not migrate, V17's refusal would be a trap
  // rather than a warning. Not put through the loop above, because that loop
  // signs in for real and this is an address somebody actually holds.
  assertEquals(isEngineAddressable("admin@trex.local"), true);

  // Guard against the loop silently doing nothing.
  assertEquals(ADDRESSES.length, 14);
});

cutoverTest("PUT /user refuses an address that would lock the account out", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);
  const before = await pool.query(`SELECT email FROM trexdb."user" WHERE id = $1`, [user.id]);

  // The back door V17 and /signup both close: an authenticated user could set
  // an address the engine cannot resolve and never sign in again, one request
  // after the migration refused to allow that state to exist.
  const refused = await request(
    "PUT",
    `${url}/user`,
    { email: "ops@localhost" },
    await bearer(user),
  );
  assertEquals(refused.status, 422);
  assertEquals(await refused.json(), {
    error: "validation_failed",
    error_description: "Email must be a valid address",
  });
  assertEquals(
    (await pool.query(`SELECT email FROM trexdb."user" WHERE id = $1`, [user.id])).rows[0].email,
    before.rows[0].email,
  );

  // A well-formed address still behaves exactly as it did: 200, the row written
  // with the spelling that was sent, and the account still able to sign in.
  const moved = uniqueEmail("Moved");
  const accepted = await request("PUT", `${url}/user`, { email: moved }, await bearer(user));
  assertEquals(accepted.status, 200);
  assertEquals((await accepted.json()).email, moved);
  assertEquals(
    (await pool.query(`SELECT email FROM trexdb."user" WHERE id = $1`, [user.id])).rows[0].email,
    moved,
  );
  const signedIn = await grant(url, moved, PASSWORD);
  assertEquals(signedIn.status, 200);
  await signedIn.text();
});

Deno.test("a password that is not a string is a credential failure, not a throw", async () => {
  // scrypt throws on anything but a string or a buffer. That throw now leaves
  // verifyPassword — it is how an infrastructure failure becomes a visible 500
  // rather than a silent 401 — so the one case that is merely a malformed body
  // has to be answered before it reaches scrypt.
  const stored = await hashPassword(PASSWORD);
  assertEquals(await verifyPassword(12345 as unknown as string, stored), false);
  assertEquals(await verifyPassword(PASSWORD, 12345 as unknown as string), false);
  assertEquals(await verifyPassword(PASSWORD, "no-colon-here"), false);
  assertEquals(await verifyPassword(PASSWORD, stored), true);
});
