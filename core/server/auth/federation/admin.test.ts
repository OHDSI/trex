import { assertEquals, assertRejects } from "jsr:@std/assert";
import { type LinkRequest, parseLinkRequest, parseProviderUpsert } from "./admin-policy.ts";
import {
  linkIdentity,
  refreshProviderOidcConfig,
  setProviderEnabled,
  upsertProvider,
} from "./admin-store.ts";
import { PLACEHOLDER_EMAIL_DOMAIN } from "./providers.ts";

const validProvider = {
  displayName: "Logto", clientId: "cid", clientSecret: "sec",
  issuer: "https://logto.internal:3001/oidc",
  authorizationEndpoint: "https://d2e.test/oidc/auth",
};

Deno.test("parseProviderUpsert fills defaults and keeps the id from the path", () => {
  assertEquals(parseProviderUpsert("logto", validProvider), {
    id: "logto", displayName: "Logto", clientId: "cid", clientSecret: "sec",
    issuer: "https://logto.internal:3001/oidc", discoveryUrl: null,
    authorizationEndpoint: "https://d2e.test/oidc/auth", scopes: "openid profile email",
    groupsSource: "none", groupsClaim: null, autoProvision: false, enabled: true,
  });
});

Deno.test("parseProviderUpsert refuses bad ids, missing fields and unknown groups sources", () => {
  assertEquals(parseProviderUpsert("Logto", validProvider), null);
  assertEquals(parseProviderUpsert("logto", { ...validProvider, clientSecret: "" }), null);
  assertEquals(parseProviderUpsert("logto", { ...validProvider, issuer: undefined }), null);
  assertEquals(parseProviderUpsert("logto", { ...validProvider, groupsSource: "ldap" }), null);
  assertEquals(parseProviderUpsert("logto", "nope"), null);
});

Deno.test("parseLinkRequest trims, lower-cases the email and defaults banned to false", () => {
  assertEquals(
    parseLinkRequest({ providerId: "logto", accountId: " abc ", email: " Admin@D2E.local " }),
    { providerId: "logto", accountId: "abc", email: "admin@d2e.local", name: null, banned: false, userId: null },
  );
  for (const body of [null, {}, { providerId: "logto", accountId: "a" },
                      { providerId: "logto", accountId: "a", email: "no-at-sign" }]) {
    assertEquals(parseLinkRequest(body), null, JSON.stringify(body));
  }
});

const linkBody = { providerId: "logto", accountId: "abc", email: "a@x.test" };

Deno.test("parseLinkRequest treats an absent or blank userId as none", () => {
  for (const userId of [undefined, null, "", "   "]) {
    assertEquals(parseLinkRequest({ ...linkBody, userId })?.userId, null, JSON.stringify(userId));
  }
});

Deno.test("parseLinkRequest keeps a well-formed userId, trimmed", () => {
  assertEquals(parseLinkRequest({ ...linkBody, userId: " x1y2z3a4b5c6 " })?.userId, "x1y2z3a4b5c6");
  assertEquals(
    parseLinkRequest({ ...linkBody, userId: "0b7e2d7c-4a1f-4c4e-9b8a-2f6d3c1e5a90" })?.userId,
    "0b7e2d7c-4a1f-4c4e-9b8a-2f6d3c1e5a90",
  );
  assertEquals(parseLinkRequest({ ...linkBody, userId: "A_b-9" })?.userId, "A_b-9");
  assertEquals(parseLinkRequest({ ...linkBody, userId: "a".repeat(128) })?.userId, "a".repeat(128));
});

Deno.test("parseLinkRequest rejects the whole request for a malformed userId", () => {
  for (const userId of ["has space", "semi;colon", "slash/id", "dot.id", "ümlaut", "a".repeat(129), 12345, true, {}]) {
    assertEquals(parseLinkRequest({ ...linkBody, userId }), null, JSON.stringify(userId));
  }
});

// A scripted pg client: each query is matched by a substring and answered in
// order, and every statement is recorded so the test can assert what ran.
function fakeClient(script: Array<[string, unknown[]]>) {
  const ran: string[] = [];
  const params: unknown[][] = [];
  return {
    ran,
    params,
    query(sql: string, p?: unknown[]) {
      ran.push(sql.replace(/\s+/g, " ").trim());
      params.push(p ?? []);
      const i = script.findIndex(([needle]) => sql.includes(needle));
      if (i === -1) return Promise.resolve({ rows: [], rowCount: 0 });
      const [, rows] = script.splice(i, 1)[0];
      return Promise.resolve({ rows, rowCount: rows.length });
    },
  };
}

const link: LinkRequest = {
  providerId: "logto", accountId: "logto-1", email: "a@x.test", name: "A", banned: false, userId: null,
};

