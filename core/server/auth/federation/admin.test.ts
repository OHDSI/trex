import { assertEquals } from "jsr:@std/assert";
import { type LinkRequest, parseLinkRequest, parseProviderUpsert } from "./admin-policy.ts";
import { linkIdentity, setProviderEnabled, upsertProvider } from "./admin-store.ts";

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

// The fourth door onto trexdb."user". V17 refuses to migrate an installation
// the engine cannot serve, and /signup, /admin/create-user and PUT /user all
// refuse to create or set such an address — but this route runs AFTER V17, in
// bulk, driven by a migration, and used to create the user regardless.
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
  const c = fakeClient([]);
  await upsertProvider(c, parseProviderUpsert("logto", validProvider)!);
  assertEquals(c.ran.length, 1);
  assertEquals(c.ran[0].includes("ON CONFLICT (id) DO UPDATE"), true);
  assertEquals(c.ran[0].includes("authorization_endpoint"), true);
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
  const { issueCode, consumeCode } = await import("../oidc/codes.ts");
  const { buildIdTokenClaims } = await import("../oidc/claims.ts");

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

  // OIDC authorization code for the same user (V15 made user_id TEXT).
  const clientId = `link-test-${ctx.providerId}`;
  await db.query(
    `INSERT INTO trexdb.oidc_client (client_id, name, redirect_uris) VALUES ($1, 'link test', ARRAY['https://rp.test/cb'])`,
    [clientId],
  );
  try {
    const { code } = await issueCode({
      clientId, userId: id, redirectUri: "https://rp.test/cb", scope: "openid",
      nonce: null, codeChallenge: null, codeChallengeMethod: null,
    });
    const consumed = await consumeCode(code);
    assertEquals(consumed.ok && consumed.record.userId, id);
  } finally {
    // Codes cascade with their client.
    await db.query(`DELETE FROM trexdb.oidc_client WHERE client_id = $1`, [clientId]);
  }
  assertEquals(
    buildIdTokenClaims(
      { id, email: ctx.email(11), role: "user", appRoles: [] },
      { issuer: "https://trex.test", audience: clientId, scopes: ["openid"] },
    ).sub,
    id,
  );

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
