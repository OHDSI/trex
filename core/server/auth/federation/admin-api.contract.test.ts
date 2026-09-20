// d2e PR #3358 drives these three routes to migrate its Logto users, and this
// phase rewrites what they write underneath them. admin.test.ts pins
// parseProviderUpsert, parseLinkRequest, linkIdentity, upsertProvider and
// setProviderEnabled as units against a scripted fake client — it never goes
// through express and never asserts a status code or a response body, so a
// rewrite of the store had no way to prove it changed nothing on the wire.
//
// Every test here asserts the literal envelope: the exact status and the exact
// object, never a shape the response happens to satisfy. A shape assertion is
// satisfied by a replacement that renames a field, and a status assertion that
// does not differ from its neighbours' is satisfied by a route that answers the
// same thing to everything. Each case below is therefore paired with at least
// one sibling that takes a different branch of the same handler.
//
// These tests need a real Postgres carrying trexdb at V19: admin-api.ts imports
// ../../db.ts, which opens a pool at module evaluation and throws without
// DATABASE_URL. A mocked pool would pin the mock rather than the wire format,
// so the whole file is gated on DATABASE_URL and skips without one.
//
// TWO THINGS TO KNOW BEFORE REUSING startFederationAdminServer (task 9 does):
//
//  1. pinRootKey() sets TREX_ROOT_KEY on the *process* and never restores it.
//     That is deliberate and matches auth-router.contract.test.ts — keys.test.ts
//     deletes the variable and both key caches are module-level, so a suite that
//     restored it would be re-broken by whichever file ran next. A test that
//     needs a different root key has to re-pin it itself.
//  2. adminLimiter (middleware/rate-limit.ts) is a module singleton with an
//     in-memory 5000-per-15-minutes bucket keyed on the client IP, and every
//     harness server in the process shares it because they all answer on
//     127.0.0.1. Requests carrying a service-role bearer are skipped
//     (isServiceRoleBearer), so the bulk of this file costs nothing; requests
//     carrying an admin's own bearer, or none at all, do count. Keep those few.
//
// DELIBERATELY NOT PINNED: an unknown subpath and an unsupported verb both
// answer express's own `404 text/html` ("Cannot DELETE /trex/admin/federation/
// providers/x"). That is a property of the mount, not of federationAdminRouter,
// and it would answer the same for any router; pinning it here would pin
// express's default handler under this file's name.
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import express from "express";
import { _resetRootKeyCache } from "../keys.ts";
import { _resetJwtSecretCache, generateServiceRoleKey, signAccessToken } from "../jwt.ts";

// ── Harness ─────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type PgPool = any;
// deno-lint-ignore no-explicit-any
type Json = any;

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived signing key is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

/**
 * keys.test.ts deletes TREX_ROOT_KEY and both caches are module-level, so every
 * test re-pins the root key rather than trusting whatever ran before it. It has
 * to be set before anything derives a secret from it, which is why it happens
 * here and not at import time.
 */
function pinRootKey() {
  _resetRootKeyCache();
  _resetJwtSecretCache();
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
}

/**
 * Boots the real federationAdminRouter on an ephemeral port against the test
 * database, mounted exactly as index.ts:202 mounts it.
 *
 * admin-api.ts is imported dynamically: ../../db.ts throws at module evaluation
 * when DATABASE_URL is unset, which would take the whole file down even though
 * every test in it is skipped in that case.
 *
 * listen(0, "127.0.0.1"), never listen(0): a wildcard bind can be handed a port
 * another local service already answers on, and the test's own fetch then talks
 * to that service instead. That was a ~2% random failure in phase 1, and it was
 * misdiagnosed twice before the bind was found.
 */
export async function startFederationAdminServer(): Promise<
  { url: string; close: () => Promise<void> }