Deno.test("linkIdentity reports an existing link without writing", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["FROM trexdb.account a", [{ userId: "u1", disabled: false }]],
  ]);
  assertEquals(await linkIdentity(c, link), { userId: "u1", outcome: "already_linked" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
});

Deno.test("linkIdentity links to the trex user holding the email", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["lower(email) = lower($1)", [{ id: "u2" }]],
  ]);
  assertEquals(await linkIdentity(c, link), { userId: "u2", outcome: "linked" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT INTO trexdb.account")), true);
  assertEquals(c.ran.at(-1), "COMMIT");
});

Deno.test("linkIdentity creates a password-less user when nobody holds the email", async () => {
  const c = fakeClient([["FROM trexdb.sso_provider", [{ id: "logto" }]]]);
  const result = await linkIdentity(c, link);
  assertEquals("outcome" in result && result.outcome, "created");
  assertEquals(c.ran.some((s) => s.startsWith('INSERT INTO trexdb."user"')), true);
});

Deno.test("linkIdentity refuses an email already linked to another account at the provider", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["lower(email) = lower($1)", [{ id: "u3" }]],
    ['"userId" = $1 AND "providerId" = $2', [{ accountId: "logto-other" }]],
  ]);
  assertEquals(await linkIdentity(c, link), { conflict: true, userId: "u3" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
  assertEquals(c.ran.at(-1), "ROLLBACK");
});

// One of the six routes that write a login address (all enumerated on
// isEngineAddressable), and the one a migration drives: it runs AFTER V17 has
// refused the installations the engine cannot serve, in bulk, and used to
// create the user regardless.
Deno.test("linkIdentity refuses to create a user under an address the engine cannot serve", async () => {
  const c = fakeClient([["FROM trexdb.sso_provider", [{ id: "logto" }]]]);
  // Single-label domain: parseLinkRequest accepts it (it has an @), the engine
  // does not — the same shape an IDP__INITIAL_USER__DOMAIN of "localhost" makes.
  assertEquals(
    await linkIdentity(c, { ...link, email: "a@localhost" }),
    { unaddressableEmail: true, email: "a@localhost" },
  );
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
  // Refused before the lookup, not after it: the address is not a key either.
  assertEquals(c.ran.some((s) => s.includes("lower(email) = lower($1)")), false);
  assertEquals(c.ran.at(-1), "ROLLBACK");
});

Deno.test("linkIdentity refuses an unservable address on the id-pinned create too", async () => {
  const c = fakeClient([["FROM trexdb.sso_provider", [{ id: "logto" }]]]);
  assertEquals(
    await linkIdentity(c, { ...link, email: "a@localhost", userId: "u9" }),
    { unaddressableEmail: true, email: "a@localhost" },
  );
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
});

// Idempotence: a migration re-run over identities it already created must not
// start failing them. This branch never reads the address, so it never judges it.
Deno.test("linkIdentity still links to an existing user pinned by id whatever the address says", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["WHERE id = $1 FOR UPDATE", [{ id: "u4", deletedAt: null }]],
  ]);
  assertEquals(
    await linkIdentity(c, { ...link, email: "a@localhost", userId: "u4" }),
    { userId: "u4", outcome: "linked" },
  );
  assertEquals(c.ran.some((s) => s.startsWith("INSERT INTO trexdb.account")), true);
  assertEquals(c.ran.at(-1), "COMMIT");
});

Deno.test("linkIdentity bans the linked user when asked", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["FROM trexdb.account a", [{ userId: "u1", disabled: false }]],
  ]);
  await linkIdentity(c, { ...link, banned: true });
  assertEquals(c.ran.some((s) => s.startsWith('UPDATE trexdb."user" SET banned = true')), true);
});

