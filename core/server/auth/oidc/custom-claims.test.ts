// The claim set trex has always emitted, pinned against the plugin's callback
// shape.
//
// oidc/claims.ts's buildIdTokenClaims is deleted with the cutover, taking its
// own tests with it, so from then on these are the only thing standing between
// a refactor and a production sign-in failure: WebAPI reads its authorities out
// of `roles` (SECURITY_AUTH_OIDC_ROLESCLAIM=roles in docker-compose.yml) and
// d2e-compat's isSystemAdminClaims reads `trex_role`. Neither relying party is
// in this repository, so nothing else here would notice a rename.
//
// Gated on DATABASE_URL like the other auth suites: appRolesFor reads
// trexdb.user_role, which is the whole reason the callback exists — the plugin
// hands it a user and a scope list and nothing else.
import { assertEquals } from "jsr:@std/assert";

const DATABASE_URL = Deno.env.get("DATABASE_URL");

// ../../db.ts throws at module evaluation without DATABASE_URL, so the import
// is deferred rather than static.
const mod = DATABASE_URL
  ? {
    claims: await import("./custom-claims.ts"),
    db: await import("../../db.ts"),
  }
  : null;

interface Fixtures {
  /** Holds one application role. */
  withRoles: string;
  /** Holds none, so the roles claim has to come back empty rather than absent. */
  withoutRoles: string;
  /** The name that role carries, unique per run. */
  roleName: string;
}

/**
 * Real rows, because user_role."userId" is a foreign key to "user"(id) and the
 * query under test is a join: a fabricated id would exercise neither.
 *
 * Deleted in a finally, keyed on the run id, so a failure does not leave the
 * next run reading roles it did not seed.
 */
async function withFixtures(fn: (f: Fixtures) => Promise<void>): Promise<void> {
  const { pool } = mod!.db;
  const run = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const roleId = `claims-${run}-role`;
  // trexdb.role.name is UNIQUE (V1__initial_schema.sql:365-371), so inserting a
  // real role name — `role.systemadmin` — passes on a scratch CI database and
  // fails on any database that already carries it. The name is per-run for the
  // same reason the ids are.
  const roleName = `claims-${run}-role.systemadmin`;
  const f: Fixtures = {
    withRoles: `claims-${run}-a`,
    withoutRoles: `claims-${run}-b`,
    roleName,
  };
  try {
    for (const id of [f.withRoles, f.withoutRoles]) {
      await pool.query(`INSERT INTO trexdb."user" (id, name, email) VALUES ($1, $1, $2)`, [
        id,
        `${id}@claims.test`,
      ]);
    }
    await pool.query(`INSERT INTO trexdb.role (id, name) VALUES ($1, $2)`, [
      roleId,
      roleName,
    ]);
    await pool.query(`INSERT INTO trexdb.user_role ("userId", "roleId") VALUES ($1, $2)`, [
      f.withRoles,
      roleId,
    ]);
    await fn(f);
  } finally {
    // user_role goes with the user (ON DELETE CASCADE); the role does not.
    await pool.query(`DELETE FROM trexdb."user" WHERE id LIKE $1`, [`claims-${run}-%`]);
    await pool.query(`DELETE FROM trexdb.role WHERE id = $1`, [roleId]);
  }
}

/** The pg pool is a singleton owned by ../../db.ts, so the sanitizers see a leak. */
function test(name: string, fn: (f: Fixtures) => Promise<void>) {
  Deno.test({
    name: `[db] ${name}`,
    ignore: !mod,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => withFixtures(fn),
  });
}

/** What the plugin hands the callback: a Better Auth user plus trex's own columns. */
function user(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    email: "a@d2e.local",
    name: "A",
    role: "admin",
    emailVerified: true,
    app_metadata: {},
    ...over,
  };
}

test("the roles claim carries application roles, not the system role", async (f) => {
  const claims = await mod!.claims.idTokenClaims({
    user: user(f.withRoles),
    scopes: ["openid"],
  });
  assertEquals(claims.roles, [f.roleName]);
  assertEquals(claims.trex_role, "admin");
  assertEquals(claims.app_metadata, { trex_role: "admin" });
});

test("a user with no application roles carries an empty roles claim, not an absent one", async (f) => {
  // WebAPI maps the claim to Spring authorities; a missing claim and an empty
  // list are not the same thing to it.
  const claims = await mod!.claims.idTokenClaims({
    user: user(f.withoutRoles),
    scopes: ["openid"],
  });
  assertEquals(claims.roles, []);
  assertEquals("roles" in claims, true);
});

test("a user with no email carries neither email claim, even when scoped", async (f) => {
  const claims = await mod!.claims.idTokenClaims({
    user: user(f.withoutRoles, { email: null, name: null, role: "user", emailVerified: false }),
    scopes: ["openid", "email"],
  });
  assertEquals("email" in claims, false);
  assertEquals("email_verified" in claims, false);
});