> {
  const { federationAdminRouter } = await import("./admin-api.ts");
  const app = express();
  app.use("/trex/admin/federation", federationAdminRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/trex/admin/federation`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function getPool(): Promise<PgPool> {
  return (await import("../../db.ts")).pool;
}

/** Every fixture is named so a crashed test cannot leak a row into the next. */
const TEST_DOMAIN = "@fedcontract.test";
const PROVIDER_PREFIX = "ct_";

async function purgeFixtures(pool: PgPool) {
  // account cascades from user (account_userId_fkey ON DELETE CASCADE), so the
  // user delete takes the links this file created with it.
  await pool.query(`DELETE FROM trexdb."user" WHERE email LIKE $1`, [`%${TEST_DOMAIN}`]);
  await pool.query(`DELETE FROM trexdb.sso_provider WHERE id LIKE $1`, [`${PROVIDER_PREFIX}%`]);
}

interface Ctx {
  url: string;
  pool: PgPool;
  /** A service-role bearer: what d2e's migration actually presents. */
  serviceRole: string;
}

/**
 * The pg pool is a singleton owned by ../../db.ts and deliberately outlives
 * every test, so the resource and op sanitizers would report it as a leak.
 */
function contractTest(name: string, fn: (c: Ctx) => Promise<void>) {
  Deno.test({
    name,
    ignore: !DATABASE_URL,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      pinRootKey();
      const pool = await getPool();
      await purgeFixtures(pool);
      const server = await startFederationAdminServer();
      try {
        await fn({ url: server.url, pool, serviceRole: await generateServiceRoleKey() });
      } finally {
        await server.close();
        await purgeFixtures(pool);
      }
    },
  });
}

// ── Request helpers ─────────────────────────────────────────────────────────

/**
 * One request. `token` is spelled out at every call site rather than defaulted,
 * because which credential a route accepts is part of what this file pins.
 */
function call(
  url: string,
  method: string,
  body: unknown,
  token: string | null,
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return fetch(url, { method, headers, body: JSON.stringify(body) });
}

/** Asserts a 204 and that it carries no body at all, not merely a falsy one. */
async function assertNoContent(res: Response) {
  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");
}

// ── Fixtures ────────────────────────────────────────────────────────────────

let seq = 0;
function uniqueSuffix(): string {
  seq += 1;
  return `${seq}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;
}

/** V1 CHECKs sso_provider.id against ^[a-z][a-z0-9_]*$, so ids are lower-snake. */
function providerId(): string {
  return `${PROVIDER_PREFIX}${uniqueSuffix()}`;
}

function uniqueEmail(label: string): string {
  return `fed-${label}-${uniqueSuffix()}${TEST_DOMAIN}`;
}

/** A user id in the shape parseLinkRequest accepts: ^[A-Za-z0-9_-]{1,128}$. */
function uniqueUserId(): string {
  return `ct-user-${uniqueSuffix()}`;
}

const providerBody = {
  displayName: "Logto",
  clientId: "cid",
  clientSecret: "sec",
  issuer: "https://logto.example.test/oidc",
};

/**
 * Every field the route accepts, each at a value that is not the default of
 * anything — not parseProviderUpsert's and not the column's.
 *
 * This exists because asserting the defaults is not enough to pin the INSERT.
 * V11 gives scopes, groups_source and auto_provision column defaults equal to
 * parseProviderUpsert's, and the three nullable columns default to NULL, so a
 * statement that dropped those five columns entirely would still read back
 * exactly what the defaults test asserts. clientId and clientSecret are not
 * read back there at all, and a swapped pair is invisible to every existing
 * test. Round-tripping non-default values is the only thing that distinguishes
 * "the binding is right" from "the column default happens to match".
 *
 * Each value is also distinct from every other, so a swapped pair of bindings
 * shows up as two wrong columns rather than cancelling out.
 */
const fullProviderBody = {
  displayName: "Logto Renamed Upstream",
  clientId: "client-id-value",
  clientSecret: "client-secret-value",
  issuer: "https://issuer.example.test/oidc",
  discoveryUrl: "https://discovery.example.test/.well-known/openid-configuration",
  authorizationEndpoint: "https://authorize.example.test/oidc/auth",
  scopes: "openid profile email groups offline_access",
  groupsSource: "claim",
  groupsClaim: "roles",
  autoProvision: true,
  enabled: false,
};

/** Asserts a row written from fullProviderBody, column by column. */
function assertFullProviderRow(row: Json, label: string) {
  assertEquals(row.displayName, fullProviderBody.displayName, `${label} displayName`);
  assertEquals(row.clientId, fullProviderBody.clientId, `${label} clientId`);
  assertEquals(row.clientSecret, fullProviderBody.clientSecret, `${label} clientSecret`);
  assertEquals(row.issuer, fullProviderBody.issuer, `${label} issuer`);
  assertEquals(row.discovery_url, fullProviderBody.discoveryUrl, `${label} discovery_url`);
  assertEquals(
    row.authorization_endpoint,
    fullProviderBody.authorizationEndpoint,
    `${label} authorization_endpoint`,
  );
  assertEquals(row.scopes, fullProviderBody.scopes, `${label} scopes`);
  assertEquals(row.groups_source, fullProviderBody.groupsSource, `${label} groups_source`);
  assertEquals(row.groups_claim, fullProviderBody.groupsClaim, `${label} groups_claim`);
  assertEquals(row.auto_provision, fullProviderBody.autoProvision, `${label} auto_provision`);
  // enabled:false is asserted here and enabled:true in the defaults test. Both
  // are needed: false is the column default, true is parseProviderUpsert's, so
  // either one alone is satisfied by a binding pinned to the other constant.
  assertEquals(row.enabled, fullProviderBody.enabled, `${label} enabled`);
}

/** Registers a provider through the route under test, so no fixture SQL drifts. */
async function seedProvider(c: Ctx, id = providerId()): Promise<string> {
  const res = await call(`${c.url}/providers/${id}`, "PUT", providerBody, c.serviceRole);
  assertEquals(res.status, 204, await res.text());
  await res.body?.cancel();
  return id;
}

async function seedUser(
  pool: PgPool,
  spec: { id?: string; email?: string; softDeleted?: boolean } = {},
): Promise<{ id: string; email: string }> {
  const id = spec.id ?? uniqueUserId();
  const email = spec.email ?? uniqueEmail("seed");
  await pool.query(
    `INSERT INTO trexdb."user" (id, name, email, "emailVerified", email_confirmed_at, role, "deletedAt")
     VALUES ($1, 'Contract User', $2, true, NOW(), 'user',
             CASE WHEN $3 THEN NOW() ELSE NULL END)`,
    [id, email, spec.softDeleted ?? false],
  );
  return { id, email };
}

async function readProvider(pool: PgPool, id: string): Promise<Json> {
  const { rows } = await pool.query(`SELECT * FROM trexdb.sso_provider WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

async function readUser(pool: PgPool, id: string): Promise<Json> {
  const { rows } = await pool.query(`SELECT * FROM trexdb."user" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Runs fn with a CHECK constraint that refuses one sentinel value, so the
 * route's own catch block is reached by a genuine query failure rather than by
 * a stubbed client. This is the only way to characterise the 500 envelope
 * without mocking the pool, which would pin the mock instead of the wire.
 */
async function withRefusingCheck(
  pool: PgPool,
  table: string,
  constraint: string,
  predicate: string,
  fn: () => Promise<void>,
) {
  // Dropped first as well as last: a crashed earlier run must not leave the
  // constraint behind and fail every later test with a spurious 500.
  await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
  await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK (${predicate})`);
  try {
    await fn();
  } finally {
    await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
  }
}

// ── PUT /providers/:id ──────────────────────────────────────────────────────

contractTest("PUT /providers/:id creates with 204 and no body, and updates the same id with 204", async (c) => {
  const id = providerId();

  const created = await call(`${c.url}/providers/${id}`, "PUT", providerBody, c.serviceRole);
  await assertNoContent(created);
  assertEquals((await readProvider(c.pool, id)).displayName, "Logto");

  // The second PUT must be the same envelope, not a 409: d2e's migration is
  // re-run against an installation that already has the provider.
  const updated = await call(
    `${c.url}/providers/${id}`,
    "PUT",
    { ...providerBody, displayName: "Logto Renamed" },
    c.serviceRole,
  );
  await assertNoContent(updated);
  assertEquals((await readProvider(c.pool, id)).displayName, "Logto Renamed");
});

contractTest("PUT /providers/:id with a bad id is 400 invalid_request", async (c) => {
  // Upper case fails ^[a-z][a-z0-9_]*$. Paired with the 204 above on the same
  // route and the same body, so this cannot pass against a handler that answers
  // 400 to everything.
  const res = await call(`${c.url}/providers/NotAnId`, "PUT", providerBody, c.serviceRole);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "invalid_request" });
});

contractTest("PUT /providers/:id is 400 invalid_request for each missing required field", async (c) => {
  for (const field of ["displayName", "clientId", "clientSecret", "issuer"]) {
    const body: Record<string, unknown> = { ...providerBody };
    delete body[field];
    const res = await call(`${c.url}/providers/${providerId()}`, "PUT", body, c.serviceRole);
    assertEquals(res.status, 400, field);
    assertEquals(await res.json(), { error: "invalid_request" }, field);
  }
  // The same id shape with the full body is a 204, so the 400s above are about
  // the missing field and not about the route.
  await assertNoContent(
    await call(`${c.url}/providers/${providerId()}`, "PUT", providerBody, c.serviceRole),
  );
});

contractTest("PUT /providers/:id is 400 invalid_request for a groupsSource outside claim|graph|none", async (c) => {
  const bad = await call(
    `${c.url}/providers/${providerId()}`,
    "PUT",
    { ...providerBody, groupsSource: "ldap" },
    c.serviceRole,
  );
  assertEquals(bad.status, 400);
  assertEquals(await bad.json(), { error: "invalid_request" });

  for (const groupsSource of ["claim", "graph", "none"]) {
    const id = providerId();
    const ok = await call(
      `${c.url}/providers/${id}`,
      "PUT",
      { ...providerBody, groupsSource, groupsClaim: "groups" },
      c.serviceRole,
    );
    await assertNoContent(ok);
    assertEquals((await readProvider(c.pool, id)).groups_source, groupsSource);
  }
});

contractTest("PUT /providers/:id writes parseProviderUpsert's defaults", async (c) => {
  const id = providerId();
  await assertNoContent(await call(`${c.url}/providers/${id}`, "PUT", providerBody, c.serviceRole));

  const row = await readProvider(c.pool, id);
  assertEquals(row.scopes, "openid profile email");
  assertEquals(row.groups_source, "none");
  assertEquals(row.auto_provision, false);
  assertEquals(row.enabled, true);
  assertEquals(row.discovery_url, null);
  assertEquals(row.authorization_endpoint, null);
  assertEquals(row.groups_claim, null);
  // Not a default: what the caller sent has to survive the same statement, or
  // "the defaults are right" would also be true of a handler that ignored the
  // body entirely.
  assertEquals(row.issuer, providerBody.issuer);
});

contractTest("PUT /providers/:id round-trips every field at a non-default value, on insert and on update", async (c) => {
  // Insert path.
  const fresh = providerId();
  await assertNoContent(await call(`${c.url}/providers/${fresh}`, "PUT", fullProviderBody, c.serviceRole));
  assertFullProviderRow(await readProvider(c.pool, fresh), "insert");

  // ON CONFLICT DO UPDATE path, over a row that currently holds the defaults —
  // so every assertion below is about the update having happened, not about the
  // row having been born that way.
  const existing = providerId();
  await assertNoContent(await call(`${c.url}/providers/${existing}`, "PUT", providerBody, c.serviceRole));
  const before = await readProvider(c.pool, existing);
  assertEquals(before.clientId, providerBody.clientId);

  await assertNoContent(await call(`${c.url}/providers/${existing}`, "PUT", fullProviderBody, c.serviceRole));
  const after = await readProvider(c.pool, existing);
  assertFullProviderRow(after, "update");
  assertEquals(after.createdAt.getTime(), before.createdAt.getTime());
  // updatedAt moves. Honest about what this pins: trexdb.sso_provider carries
  // a BEFORE UPDATE trigger (trg_sso_provider_updated_at), so the statement's
  // own `"updatedAt" = NOW()` is redundant and dropping it is NOT observable
  // here. What this does catch is a rewrite that stops going through the table,
  // or through the trigger, at all.
  assertEquals(after.updatedAt > before.updatedAt, true, "updatedAt advanced");
});

contractTest("PUT /providers/:id replaces the optional fields rather than merging them", async (c) => {
  // The ON CONFLICT clause assigns EXCLUDED unconditionally. A rewrite that
  // reached for COALESCE(EXCLUDED, stored) — which is what the sibling
  // upsertAccount does for refresh tokens, so it is a plausible mistake — would
  // make it impossible to ever clear a discovery URL or a groups claim through
  // this API, and no other test would notice.
  const id = providerId();
  await assertNoContent(await call(`${c.url}/providers/${id}`, "PUT", fullProviderBody, c.serviceRole));
  assertFullProviderRow(await readProvider(c.pool, id), "seed");

  await assertNoContent(await call(`${c.url}/providers/${id}`, "PUT", providerBody, c.serviceRole));
  const row = await readProvider(c.pool, id);
  assertEquals(row.discovery_url, null);
  assertEquals(row.authorization_endpoint, null);
  assertEquals(row.groups_claim, null);
  assertEquals(row.scopes, "openid profile email");
  assertEquals(row.groups_source, "none");
  assertEquals(row.auto_provision, false);
  assertEquals(row.enabled, true);
  assertEquals(row.clientId, providerBody.clientId);
  assertEquals(row.clientSecret, providerBody.clientSecret);
});

contractTest("PUT /providers/:id is 500 server_error when the write fails", async (c) => {
  const id = providerId();
  await withRefusingCheck(
    c.pool,
    "trexdb.sso_provider",
    "ct_refuse_display_name",
    `"displayName" <> '__force_500__'`,
    async () => {
      const res = await call(
        `${c.url}/providers/${id}`,
        "PUT",
        { ...providerBody, displayName: "__force_500__" },
        c.serviceRole,
      );
      assertEquals(res.status, 500);
      assertEquals(await res.json(), { error: "server_error" });
      assertEquals(await readProvider(c.pool, id), null);
    },
  );
  // The same request succeeds once the constraint is gone, so the 500 was the
  // failure and not the route.
  await assertNoContent(await call(`${c.url}/providers/${id}`, "PUT", providerBody, c.serviceRole));
});

// ── Authentication and authorisation ────────────────────────────────────────

contractTest("the admin routes are 401 not_authenticated without a bearer", async (c) => {
  const cases: Array<[string, string, unknown]> = [
    [`${c.url}/providers/${providerId()}`, "PUT", providerBody],
    [`${c.url}/providers/${providerId()}`, "PATCH", { enabled: false }],
    [`${c.url}/links`, "PUT", { providerId: "nope", accountId: "a", email: "a@x.test" }],
  ];
  for (const [url, method, body] of cases) {
    const res = await call(url, method, body, null);
    assertEquals(res.status, 401, `${method} ${url}`);
    assertEquals(await res.json(), { error: "not_authenticated" }, `${method} ${url}`);
  }
  // A body that PARSES AS JSON but means nothing is still 401, never 400: the
  // semantic parser (parseLinkRequest) runs behind requireAdmin, so a migration
  // that lost its token is told that rather than being told its body is wrong.
  //
  // This says nothing about express.json(), which is mounted AHEAD of the guard
  // (admin-api.ts:13, 36, 61) and is pinned separately below. An earlier version
  // of this comment claimed the guard ran before "the parser" full stop, which
  // is measurably false.
  const unparseable = await call(`${c.url}/links`, "PUT", { nonsense: true }, null);
  assertEquals(unparseable.status, 401);
  assertEquals(await unparseable.json(), { error: "not_authenticated" });
});

contractTest("syntactically malformed JSON is express's 400, ahead of the admin guard", async (c) => {
  // express.json() is mounted before requireAdmin, so a body it cannot parse is
  // refused by express itself and never reaches trex's envelope — with OR
  // without a credential. A migration client that sends a truncated body sees
  // text/html, not {"error":...}, and has to be ready for that.
  for (const token of [c.serviceRole, null]) {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token !== null) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${c.url}/providers/${providerId()}`, {
      method: "PUT",
      headers,
      body: "{not json",
    });
    assertEquals(res.status, 400, token === null ? "no bearer" : "service role");
    // The distinguishing fact, and the whole reason this is worth pinning: it is
    // NOT trex's JSON envelope, and with no bearer it is NOT the 401 either.
    assertEquals(res.headers.get("content-type"), "text/html; charset=utf-8");
    assertNotEquals(await res.text(), JSON.stringify({ error: "invalid_request" }));
  }
});