// M-T3: a rollback that itself fails must not replace the real error — same
// rule router.ts's /callback already follows (`.catch(() => {})` around its
// ROLLBACK). Without the guard, linkIdentity would throw "rollback also
// failed" instead of the actual write failure that triggered the rollback.
Deno.test("linkIdentity surfaces the original error even when its ROLLBACK also fails", async () => {
  const c = {
    ran: [] as string[],
    query(sql: string, _params?: unknown[]) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      c.ran.push(trimmed);
      if (trimmed.includes("FROM trexdb.sso_provider")) {
        return Promise.resolve({ rows: [{ id: "logto" }], rowCount: 1 });
      }
      if (trimmed.includes("FROM trexdb.account a")) {
        return Promise.resolve({ rows: [{ userId: "u1", disabled: false }], rowCount: 1 });
      }
      if (trimmed.startsWith('UPDATE trexdb."user" SET banned')) {
        return Promise.reject(new Error("banned update failed"));
      }
      if (trimmed === "ROLLBACK") {
        return Promise.reject(new Error("rollback also failed"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  let caught: unknown;
  try {
    await linkIdentity(c, { ...link, banned: true });
  } catch (err) {
    caught = err;
  }
  assertEquals((caught as Error)?.message, "banned update failed");
  assertEquals(c.ran.at(-1), "ROLLBACK");
});

Deno.test("linkIdentity refuses an unknown provider", async () => {
  const c = fakeClient([]);
  assertEquals(await linkIdentity(c, link), { unknownProvider: true });
});

Deno.test("linkIdentity takes the advisory lock right after BEGIN, before the link check", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["FROM trexdb.account a", [{ userId: "u1", disabled: false }]],
  ]);
  await linkIdentity(c, link);
  const beginIdx = c.ran.indexOf("BEGIN");
  const lockIdx = c.ran.findIndex((s) => s.startsWith("SELECT pg_advisory_xact_lock"));
  const linkCheckIdx = c.ran.findIndex((s) => s.includes("FROM trexdb.account a"));
  assertEquals(beginIdx !== -1 && lockIdx === beginIdx + 1 && linkCheckIdx > lockIdx, true);
});

Deno.test("linkIdentity locks the matched email row so a concurrent link on the same email serializes", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["lower(email) = lower($1)", [{ id: "u2" }]],
  ]);
  await linkIdentity(c, link);
  assertEquals(c.ran.some((s) => s.includes('lower(email) = lower($1)') && s.includes("FOR UPDATE")), true);
});

Deno.test("upsertProvider writes every federation column in one statement", async () => {
  const c = fakeClient([["FROM trexdb.sso_provider WHERE id", [{
    clientId: "cid", clientSecret: "sec", issuer: "https://logto.internal:3001/oidc",
    discovery_url: null, authorization_endpoint: null, scopes: "openid profile",
    claim_map: {},
  }]], ["UPDATE trexdb.sso_provider", [{ id: "logto" }]]]);
  await upsertProvider(c, parseProviderUpsert("logto", validProvider)!);
  const insert = c.ran.find((s) => s.includes("INSERT INTO trexdb.sso_provider"))!;
  assertEquals(insert.includes("ON CONFLICT (id) DO UPDATE"), true);
  assertEquals(insert.includes("authorization_endpoint"), true);
});

Deno.test("upsertProvider writes the row and its oidcConfig in one transaction", async () => {
  // A row written with a stale or absent oidcConfig is the state this exists to
  // prevent: trex's own router would honour it and the plugin could not. So the
  // two writes commit together or neither does.
  const c = fakeClient([["FROM trexdb.sso_provider WHERE id", [{
    clientId: "cid", clientSecret: "sec", issuer: "https://logto.internal:3001/oidc",
    discovery_url: null, authorization_endpoint: null, scopes: "openid profile",
    claim_map: {},
  }]], ["UPDATE trexdb.sso_provider", [{ id: "logto" }]]]);
  await upsertProvider(c, parseProviderUpsert("logto", validProvider)!);
  assertEquals(c.ran[0], "BEGIN");
  assertEquals(c.ran[c.ran.length - 1], "COMMIT");
  assertEquals(c.ran.some((s) => s.includes('SET "oidcConfig"')), true);
});

Deno.test("upsertProvider rolls back when the oidcConfig write matches no row", async () => {
  // Under a role trexdb.sso_provider's RLS policy applies to, an UPDATE returns
  // zero rows and raises nothing. Committing the INSERT anyway would leave a
  // provider the plugin cannot use and report success.
  const c = fakeClient([["FROM trexdb.sso_provider WHERE id", [{
    clientId: "cid", clientSecret: "sec", issuer: "https://x.test",
    discovery_url: null, authorization_endpoint: null, scopes: "openid", claim_map: {},
  }]]]);
  await assertRejects(
    () => upsertProvider(c, parseProviderUpsert("logto", validProvider)!),
    Error,
    "may not write this table",
  );
  assertEquals(c.ran[c.ran.length - 1], "ROLLBACK");
});

Deno.test("setProviderEnabled reports whether the provider exists", async () => {
  assertEquals(await setProviderEnabled(fakeClient([["UPDATE trexdb.sso_provider", [{ id: "logto" }]]]), "logto", false), true);
  assertEquals(await setProviderEnabled(fakeClient([]), "logto", false), false);
});

// ── linkIdentity with a caller-chosen user id (scripted client) ─────────────

const pinned = { ...link, userId: "x1y2z3a4b5c6" };

Deno.test("linkIdentity with userId reports an existing link to that same user", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["FROM trexdb.account a", [{ userId: "x1y2z3a4b5c6", disabled: false }]],
  ]);
  assertEquals(await linkIdentity(c, pinned), { userId: "x1y2z3a4b5c6", outcome: "already_linked" });
  assertEquals(c.ran.at(-1), "COMMIT");
});

