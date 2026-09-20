// An email address identifies a mailbox, not a spelling, and every path that
// turns an address into an account has to agree about that. When they disagreed
// — /signup's duplicate check and V1's UNIQUE(email) case-sensitive, federation
// case-insensitive — the gap was an account takeover: with self-registration on
// an attacker registers `VICTIM@corp.com` while the victim holds
// `victim@corp.com`, and the victim's next federated sign-in lower-matches onto
// the attacker's row and links their verified upstream identity to it.
//
// These tests cover that attack from the ends that are still here: the index
// (V16) that stops the second row existing, and the placeholder scheme that
// cannot mint a case variant of an address it already holds.
//
// The lookup half moved. It pinned findLinkCandidateByEmail, which the cutover
// deleted; resolve-user.test.ts pins the same rule against resolveSsoUser and
// the real adapter — "the upstream address is matched case-insensitively", "a
// STORED address in mixed case is not matched, and that is fail-closed", "two
// live users on one address resolve to nobody", and the real-adapter
// "an upstream address in another case still resolves through the real
// adapter".
import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import { provisionUser } from "./federation/providers.ts";

// ── Against a real database ──────────────────────────────────────────────────
// Gated on DATABASE_URL like federation/admin.test.ts: a database with the core
// trexdb schema (core/schema, V16 and V17 included — V16 for the index under
// test, V17 for is_placeholder_email and email NOT NULL) applied, connected as
// a role that bypasses RLS. Every row written here is scoped to a per-run
// address suffix or id prefix and removed afterwards.

const dbUrl = Deno.env.get("DATABASE_URL");

interface DbCtx {
  run: string;
  /** `<local>-<run>@case.test`, unique to this run. */
  email: (local: string) => string;
}

// deno-lint-ignore no-explicit-any
type PgTestClient = any;

async function withDb(fn: (db: PgTestClient, ctx: DbCtx) => Promise<void>) {
  const { Client } = await import("npm:pg");
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const run = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const ctx: DbCtx = { run, email: (local) => `${local}-${run}@case.test` };
  try {
    await fn(db, ctx);
  } finally {
    await db.query(`DELETE FROM trexdb."user" WHERE lower(email) LIKE $1 OR id LIKE $2`, [
      `%-${run}@case.test`,
      `${run}%`,
    ]);
    await db.end();
  }
}

const dbTest = (name: string, fn: (db: PgTestClient, ctx: DbCtx) => Promise<void>) =>
  Deno.test({ name: `[db] ${name}`, ignore: !dbUrl, fn: () => withDb(fn) });

async function insertUser(db: PgTestClient, id: string, email: string) {
  await db.query(`INSERT INTO trexdb."user" (id, name, email) VALUES ($1, $1, $2)`, [id, email]);
}

/** An upstream that asserted no address — the identity provisionUser synthesises one for. */
const anonymous = (sub: string) => ({ sub, email: null, emailVerified: false });