contractTest("a body sent without a JSON Content-Type is 400 invalid_request", async (c) => {
  // express.json() only parses when the Content-Type says JSON; otherwise it
  // leaves req.body empty and parseProviderUpsert refuses it. So a client that
  // forgets the header gets trex's own 400 rather than a parse error, and the
  // body it sent is silently ignored — the one failure mode here that looks
  // like a validation bug and is not.
  const body = JSON.stringify(providerBody);
  for (const contentType of [undefined, "text/plain"]) {
    const headers: Record<string, string> = { authorization: `Bearer ${c.serviceRole}` };
    if (contentType !== undefined) headers["Content-Type"] = contentType;
    const res = await fetch(`${c.url}/providers/${providerId()}`, { method: "PUT", headers, body });
    assertEquals(res.status, 400, String(contentType));
    assertEquals(await res.json(), { error: "invalid_request" }, String(contentType));
  }
});

contractTest("the admin routes are 403 forbidden for a non-admin token", async (c) => {
  const user = await signAccessToken({ id: "ct-nonadmin", email: "u@x.test", role: "user" }, "sess");
  const res = await call(`${c.url}/providers/${providerId()}`, "PUT", providerBody, user);
  assertEquals(res.status, 403);
  assertEquals(await res.json(), { error: "forbidden", error_description: "Admin access required" });

  // An admin's own token is accepted on the same route, so 403 is about the
  // role and not about anything else in the request.
  const admin = await signAccessToken({ id: "ct-admin", email: "a@x.test", role: "admin" }, "sess");
  await assertNoContent(await call(`${c.url}/providers/${providerId()}`, "PUT", providerBody, admin));
});