Deno.test("linkIdentity with userId refuses an account already linked to a different user", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["FROM trexdb.account a", [{ userId: "someone-else", disabled: false }]],
  ]);
  assertEquals(await linkIdentity(c, { ...pinned, banned: true }), { conflict: true, userId: "someone-else" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT") || s.startsWith("UPDATE")), false);
  assertEquals(c.ran.at(-1), "ROLLBACK");
});

Deno.test("linkIdentity with userId attaches to the live user holding that id, under a row lock", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["WHERE id = $1 FOR UPDATE", [{ id: "x1y2z3a4b5c6", deletedAt: null }]],
  ]);
  assertEquals(await linkIdentity(c, pinned), { userId: "x1y2z3a4b5c6", outcome: "linked" });
  assertEquals(c.ran.some((s) => s.startsWith('INSERT INTO trexdb."user"')), false);
  assertEquals(c.ran.some((s) => s.startsWith("INSERT INTO trexdb.account")), true);
  // The id decides; the address is never consulted once the id matched.
  assertEquals(c.ran.some((s) => s.includes("lower(email)")), false);
});

Deno.test("linkIdentity with userId refuses a user already linked to another account at the provider", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["WHERE id = $1 FOR UPDATE", [{ id: "x1y2z3a4b5c6", deletedAt: null }]],
    ['"userId" = $1 AND "providerId" = $2', [{ accountId: "logto-other" }]],
  ]);
  assertEquals(await linkIdentity(c, pinned), { conflict: true, userId: "x1y2z3a4b5c6" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
  assertEquals(c.ran.at(-1), "ROLLBACK");
});

Deno.test("linkIdentity with userId refuses a soft-deleted user holding that id", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["WHERE id = $1 FOR UPDATE", [{ id: "x1y2z3a4b5c6", deletedAt: new Date() }]],
  ]);
  assertEquals(await linkIdentity(c, pinned), { conflict: true, userId: "x1y2z3a4b5c6" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
});

Deno.test("linkIdentity with userId refuses when a user with another id holds the email", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["lower(email) = lower($1)", [{ id: "random-uuid-user" }]],
  ]);
  assertEquals(await linkIdentity(c, pinned), { conflict: true, userId: "random-uuid-user" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
  assertEquals(c.ran.at(-1), "ROLLBACK");
});

Deno.test("linkIdentity with userId creates the user under exactly that id", async () => {
  const c = fakeClient([["FROM trexdb.sso_provider", [{ id: "logto" }]]]);
  assertEquals(await linkIdentity(c, pinned), { userId: "x1y2z3a4b5c6", outcome: "created" });
  const insert = c.ran.findIndex((s) => s.startsWith('INSERT INTO trexdb."user"'));
  assertEquals(c.params[insert][0], "x1y2z3a4b5c6");
  const account = c.ran.findIndex((s) => s.startsWith("INSERT INTO trexdb.account"));
  assertEquals(c.params[account][1], "x1y2z3a4b5c6");
});

Deno.test("linkIdentity with userId takes a per-user lock after the per-account lock", async () => {
  const c = fakeClient([["FROM trexdb.sso_provider", [{ id: "logto" }]]]);
  await linkIdentity(c, pinned);
  const locks = c.ran.flatMap((s, i) => s.startsWith("SELECT pg_advisory_xact_lock") ? [c.params[i][0]] : []);
  assertEquals(locks, ["logto:logto-1", "user:x1y2z3a4b5c6"]);
});

Deno.test("linkIdentity without userId neither takes the per-user lock nor looks users up by id", async () => {
  const c = fakeClient([["FROM trexdb.sso_provider", [{ id: "logto" }]]]);
  await linkIdentity(c, link);
  const locks = c.ran.filter((s) => s.startsWith("SELECT pg_advisory_xact_lock"));
  assertEquals(locks.length, 1);
  assertEquals(c.ran.some((s) => s.includes("WHERE id = $1 FOR UPDATE")), false);
  const insert = c.ran.findIndex((s) => s.startsWith('INSERT INTO trexdb."user"'));
  assertEquals(c.params[insert][0] !== "x1y2z3a4b5c6" && typeof c.params[insert][0], "string");
});

// ── linkIdentity against a real database ─────────────────────────────────────
// Gated on DATABASE_URL, like the agents migration tests: a database with the
// core trexdb schema (core/schema) applied, connected as a role that bypasses
// RLS. Every row these tests write is scoped to a per-run provider and removed
// afterwards.

const dbUrl = Deno.env.get("DATABASE_URL");

