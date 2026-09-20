// The MCP sso-save tool's own write path.
//
// `trexdb.save_sso_provider` writes "clientId" and "clientSecret", and
// @better-auth/sso reads both out of the serialized "oidcConfig" rather than
// out of the columns — so a secret rotated through this tool is honoured by
// trex's own router and, without the refresh this file pins, silently ignored
// by the plugin. The provider keeps authenticating with the old credential and
// nothing looks broken.
//
// Pinned here rather than in federation/admin.test.ts because admin.test.ts can
// only reach `refreshProviderOidcConfig` directly; it cannot show that the tool
// calls it. That distinction is the one a test named after a path it does not
// exercise hides.
//
// Gated on DATABASE_URL and dynamically imported for the same reason
// federation/admin.test.ts is: db.ts throws at module load without one, so a
// static import would fail the file before `ignore` could skip it.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";

const dbUrl = Deno.env.get("DATABASE_URL");

// deno-lint-ignore no-explicit-any
type Handler = (args: any) => Promise<any>;
// deno-lint-ignore no-explicit-any
type PgTestClient = any;

/**
 * registerSsoTools' handlers are closures it never returns, so the only way to
 * reach one is to be the server it registers against. A recorder is enough: the
 * real McpServer contributes nothing the handler reads.
 */
async function ssoTool(name: string): Promise<Handler> {
  const { registerSsoTools } = await import("./sso.ts");
  const tools = new Map<string, Handler>();
  const server = {
    tool: (n: string, _d: string, _s: unknown, fn: Handler) => tools.set(n, fn),
    // deno-lint-ignore no-explicit-any
  } as any;
  registerSsoTools(server);
  const handler = tools.get(name);
  if (!handler) throw new Error(`${name} is no longer registered`);
  return handler;
}

async function withDb(fn: (db: PgTestClient, id: string) => Promise<void>) {
  const { Client } = await import("npm:pg");
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  const id = `mcp_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  try {
    await fn(db, id);
  } finally {
    await db.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
    await db.end();
  }
}

const dbTest = (name: string, fn: (db: PgTestClient, id: string) => Promise<void>) =>
  Deno.test({ name: `[db] ${name}`, ignore: !dbUrl, fn: () => withDb(fn) });

async function providerRow(db: PgTestClient, id: string) {
  const { rows } = await db.query(
    `SELECT "displayName", "clientId", "clientSecret", "oidcConfig"
       FROM trexdb.sso_provider WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

const config = (row: { oidcConfig: string | null }) =>
  row.oidcConfig == null ? null : JSON.parse(row.oidcConfig);

dbTest("sso-save keeps the plugin's copy of a rotated secret in step", async (db, id) => {
  // A provider configured for federation through /admin/federation, then
  // edited through the MCP tool — which is the only way the two writers meet.
  const { upsertProvider } = await import("../../auth/federation/admin-store.ts");
  const { parseProviderUpsert } = await import("../../auth/federation/admin-policy.ts");
  await upsertProvider(
    db,
    parseProviderUpsert(id, {
      displayName: "Logto",
      clientId: "cid",
      clientSecret: "sec",
      issuer: "https://logto.internal:3001/oidc",
    })!,
  );
  assertEquals(config(await providerRow(db, id)).clientSecret, "sec");

  const save = await ssoTool("sso-save");
  const result = await save({
    id,
    displayName: "Logto",
    clientId: "cid2",
    clientSecret: "rotated",
    enabled: true,
  });
  assertEquals(result.isError, undefined);

  const row = await providerRow(db, id);
  assertEquals({ clientId: row.clientId, clientSecret: row.clientSecret }, {
    clientId: "cid2",
    clientSecret: "rotated",
  });
  assertEquals({ clientId: config(row).clientId, clientSecret: config(row).clientSecret }, {
    clientId: "cid2",
    clientSecret: "rotated",
  });
});

dbTest("sso-save leaves a provider with no issuer without a configuration", async (db, id) => {
  // Every row this tool can create: save_sso_provider writes five columns and
  // issuer is not one of them, so the result is configuration in progress
  // rather than a provider. Inventing a configuration around a NULL issuer
  // would produce a row the plugin resolves and then fails on.
  const save = await ssoTool("sso-save");
  const result = await save({
    id,
    displayName: "Half configured",
    clientId: "cid",
    clientSecret: "sec",
    enabled: false,
  });
  assertEquals(result.isError, undefined);
  const row = await providerRow(db, id);
  assertEquals(row.oidcConfig, null);
  assertEquals(row.clientId, "cid");
});

dbTest("a save whose configuration write fails changes nothing", async (db, id) => {
  // The two statements commit together or neither does. Without the
  // transaction the columns move and the plugin's copy does not, which is the
  // stale-provider state the refresh exists to prevent — arrived at by the
  // failure of the very code meant to prevent it.
  const { upsertProvider } = await import("../../auth/federation/admin-store.ts");
  const { parseProviderUpsert } = await import("../../auth/federation/admin-policy.ts");
  await upsertProvider(
    db,
    parseProviderUpsert(id, {
      displayName: "Logto",
      clientId: "cid",
      clientSecret: "sec",
      issuer: "https://logto.internal:3001/oidc",
    })!,
  );

  const save = await ssoTool("sso-save");
  await db.query(
    `ALTER TABLE trexdb.sso_provider DROP CONSTRAINT IF EXISTS ct_refuse_oidc_config`,
  );
  // Refuses exactly the rebuild, and nothing the INSERT/UPDATE above it does:
  // the new configuration carries clientId 'cid3', the stored one does not.
  await db.query(
    `ALTER TABLE trexdb.sso_provider ADD CONSTRAINT ct_refuse_oidc_config
       CHECK ("oidcConfig" NOT LIKE '%cid3%')`,
  );
  try {
    const result = await save({
      id,
      displayName: "Renamed",
      clientId: "cid3",
      clientSecret: "rotated",
      enabled: true,
    });
    assertEquals(result.isError, true);
    assertStringIncludes(result.content[0].text, "ct_refuse_oidc_config");

    const row = await providerRow(db, id);
    assertEquals(
      {
        displayName: row.displayName,
        clientId: row.clientId,
        configClientId: config(row).clientId,
      },
      { displayName: "Logto", clientId: "cid", configClientId: "cid" },
    );

    // And the pooled connection is not left sitting in an aborted
    // transaction. Rolling back and releasing with the error are two guards
    // for one hazard — either alone is enough, which is why removing just the
    // ROLLBACK changes no behaviour — but with neither, the next caller to be
    // handed this connection gets "current transaction is aborted" for a
    // statement that has nothing wrong with it. That next caller is what this
    // asserts.
    const second = `${id}_next`;
    try {
      const ok = await save({
        id: second,
        displayName: "Unrelated",
        clientId: "cid",
        clientSecret: "sec",
        enabled: false,
      });
      assertEquals(ok.isError, undefined, JSON.stringify(ok));
    } finally {
      await db.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [second]);
    }
  } finally {
    await db.query(
      `ALTER TABLE trexdb.sso_provider DROP CONSTRAINT IF EXISTS ct_refuse_oidc_config`,
    );
  }
});