// ── PATCH /providers/:id ────────────────────────────────────────────────────

contractTest("PATCH /providers/:id is 204 and flips enabled", async (c) => {
  const id = await seedProvider(c);
  assertEquals((await readProvider(c.pool, id)).enabled, true);

  await assertNoContent(await call(`${c.url}/providers/${id}`, "PATCH", { enabled: false }, c.serviceRole));
  assertEquals((await readProvider(c.pool, id)).enabled, false);

  // Back on again: a handler that only ever wrote false would pass the first
  // half of this test.
  await assertNoContent(await call(`${c.url}/providers/${id}`, "PATCH", { enabled: true }, c.serviceRole));
  assertEquals((await readProvider(c.pool, id)).enabled, true);
});

contractTest("PATCH /providers/:id is 400 invalid_request for a non-boolean or absent enabled", async (c) => {
  const id = await seedProvider(c);
  for (const body of [{ enabled: "false" }, { enabled: 0 }, { enabled: null }, {}]) {
    const res = await call(`${c.url}/providers/${id}`, "PATCH", body, c.serviceRole);
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(await res.json(), { error: "invalid_request" }, JSON.stringify(body));
  }
  // Untouched: a 400 must not have written anything.
  assertEquals((await readProvider(c.pool, id)).enabled, true);
});