async function withDb(fn: (db: PgTestClient, ctx: DbCtx) => Promise<void>) {
  const { Client } = await import("npm:pg");
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const run = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const ctx: DbCtx = {
    providerId: `lt_${run}`,
    // 12 lowercase alphanumerics, the shape of a Logto user id.
    id: (n: number) => `${run}${String(n).padStart(2, "0")}`,
    email: (n: number) => `u${n}-${run}@link.test`,
  };
  await db.query(
    `INSERT INTO trexdb.sso_provider (id, "displayName", "clientId", "clientSecret", enabled)
     VALUES ($1, 'Link test', 'cid', 'sec', true)`,
    [ctx.providerId],
  );
  try {
    await fn(db, ctx);
  } finally {
    await db.query(
      `DELETE FROM trexdb."user" WHERE id LIKE $1 OR email LIKE $2
          OR id IN (SELECT "userId" FROM trexdb.account WHERE "providerId" = $3)`,
      [`${run}%`, `%-${run}@link.test`, ctx.providerId],
    );
    await db.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [ctx.providerId]);
    await db.end();
  }
}

// deno-lint-ignore no-explicit-any
type PgTestClient = any;
interface DbCtx {
  providerId: string;
  id: (n: number) => string;
  email: (n: number) => string;
}

async function insertUser(db: PgTestClient, id: string, email: string) {
  await db.query(`INSERT INTO trexdb."user" (id, name, email) VALUES ($1, $1, $2)`, [id, email]);
}

async function accountsOf(db: PgTestClient, providerId: string) {
  const { rows } = await db.query(
    `SELECT "accountId", "userId" FROM trexdb.account WHERE "providerId" = $1 ORDER BY "accountId"`,
    [providerId],
  );
  return rows;
}

const dbTest = (name: string, fn: (db: PgTestClient, ctx: DbCtx) => Promise<void>) =>
  Deno.test({ name: `[db] ${name}`, ignore: !dbUrl, fn: () => withDb(fn) });

const req = (ctx: DbCtx, n: number, extra: Partial<LinkRequest> = {}): LinkRequest => ({
  providerId: ctx.providerId, accountId: ctx.id(n), email: ctx.email(n), name: null,
  banned: false, userId: ctx.id(n), ...extra,
});

dbTest("linkIdentity creates a user whose id is exactly the requested one, then reports it linked", async (db, ctx) => {
  const r = req(ctx, 1);
  assertEquals(await linkIdentity(db, r), { userId: ctx.id(1), outcome: "created" });
  const { rows } = await db.query(`SELECT id, email FROM trexdb."user" WHERE id = $1`, [ctx.id(1)]);
  assertEquals(rows, [{ id: ctx.id(1), email: ctx.email(1) }]);
  assertEquals(await accountsOf(db, ctx.providerId), [{ accountId: ctx.id(1), userId: ctx.id(1) }]);

  assertEquals(await linkIdentity(db, r), { userId: ctx.id(1), outcome: "already_linked" });
  assertEquals(await accountsOf(db, ctx.providerId), [{ accountId: ctx.id(1), userId: ctx.id(1) }]);
});

dbTest("linkIdentity refuses to re-point an existing link at a different user id", async (db, ctx) => {
  await linkIdentity(db, req(ctx, 1));
  await insertUser(db, ctx.id(2), ctx.email(2));
  assertEquals(
    await linkIdentity(db, req(ctx, 1, { userId: ctx.id(2), email: ctx.email(2) })),
    { conflict: true, userId: ctx.id(1) },
  );
  assertEquals(await accountsOf(db, ctx.providerId), [{ accountId: ctx.id(1), userId: ctx.id(1) }]);
});

dbTest("linkIdentity attaches to an existing, unlinked user with the requested id", async (db, ctx) => {
  // The stored address differs on purpose: the id, not the address, decides.
  await insertUser(db, ctx.id(3), ctx.email(33));
  assertEquals(await linkIdentity(db, req(ctx, 3)), { userId: ctx.id(3), outcome: "linked" });
  assertEquals(await accountsOf(db, ctx.providerId), [{ accountId: ctx.id(3), userId: ctx.id(3) }]);
});

dbTest("linkIdentity refuses a user with the requested id already linked to another account", async (db, ctx) => {
  await linkIdentity(db, req(ctx, 4));
  assertEquals(
    await linkIdentity(db, req(ctx, 5, { userId: ctx.id(4) })),
    { conflict: true, userId: ctx.id(4) },
  );
  assertEquals(await accountsOf(db, ctx.providerId), [{ accountId: ctx.id(4), userId: ctx.id(4) }]);
});

