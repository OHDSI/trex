// An email address identifies a mailbox, not a spelling, and every path that
// turns an address into an account has to agree about that. When they disagreed
// — /signup's duplicate check and V1's UNIQUE(email) case-sensitive, federation
// case-insensitive — the gap was an account takeover: with self-registration on
// an attacker registers `VICTIM@corp.com` while the victim holds
// `victim@corp.com`, and the victim's next federated sign-in lower-matches onto
// the attacker's row and links their verified upstream identity to it.
//
// These tests cover that attack from both ends: the lookup that used to miss
// the variant, and the index (V16) that now stops the second row existing.
import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import { findLinkCandidateByEmail, provisionUser, resolveFederatedUser } from "./federation/providers.ts";
import type { ProviderConfig } from "./federation/types.ts";

// deno-lint-ignore no-explicit-any
type AnyClient = any;

/** Records the SQL it is asked to run and answers the two lookups by shape. */
function stubClient(rows: { linked?: unknown[]; byEmail?: unknown[] }) {
  const ran: string[] = [];
  return {
    ran,
    // deno-lint-ignore no-explicit-any
    query(sql: string, _params: unknown[]): Promise<any> {
      ran.push(sql);
      if (sql.includes("FROM trexdb.account a")) return Promise.resolve({ rows: rows.linked ?? [] });
      if (sql.includes('FROM trexdb."user"')) return Promise.resolve({ rows: rows.byEmail ?? [] });
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

const provider = (): ProviderConfig =>
  ({
    id: "logto",
    autoProvision: true,
    emailDomainAllowlist: null,
    allowElevatedAutoLink: false,
  }) as unknown as ProviderConfig;

Deno.test("the link candidate lookup asks case-insensitively", async () => {
  const client = stubClient({ byEmail: [{ id: "u-1", role: "user" }] });
  await findLinkCandidateByEmail(client as AnyClient, "Victim@corp.com");
  assertStringIncludes(client.ran[0], "lower(email) = lower($1)");
});

// The state the takeover produced, on a database without V16's index: two live
// accounts answering to one address. Neither may be handed the identity.
Deno.test("two accounts holding one address refuse to resolve to either", async () => {
  const err = await assertRejects(
    () =>
      findLinkCandidateByEmail(
        stubClient({ byEmail: [{ id: "u-victim", role: "user" }, { id: "u-attacker", role: "user" }] }) as AnyClient,
        "victim@corp.com",
      ),
    Error,
  );
  // Names the address, because an operator has to find the pair to fix it.
  assertStringIncludes(err.message, "victim@corp.com");
});

Deno.test("an ambiguous address fails the federated sign-in instead of linking", async () => {
  await assertRejects(
    () =>
      resolveFederatedUser(
        stubClient({
          linked: [],
          byEmail: [{ id: "u-victim", role: "user" }, { id: "u-attacker", role: "user" }],
        }) as AnyClient,
        provider(),
        { sub: "upstream-sub", email: "victim@corp.com", emailVerified: true },
      ),
    Error,
  );
});

// A single match is still a link — the guard must not have made the ordinary
// case refuse.
Deno.test("one account holding the address still links", async () => {
  assertEquals(
    await resolveFederatedUser(
      stubClient({ linked: [], byEmail: [{ id: "u-victim", role: "user" }] }) as AnyClient,
      provider(),
      { sub: "upstream-sub", email: "VICTIM@corp.com", emailVerified: true },
    ),
    { action: "link", userId: "u-victim" },
  );
});

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

dbTest("the upstream address resolves to the one account holding it, in whatever case", async (db, ctx) => {
  await insertUser(db, `${ctx.run}21`, ctx.email("victim"));
  // What the identity provider asserts, spelled differently from what trex
  // stored. The legitimate link: same mailbox, same person, same account.
  assertEquals(
    await findLinkCandidateByEmail(db, ctx.email("victim").toUpperCase()),
    { id: `${ctx.run}21`, role: "user" },
  );
  assertEquals(await findLinkCandidateByEmail(db, ctx.email("nobody")), null);
});

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
  const server = app.listen(0);
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