contractTest("PATCH /providers/:id is 404 unknown_provider for an id with no row", async (c) => {
  const res = await call(`${c.url}/providers/${providerId()}`, "PATCH", { enabled: false }, c.serviceRole);
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "unknown_provider" });

  // The identical request against a registered id is a 204, so 404 is about the
  // missing row rather than about the method.
  const id = await seedProvider(c);
  await assertNoContent(await call(`${c.url}/providers/${id}`, "PATCH", { enabled: false }, c.serviceRole));
});

// ── PUT /links ──────────────────────────────────────────────────────────────

contractTest("PUT /links is 200 created for a fresh userId, then already_linked on a repeat", async (c) => {
  const provider = await seedProvider(c);
  const userId = uniqueUserId();
  const email = uniqueEmail("created");
  const body = { providerId: provider, accountId: "logto-subject-1", email, userId };

  const first = await call(`${c.url}/links`, "PUT", body, c.serviceRole);
  assertEquals(first.status, 200);
  assertEquals(await first.json(), { userId, outcome: "created" });
  assertEquals((await readUser(c.pool, userId)).email, email);

  // Idempotent re-run, which is what a resumed migration does.
  const second = await call(`${c.url}/links`, "PUT", body, c.serviceRole);
  assertEquals(second.status, 200);
  assertEquals(await second.json(), { userId, outcome: "already_linked" });
});