dbTest("the database refuses a second account differing only by the case of its address", async (db, ctx) => {
  await insertUser(db, `${ctx.run}01`, ctx.email("victim"));

  // The attacker's registration, at the layer no application check can be
  // skipped past.
  const err = await assertRejects(
    () => insertUser(db, `${ctx.run}02`, ctx.email("victim").toUpperCase()),
    Error,
  );
  assertEquals((err as unknown as { code: string }).code, "23505");

  // A genuinely different address is untouched by the index.
  await insertUser(db, `${ctx.run}03`, ctx.email("someone"));
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM trexdb."user" WHERE lower(email) LIKE $1`,
    [`%-${ctx.run}@case.test`],
  );
  assertEquals(rows[0].n, 2);
});

// Users whose upstream asserted no address must still coexist: this index
// constrains one address to one account, not a whole population to one row.
//
// That population used to be the NULL emails V14 allowed, and lower(NULL) being
// NULL was what spared them. V17 ended it — Better Auth requires an address on
// every user, so the rows carry a synthesised `<slug>@d2e.local` and a
// `is_placeholder_email` flag instead of a NULL. Synthesised addresses are real
// addresses as far as this index is concerned, so the question is now a sharper
// one than V14's was, and it is the only place it is asked: can the scheme that
// mints them ever produce two that differ only by case, which the index would
// then reject?
//
// It cannot, and the reason is structural rather than lucky. placeholderLocalPart
// case-folds before it does anything else (`lower()` in V17's DO block, which
// placeholder-slug-parity.test.ts pins to it), so every minted local part is
// already lower-case and the domain is a lower-case constant. A case difference
// upstream therefore arrives as an *exact* collision, never a case variant — and
// synthesisePlaceholderEmail resolves an exact collision by changing which
// identifier it draws from, falling back to the user id, not by changing the
// spelling of one that is taken.
//
// Provisioned through the real code path rather than seeded, because the claim
// is about what that path can mint.
dbTest("placeholder-addressed users coexist, and the slug scheme cannot mint a case variant", async (db, ctx) => {
  // Two subjects that differ only in case. Whatever the upstream's convention,
  // these are the inputs that would produce `sub-x@d2e.local` and
  // `SUB-X@d2e.local` under any scheme that did not fold case first.
  const first = await provisionUser(db, anonymous(`Sub-${ctx.run}`), { id: `${ctx.run}11` });
  const second = await provisionUser(db, anonymous(`SUB-${ctx.run}`), { id: `${ctx.run}12` });

  const { rows } = await db.query(
    `SELECT id, email FROM trexdb."user"
      WHERE id = ANY($1) AND is_placeholder_email ORDER BY id`,
    [[first, second]],
  );

  // Both rows are there: the index did not reject the second, which is the
  // property V14's NULL emails used to stand for.
  assertEquals(rows.length, 2);

  // The first takes the subject's slug; the second finds it taken and falls
  // back to its own id. Asserted as values, not just as "different", because
  // "different" would also hold if the fallback had produced a case variant.
  assertEquals(rows[0].email, `sub-${ctx.run}@d2e.local`);
  assertEquals(rows[1].email, `${ctx.run}12@d2e.local`);

  // Why the index can never be the thing that stops a placeholder: every
  // address it sees from this path already equals its own case-folding, so no
  // two of them can collide on case alone without colliding outright.
  for (const r of rows) assertEquals(r.email, r.email.toLowerCase());

  // And the pair really is a pair under the index's own rule, not merely under
  // string equality.
  const { rows: folded } = await db.query(
    `SELECT count(DISTINCT lower(email))::int AS n FROM trexdb."user" WHERE id = ANY($1)`,
    [[first, second]],
  );
  assertEquals(folded[0].n, 2);
});

// The real-database lookup case that used to sit here — an upstream asserting
// the victim's address in another case resolving to the one account holding it
// — moved with findLinkCandidateByEmail to resolve-user.test.ts's "[db] an
// upstream address in another case still resolves through the real adapter",
// where it runs against the adapter that emits the query now. `=` on a text
// column is what that adapter sends, so the case has to stay a database case.

// One test rather than several for the HTTP surface: it ends by closing the
// shared pg pool that auth-router's `pool` holds, which no later test could
// then use.
dbTest("signup refuses a case variant, while sign-in and an address change accept one", async (db, ctx) => {
  if (!Deno.env.get("TREX_ROOT_KEY")) {
    Deno.env.set("TREX_ROOT_KEY", btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i))));
  }
  // The password grant must be the one under test, not a deployment's setting.
  Deno.env.delete("TREX_NATIVE_PASSWORD_LOGIN_ENABLED");

  // Imported here, not at the top: db.ts refuses to load without DATABASE_URL,
  // and the tests above have to run without one. The express-based modules go
  // through a computed specifier so the type check does not follow them —
  // auth-router.ts does not type-check on its own (untyped express handlers)
  // and that must not fail this whole file.
  const runtimeImport = (spec: string) =>
    import(spec.startsWith(".") ? new URL(spec, import.meta.url).href : spec);
  const { authRouter } = await runtimeImport("./auth-router.ts");
  const express = (await runtimeImport("express")).default;

  // Self-registration is the precondition the attack needs; restored after so a
  // developer's own database keeps whatever it had.
  const { rows: before } = await db.query(
    `SELECT value FROM trexdb.setting WHERE key = 'auth.selfRegistration'`,
  );
  await db.query(
    `INSERT INTO trexdb.setting (key, value) VALUES ('auth.selfRegistration', 'true'::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  );

  const app = express();
  app.use(authRouter);
  // Bound to the loopback rather than the wildcard. The ephemeral range contains
  // the port Postgres listens on, and a wildcard bind is allowed to take it
  // while Postgres holds 127.0.0.1 specifically — but that binding does not win
  // the traffic: BSD routes a connection to the most specific match, so
  // 127.0.0.1:<that port> still reaches Postgres. What breaks is this test's own
  // fetch, answered by Postgres, which makes nothing of an HTTP request and
  // closes the socket — "connection closed before message completed". Binding
  // the loopback turns the same collision into an EADDRINUSE nobody can miss.
  //
  // Awaited, because binding to a host resolves the address first and so is not
  // synchronous the way the wildcard bind was — server.address() is still null
  // when listen() returns.
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as { port: number }).port;
  const post = (path: string, body: unknown, token?: string) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });

  try {
    const password = "correct horse battery staple";
    const victim = ctx.email("victim");

    const signup = await post("/signup", { email: victim, password });
    assertEquals(signup.status, 200);
    const session = await signup.json();
    const victimId = session.user.id;

    // THE ATTACK. Same mailbox, different spelling, and the duplicate check
    // used to miss it.
    const attack = await post("/signup", { email: victim.toUpperCase(), password: "attacker password" });
    assertEquals(attack.status, 422);
    assertEquals((await attack.json()).error, "user_already_exists");
    const { rows: holders } = await db.query(
      `SELECT id FROM trexdb."user" WHERE lower(email) = lower($1)`,
      [victim],
    );
    assertEquals(holders, [{ id: victimId }]);

    // An unrelated address still registers: the fix is about one mailbox, not
    // about closing signup.
    assertEquals((await post("/signup", { email: ctx.email("newcomer"), password })).status, 200);

    // The victim signs in with their address typed in another case — the same
    // identity, so the same account.
    const signin = await post("/token?grant_type=password", { email: victim.toUpperCase(), password });
    assertEquals(signin.status, 200);
    const signedIn = await signin.json();
    assertEquals(signedIn.user.id, victimId);

    // A legitimate address change still works, and the stored spelling is the
    // one the user typed — the index folds case, it does not rewrite rows.
    const moved = ctx.email("Moved");
    const change = await fetch(`http://127.0.0.1:${port}/user`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${signedIn.access_token}` },
      body: JSON.stringify({ email: moved }),
    });
    assertEquals(change.status, 200);
    const { rows: after } = await db.query(`SELECT email FROM trexdb."user" WHERE id = $1`, [victimId]);
    assertEquals(after[0].email, moved);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (before.length > 0) {
      await db.query(
        `UPDATE trexdb.setting SET value = $1 WHERE key = 'auth.selfRegistration'`,
        [JSON.stringify(before[0].value)],
      );
    } else {
      await db.query(`DELETE FROM trexdb.setting WHERE key = 'auth.selfRegistration'`);
    }
    const { pool } = await import(new URL("../db.ts", import.meta.url).href);
    await pool.end();
  }
});