dbTest("linkIdentity refuses when another user holds the email, and creates nobody", async (db, ctx) => {
  const other = crypto.randomUUID();
  await insertUser(db, other, ctx.email(6));
  try {
    assertEquals(await linkIdentity(db, req(ctx, 6)), { conflict: true, userId: other });
    const { rows } = await db.query(`SELECT id FROM trexdb."user" WHERE id = $1`, [ctx.id(6)]);
    assertEquals(rows, []);
    assertEquals(await accountsOf(db, ctx.providerId), []);
  } finally {
    await db.query(`DELETE FROM trexdb."user" WHERE id = $1`, [other]);
  }
});

dbTest("linkIdentity without userId keeps linking by email and minting a UUID", async (db, ctx) => {
  const created = await linkIdentity(db, req(ctx, 7, { userId: null }));
  assertEquals("outcome" in created && created.outcome, "created");
  const createdId = (created as { userId: string }).userId;
  assertEquals(/^[0-9a-f-]{36}$/.test(createdId), true);
  try {
    await insertUser(db, ctx.id(8), ctx.email(8));
    assertEquals(
      await linkIdentity(db, req(ctx, 8, { userId: null, accountId: "acct-8" })),
      { userId: ctx.id(8), outcome: "linked" },
    );
  } finally {
    await db.query(`DELETE FROM trexdb."user" WHERE id = $1`, [createdId]);
  }
});

dbTest("concurrent links asking for the same new id yield one user and one 409", async (db, ctx) => {
  const { Client } = await import("npm:pg");
  const second = new Client({ connectionString: dbUrl });
  await second.connect();
  try {
    const results = await Promise.all([
      linkIdentity(db, req(ctx, 9)),
      linkIdentity(second, req(ctx, 10, { userId: ctx.id(9), email: ctx.email(9) })),
    ]);
    const outcomes = results.map((r) => "outcome" in r ? r.outcome : "conflict" in r ? "conflict" : "other").sort();
    assertEquals(outcomes, ["conflict", "created"]);
    const { rows } = await db.query(`SELECT count(*)::int AS n FROM trexdb."user" WHERE id = $1`, [ctx.id(9)]);
    assertEquals(rows[0].n, 1);
    assertEquals((await accountsOf(db, ctx.providerId)).length, 1);
  } finally {
    await second.end();
  }
});

dbTest("a pre-linked user with a 12-character id signs in end to end", async (db, ctx) => {
  if (!Deno.env.get("TREX_ROOT_KEY")) {
    Deno.env.set("TREX_ROOT_KEY", btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i))));
  }
  // Imported here, not at the top: db.ts refuses to load without DATABASE_URL,
  // and every test above has to run without one. The express-based modules go
  // through a computed specifier so the type check does not follow them:
  // auth-router.ts does not type-check on its own (untyped express handlers),
  // and that must not fail this whole file.
  const runtimeImport = (spec: string) => import(spec.startsWith(".") ? new URL(spec, import.meta.url).href : spec);
  const { resolveFederatedUser } = await import("./providers.ts");
  const { createTokenResponse, authRouter } = await runtimeImport("../auth-router.ts");
  const express = (await runtimeImport("express")).default;
  const { verifyAccessToken } = await import("../jwt.ts");

  const id = ctx.id(11);
  assertEquals(/^[a-z0-9]{12}$/.test(id), true);
  assertEquals(await linkIdentity(db, req(ctx, 11, { accountId: "logto-sub-11" })), { userId: id, outcome: "created" });

  // First sign-in at /callback resolves through the link to the same id.
  const decision = await resolveFederatedUser(
    db,
    { id: ctx.providerId, linkPolicy: "none", autoProvision: false } as unknown as Parameters<typeof resolveFederatedUser>[1],
    { sub: "logto-sub-11", email: ctx.email(11), emailVerified: true },
  );
  assertEquals(decision, { action: "link", userId: id });

  // The session /callback issues: access token `sub` and the refresh token row.
  const { rows: [row] } = await db.query(
    `SELECT id, name, email, image, role, banned, "emailVerified", email_confirmed_at,
            last_sign_in_at, "mustChangePassword", user_metadata, app_metadata,
            password_hash, "createdAt", "updatedAt"
       FROM trexdb."user" WHERE id = $1`,
    [id],
  );
  const session = await createTokenResponse(row);
  assertEquals((await verifyAccessToken(session.access_token))?.sub, id);
  assertEquals(session.user.id, id);
  const refresh = await db.query(`SELECT "userId" FROM trexdb.refresh_token WHERE "userId" = $1`, [id]);
  assertEquals(refresh.rows.length, 1);

  // GoTrue-compatible GET /user with that token.
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
  try {
    const port = (server.address() as { port: number }).port;
    const res = await fetch(`http://127.0.0.1:${port}/user`, {
      headers: { authorization: `Bearer ${session.access_token}` },
    });
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.id, id);
    assertEquals(body.email, ctx.email(11));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // The OIDC half of this test went with the provider it exercised. It pinned
  // that a 12-character id survives an authorization code and an id_token, both
  // of which the hand-written provider stored in tables of its own (V15 had to
  // widen oidc_authorization_code.user_id to TEXT for it).
  // @better-auth/oauth-provider keeps codes in trexdb.verification and tokens in
  // trexdb."oauthRefreshToken", neither of which types the subject any
  // differently from trexdb."user".id — and driving a code out of the plugin
  // needs a mounted provider, a seeded client and a session, which is
  // auth/oidc/soft-delete.test.ts's business rather than this file's. What this
  // test is actually about is the link, and everything above asserts it.

  // auth.uid() is what RLS policies compare row owners against.
  await db.query("BEGIN");
  try {
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id })]);
    const { rows: [uid] } = await db.query(`SELECT auth.uid() AS uid`);
    assertEquals(uid.uid, id);
  } finally {
    await db.query("ROLLBACK");
  }

  const { pool } = await runtimeImport("../../db.ts");
  await pool.end();
});