contractTest("PUT /links is 200 linked for a userId that already exists", async (c) => {
  const provider = await seedProvider(c);
  const user = await seedUser(c.pool);
  const res = await call(`${c.url}/links`, "PUT", {
    providerId: provider,
    accountId: "logto-subject-2",
    email: user.email,
    userId: user.id,
  }, c.serviceRole);
  assertEquals(res.status, 200);
  // "linked", not "created": the outcome names what happened to the user row,
  // and a migration reports on that distinction.
  assertEquals(await res.json(), { userId: user.id, outcome: "linked" });

  const { rows } = await c.pool.query(
    `SELECT "userId" FROM trexdb.account WHERE "providerId" = $1 AND "accountId" = $2`,
    [provider, "logto-subject-2"],
  );
  assertEquals(rows.length, 1);
  assertEquals(rows[0].userId, user.id);
});

contractTest("PUT /links with no userId links to the live user holding the email", async (c) => {
  // resolveUserByEmail's "linked" branch, which nothing reached before: every
  // other link test sends a userId and goes through resolveRequestedUser. d2e
  // can observe this outcome, so it belongs in a wire contract.
  const provider = await seedProvider(c);
  const user = await seedUser(c.pool);
  const res = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-11", email: user.email.toUpperCase(),
  }, c.serviceRole);
  assertEquals(res.status, 200);
  // "linked", not "created": the address matched an existing row, case-
  // insensitively, and no user was minted for it.
  assertEquals(await res.json(), { userId: user.id, outcome: "linked" });

  const { rows } = await c.pool.query(
    `SELECT "userId" FROM trexdb.account WHERE "providerId" = $1 AND "accountId" = $2`,
    [provider, "logto-subject-11"],
  );
  assertEquals(rows.length, 1);
  assertEquals(rows[0].userId, user.id);
});

