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
      const server = app.listen(0);
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

// ── Verification failures are the caller's, or nobody's ─────────────────────

cutoverTest("an engine failure is a 500, not a wrong password", async ({ url, pool }) => {
  const user = await createLegacyUser(pool);

  // A failure inside the engine — here its session insert, the same shape as a
  // scrypt or a connection failure — must not come back as invalid_grant. That
  // was the old swallow: a broken installation told every user their password
  // was wrong, and the logs said the same.
  await pool.query(
    `CREATE FUNCTION trexdb.cutover_break_session() RETURNS trigger LANGUAGE plpgsql AS
       $fn$ BEGIN RAISE EXCEPTION 'cutover: session store unavailable'; END $fn$`,
  );
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