// ── Placeholder-domain addresses on the migration's own path ────────────────
//
// The rehearsal's finding: this route cannot reach provisionUser's synthesis
// branch (parseLinkRequest requires an '@'), so a migration with no address to
// give sends `<username>@<its configured domain>` — byte-identical to
// PLACEHOLDER_EMAIL_DOMAIN at d2e's default. 66 of 69 users landed that way,
// unflagged and "verified".

dbTest("a link carrying a placeholder-domain address creates a flagged, unverified row", async (db, ctx) => {
  const email = `${ctx.id(7)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
  const r = req(ctx, 7, { email });

  assertEquals(await linkIdentity(db, r), { userId: ctx.id(7), outcome: "created" });
  const { rows } = await db.query(
    `SELECT "emailVerified", is_placeholder_email, email_confirmed_at
       FROM trexdb."user" WHERE id = $1`,
    [ctx.id(7)],
  );
  assertEquals(rows, [{
    emailVerified: false,
    is_placeholder_email: true,
    email_confirmed_at: null,
  }]);

  // AND THE MIGRATION STILL WORKS. A re-run resolves by (providerId,
  // accountId), which is consulted before any address lookup, so flagging the
  // row it created cannot make its own second pass fail.
  assertEquals(await linkIdentity(db, r), { userId: ctx.id(7), outcome: "already_linked" });
});

// The other half of "it must not break the migration": the address lookup.
// findLinkCandidateByEmail (the SIGN-IN path) excludes flagged rows — that is
// the protection this fix restores — but linkIdentity has its own unfiltered
// lookup, so an administrator pre-linking an already-flagged row still matches.
dbTest("the admin link path still matches a flagged placeholder row by address", async (db, ctx) => {
  const email = `${ctx.id(8)}@${PLACEHOLDER_EMAIL_DOMAIN}`;
  await db.query(
    `INSERT INTO trexdb."user" (id, name, email, "emailVerified", is_placeholder_email)
     VALUES ($1, $1, $2, false, true)`,
    [ctx.id(8), email],
  );

  assertEquals(
    await linkIdentity(db, req(ctx, 8, { email, userId: null })),
    { userId: ctx.id(8), outcome: "linked" },
  );
});

// Narrowness: an ordinary address is untouched. Without this the two above are
// satisfied by flagging everything, which would mark every migrated user
// unverified and unlinkable-by-address on the sign-in path.
dbTest("an ordinary address still creates an unflagged, verified row", async (db, ctx) => {
  assertEquals(await linkIdentity(db, req(ctx, 9)), { userId: ctx.id(9), outcome: "created" });
  const { rows } = await db.query(
    `SELECT "emailVerified", is_placeholder_email FROM trexdb."user" WHERE id = $1`,
    [ctx.id(9)],
  );
  assertEquals(rows, [{ emailVerified: true, is_placeholder_email: false }]);
});


// ── oidcConfig: the column V20 added and nothing wrote ──────────────────────
//
// @better-auth/sso reads its whole per-provider configuration out of
// sso_provider."oidcConfig", while trex's own router reads the source columns.
// V20 backfilled the column once and asserted a synchronisation property that
// no code provided, so these pin the writer: a provider created through the
// admin API must be usable by the plugin, and an edited one must not go stale.

async function oidcConfigOf(db: PgTestClient, id: string) {
  const { rows } = await db.query(
    `SELECT "oidcConfig" FROM trexdb.sso_provider WHERE id = $1`,
    [id],
  );
  const raw = rows[0]?.oidcConfig;
  return raw == null ? null : JSON.parse(raw);
}

const upsertBody = (over: Record<string, unknown> = {}) => ({
  displayName: "Logto",
  clientId: "cid",
  clientSecret: "sec",
  issuer: "https://logto.internal:3001/oidc",
  ...over,
});

dbTest("a provider created through the admin API is usable by the plugin", async (db, ctx) => {
  // withDb seeds the row with no issuer, so this call is the create-through-
  // -upsert the admin API actually makes.
  await upsertProvider(db, parseProviderUpsert(ctx.providerId, upsertBody())!);
  const config = await oidcConfigOf(db, ctx.providerId);
  assertEquals(
    {
      issuer: config.issuer,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      discoveryEndpoint: config.discoveryEndpoint,
      mapping: config.mapping,
    },
    {
      issuer: "https://logto.internal:3001/oidc",
      clientId: "cid",
      clientSecret: "sec",
      discoveryEndpoint: "https://logto.internal:3001/oidc/.well-known/openid-configuration",
      mapping: { email: "sub", emailVerified: "email_verified", name: "name" },
    },
  );
});

dbTest("an edited provider does not go stale in the plugin's copy", async (db, ctx) => {
  // The worse of the two failures, because nothing looks broken: trex's router
  // honours the rotated secret and the new authorize URL, and the plugin keeps
  // authenticating with the old ones.
  await upsertProvider(db, parseProviderUpsert(ctx.providerId, upsertBody())!);
  await upsertProvider(
    db,
    parseProviderUpsert(ctx.providerId, upsertBody({
      clientSecret: "rotated",
      issuer: "https://logto.internal:3001/oidc2",
      authorizationEndpoint: "https://d2e.test/oidc/auth",
      scopes: "openid profile",
    }))!,
  );
  const config = await oidcConfigOf(db, ctx.providerId);
  assertEquals(
    {
      clientSecret: config.clientSecret,
      issuer: config.issuer,
      authorizationEndpoint: config.authorizationEndpoint,
      scopes: config.scopes,
    },
    {
      clientSecret: "rotated",
      issuer: "https://logto.internal:3001/oidc2",
      authorizationEndpoint: "https://d2e.test/oidc/auth",
      scopes: ["openid", "profile"],
    },
  );
});

dbTest("the configuration is built from the stored row, not from the payload", async (db, ctx) => {
  // claim_map is in no writer's payload — ProviderUpsert has no field for it —
  // and it decides mapping.email, which is the only thing standing between a
  // username-only upstream and the plugin's missing_user_info refusal. A
  // configuration computed from the request body would silently reset it to
  // "sub" on the next edit.
  await db.query(
    `UPDATE trexdb.sso_provider SET claim_map = '{"email":"username","name":"display_name"}'::jsonb
      WHERE id = $1`,
    [ctx.providerId],
  );
  await upsertProvider(db, parseProviderUpsert(ctx.providerId, upsertBody())!);
  assertEquals((await oidcConfigOf(db, ctx.providerId)).mapping, {
    email: "username",
    emailVerified: "email_verified",
    name: "display_name",
  });
});

dbTest("a provider with no issuer is left without a configuration", async (db, ctx) => {
  // V1's save_sso_provider writes five columns and issuer is not one of them,
  // so the rows it creates are configuration in progress rather than
  // providers — loadProviders already excludes them, and inventing a
  // configuration around a NULL issuer would produce a row the plugin resolves
  // and then fails on.
  assertEquals(await refreshProviderOidcConfig(db, ctx.providerId), false);
  assertEquals(await oidcConfigOf(db, ctx.providerId), null);
});

dbTest("the rebuild picks up an edit save_sso_provider made", async (db, ctx) => {
  // Named for what it does. This calls save_sso_provider and then the rebuild
  // ITSELF, so it pins that the rebuild reads the columns that function wrote —
  // and pins nothing at all about whether anybody calls it. The tool that has
  // to is covered where it lives, in mcp/tools/sso.test.ts; a test named for
  // that path while supplying the call by hand would hide exactly the defect
  // that mattered.
  //
  // The MCP sso-save tool rotates clientId and clientSecret through this
  // function, and both are read by the plugin out of the serialized
  // configuration rather than out of the columns.
  await upsertProvider(db, parseProviderUpsert(ctx.providerId, upsertBody())!);
  await db.query(`SELECT trexdb.save_sso_provider($1, 'Logto', 'cid2', 'rotated', true)`, [
    ctx.providerId,
  ]);
  assertEquals((await oidcConfigOf(db, ctx.providerId)).clientSecret, "sec");

  assertEquals(await refreshProviderOidcConfig(db, ctx.providerId), true);
  const config = await oidcConfigOf(db, ctx.providerId);
  assertEquals({ clientId: config.clientId, clientSecret: config.clientSecret }, {
    clientId: "cid2",
    clientSecret: "rotated",
  });
});

dbTest("an unknown provider is reported rather than written around", async (db) => {
  assertEquals(await refreshProviderOidcConfig(db, "no_such_provider"), false);
});