test("email and name are emitted only under their own scopes", async (f) => {
  const unscoped = await mod!.claims.idTokenClaims({
    user: user(f.withoutRoles),
    scopes: ["openid"],
  });
  assertEquals("email" in unscoped, false);
  assertEquals("name" in unscoped, false);

  const scoped = await mod!.claims.idTokenClaims({
    user: user(f.withoutRoles),
    scopes: ["openid", "email", "profile"],
  });
  assertEquals(scoped.email, "a@d2e.local");
  assertEquals(scoped.email_verified, true);
  assertEquals(scoped.name, "A");
});

test("idp claims are emitted only under the idp_groups scope and only for a federated session", async (f) => {
  const federated = user(f.withoutRoles, {
    app_metadata: { idp: { provider: "logto", groups: ["g1"] } },
  });
  assertEquals(
    (await mod!.claims.idTokenClaims({ user: federated, scopes: ["openid"] })).idp_provider,
    undefined,
  );
  const scoped = await mod!.claims.idTokenClaims({
    user: federated,
    scopes: ["openid", "idp_groups"],
  });
  assertEquals(scoped.idp_provider, "logto");
  assertEquals(scoped.idp_groups, ["g1"]);

  // A native sign-in has no upstream to report, scope request notwithstanding.
  const native = user(f.withoutRoles, { app_metadata: {} });
  assertEquals(
    (await mod!.claims.idTokenClaims({ user: native, scopes: ["openid", "idp_groups"] }))
      .idp_provider,
    undefined,
  );
});

test("an access token carries the same claims as the id_token", async (f) => {
  // Today's provider mints one token and returns it as both, so the portal
  // decodes `roles` out of whichever it was handed.
  const scopes = ["openid", "profile", "email"];
  assertEquals(
    await mod!.claims.accessTokenClaims({ user: user(f.withRoles), scopes }),
    await mod!.claims.idTokenClaims({ user: user(f.withRoles), scopes }),
  );
});

test("a client_credentials token names a service, not a user", async (_f) => {
  // No end user exists on that grant, and `user` arrives null rather than
  // absent, so the null has to be handled as well as the undefined.
  for (const info of [{ scopes: ["trex:service"] }, { user: null, scopes: ["trex:service"] }]) {
    const claims = await mod!.claims.accessTokenClaims(info);
    assertEquals(claims.trex_role, "service");
    assertEquals(claims.app_metadata, { trex_role: "service" });
    // No client was named, so there are no roles to carry.
    assertEquals(claims.roles, []);
  }
});

test("a client_credentials token carries the CLIENT's roles", async (_f) => {
  // The regression this restores: the deleted router.ts emitted
  // `appRoles: client.clientRoles` here, seeded from TREX_OIDC_CLIENT_ROLES,
  // and a service token that authorizes as nobody loses every machine-to-machine
  // permission d2e's usermgmt relies on. The plugin hands the roles over in
  // `metadata`, which is parseClientMetadata(client.metadata).
  const claims = await mod!.claims.accessTokenClaims({
    user: null,
    scopes: ["trex:service"],
    metadata: { clientRoles: ["ALP_USER_ADMIN", "ALP_SYSTEM_ADMIN"] },
  });
  assertEquals(claims.roles, ["ALP_USER_ADMIN", "ALP_SYSTEM_ADMIN"]);
  assertEquals(claims.trex_role, "service");
});

test("a client with no roles, or metadata that is not a list, carries none", async (_f) => {
  // metadata is a free-form jsonb bag an operator can write by hand, so a
  // clientRoles that is not an array must not reach the token as one.
  for (const metadata of [undefined, null, {}, { clientRoles: null }, { clientRoles: "admin" }]) {
    const claims = await mod!.claims.accessTokenClaims({
      user: null,
      scopes: ["trex:service"],
      metadata: metadata as Record<string, unknown> | null,
    });
    assertEquals(claims.roles, []);
  }
});

test("userinfo carries trex_role and nothing the id_token does not", async (f) => {
  const info = await mod!.claims.userInfoClaims({
    user: user(f.withRoles),
    scopes: ["openid", "profile", "email"],
    jwt: {},
    requestedClaims: [],
  });
  assertEquals(info.trex_role, "admin");
  assertEquals(info.sub, f.withRoles);
  assertEquals(info.email, "a@d2e.local");
  assertEquals(info.email_verified, true);
  assertEquals(info.name, "A");
});

test("appRolesFor returns the names in a stable order", async (f) => {
  assertEquals(await mod!.claims.appRolesFor(f.withRoles), [f.roleName]);
  assertEquals(await mod!.claims.appRolesFor(f.withoutRoles), []);
  // An id that never existed reads the same as one with no roles: the callback
  // is handed whatever the plugin resolved and has no second chance to 404.
  assertEquals(await mod!.claims.appRolesFor("no-such-user"), []);
});