contractTest("PUT /links with no userId creates a user under a generated id, not the accountId", async (c) => {
  // The other half of resolveUserByEmail. The generated id is a UUID and is
  // deliberately NOT the upstream subject: a caller that wants the subject
  // preserved as the trex id — which is what d2e's migration wants, because
  // the id is the token `sub` — has to send userId, and this is the answer it
  // gets if it forgets.
  const provider = await seedProvider(c);
  const email = uniqueEmail("nouserid");
  const res = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-12", email,
  }, c.serviceRole);
  assertEquals(res.status, 200);
  const created = await res.json() as { userId: string; outcome: string };
  assertEquals(created.outcome, "created");
  assertEquals(Object.keys(created).sort(), ["outcome", "userId"]);
  assertNotEquals(created.userId, "logto-subject-12");
  assertEquals(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(created.userId),
    true,
    created.userId,
  );
  assertEquals((await readUser(c.pool, created.userId)).email, email);

  const repeat = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-12", email,
  }, c.serviceRole);
  assertEquals(repeat.status, 200);
  assertEquals(await repeat.json(), { userId: created.userId, outcome: "already_linked" });
});

contractTest("PUT /links with no userId is 409 when that user already has another account at the provider", async (c) => {
  // otherAccountConflict reached through the email path rather than through a
  // supplied userId. Same envelope as its sibling above, different branch: two
  // upstream subjects claiming one trex user is two people, and the migration
  // has to be told before the second one overwrites the first.
  const provider = await seedProvider(c);
  const user = await seedUser(c.pool);
  const first = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-13", email: user.email,
  }, c.serviceRole);
  assertEquals(first.status, 200);
  assertEquals(await first.json(), { userId: user.id, outcome: "linked" });

  const second = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-14", email: user.email,
  }, c.serviceRole);
  assertEquals(second.status, 409);
  assertEquals(await second.json(), { error: "conflict", userId: user.id });

  // The refused subject wrote nothing.
  const { rows } = await c.pool.query(
    `SELECT 1 FROM trexdb.account WHERE "providerId" = $1 AND "accountId" = $2`,
    [provider, "logto-subject-14"],
  );
  assertEquals(rows.length, 0);
});

contractTest("PUT /links is 409 conflict when the account is already linked to a different user", async (c) => {
  const provider = await seedProvider(c);
  const first = await seedUser(c.pool);
  const second = await seedUser(c.pool);
  const account = "logto-subject-3";

  const linked = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: account, email: first.email, userId: first.id,
  }, c.serviceRole);
  assertEquals(linked.status, 200);
  await linked.body?.cancel();

  const res = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: account, email: second.email, userId: second.id,
  }, c.serviceRole);
  assertEquals(res.status, 409);
  // The userId named is the INCUMBENT's, not the requested one — that is what
  // tells the migration which row to reconcile.
  assertEquals(await res.json(), { error: "conflict", userId: first.id });
  assertNotEquals(first.id, second.id);
});

contractTest("PUT /links is 409 conflict when the requested userId is soft-deleted", async (c) => {
  const provider = await seedProvider(c);
  const deleted = await seedUser(c.pool, { softDeleted: true });
  const res = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-4", email: uniqueEmail("sd"), userId: deleted.id,
  }, c.serviceRole);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "conflict", userId: deleted.id });

  // No account row was written for the refused link.
  const { rows } = await c.pool.query(
    `SELECT 1 FROM trexdb.account WHERE "providerId" = $1 AND "accountId" = $2`,
    [provider, "logto-subject-4"],
  );
  assertEquals(rows.length, 0);
});

contractTest("PUT /links is 409 conflict when another userId already holds the email", async (c) => {
  const provider = await seedProvider(c);
  const incumbent = await seedUser(c.pool);
  const requested = uniqueUserId();
  const res = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-5", email: incumbent.email, userId: requested,
  }, c.serviceRole);
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "conflict", userId: incumbent.id });
  assertEquals(await readUser(c.pool, requested), null);
});

contractTest("PUT /links is 404 unknown_provider for an unregistered providerId", async (c) => {
  const res = await call(`${c.url}/links`, "PUT", {
    providerId: providerId(), accountId: "logto-subject-6", email: uniqueEmail("np"),
  }, c.serviceRole);
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "unknown_provider" });

  // The same body against a registered provider is a 200, so the 404 is about
  // the provider row and not about the request.
  const provider = await seedProvider(c);
  const ok = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-6", email: uniqueEmail("np"),
  }, c.serviceRole);
  assertEquals(ok.status, 200);
  await ok.body?.cancel();
});

contractTest("PUT /links is 400 invalid_request for a bad email or a bad userId", async (c) => {
  const provider = await seedProvider(c);
  const bodies: Array<Record<string, unknown>> = [
    { providerId: provider, accountId: "a", email: "no-at-sign" },
    { providerId: provider, accountId: "a", email: uniqueEmail("bad"), userId: "has spaces" },
    { providerId: provider, accountId: "a", email: uniqueEmail("bad"), userId: "a".repeat(129) },
    { providerId: provider, accountId: "a", email: uniqueEmail("bad"), userId: 42 },
  ];
  for (const body of bodies) {
    const res = await call(`${c.url}/links`, "PUT", body, c.serviceRole);
    assertEquals(res.status, 400, JSON.stringify(body));
    assertEquals(await res.json(), { error: "invalid_request" }, JSON.stringify(body));
  }
});

contractTest("PUT /links is 422 unaddressable_email and names the address", async (c) => {
  // Not in the frozen list the phase brief repeats, but admin-api.ts answers it
  // and a bulk migration branches on it, so it is part of the wire contract.
  const provider = await seedProvider(c);
  const email = `a..b@fedcontract.test`;
  const res = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-7", email,
  }, c.serviceRole);
  assertEquals(res.status, 422);
  assertEquals(await res.json(), { error: "unaddressable_email", email });
});

contractTest("PUT /links with banned:true answers unchanged and bans the user", async (c) => {
  const provider = await seedProvider(c);
  const userId = uniqueUserId();
  const res = await call(`${c.url}/links`, "PUT", {
    providerId: provider,
    accountId: "logto-subject-8",
    email: uniqueEmail("banned"),
    userId,
    banned: true,
  }, c.serviceRole);
  assertEquals(res.status, 200);
  // Byte-identical to the unbanned answer: `banned` is not reflected back.
  assertEquals(await res.json(), { userId, outcome: "created" });
  assertEquals((await readUser(c.pool, userId)).banned, true);

  // Without the flag the same shape of request leaves the user unbanned, so the
  // assertion above is about `banned: true` and not about the default.
  const plain = uniqueUserId();
  const other = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-9", email: uniqueEmail("plain"), userId: plain,
  }, c.serviceRole);
  assertEquals(other.status, 200);
  await other.body?.cancel();
  assertEquals((await readUser(c.pool, plain)).banned, false);
});

contractTest("PUT /links is 500 server_error when the write fails", async (c) => {
  const provider = await seedProvider(c);
  const userId = uniqueUserId();
  const email = uniqueEmail("boom");
  await withRefusingCheck(
    c.pool,
    `trexdb."user"`,
    "ct_refuse_user_name",
    `name <> '__force_500__'`,
    async () => {
      const res = await call(`${c.url}/links`, "PUT", {
        providerId: provider, accountId: "logto-subject-10", email, userId, name: "__force_500__",
      }, c.serviceRole);
      assertEquals(res.status, 500);
      assertEquals(await res.json(), { error: "server_error" });
      // linkIdentity rolled back, so nothing is half-written.
      assertEquals(await readUser(c.pool, userId), null);
    },
  );
  const ok = await call(`${c.url}/links`, "PUT", {
    providerId: provider, accountId: "logto-subject-10", email, userId, name: "Fine",
  }, c.serviceRole);
  assertEquals(ok.status, 200);
  await ok.body?.cancel();
});
