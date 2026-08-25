// deno test --no-check --allow-all plugins/devx/functions/routes/provider_config_routes.test.ts
//
// Exercises the write sites (INSERT, UPDATE) and the backfill route against a
// tiny in-memory fake of devx.provider_configs, so the two destructive
// failure modes this task warns about are checked without a live database:
//   1. a write ever leaving BOTH api_key and api_key_encrypted populated
//   2. an update that omits api_key blanking an existing credential
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { handleProviderConfigRoutes } from "./provider_config_routes.ts";
import { __resetMigrationCacheForTests, readProviderKey } from "../provider_key.ts";

const CORS = { "content-type": "application/json" };
const KEY = "0".repeat(64); // 32 bytes as hex, matches provider_key.test.ts

// assertProviderConfigEncryptionMigrated caches its probe result for the
// whole process (see provider_key.ts) — reset it so this file's first probe
// hits its own fake db below rather than inheriting cached state left over
// by another test file in the same `deno test` run.
__resetMigrationCacheForTests();

function req(method: string, body?: unknown) {
  return new Request("http://x/provider-configs", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// A minimal fake of devx.provider_configs (and, for the backfill, the
// caller's devx.settings row), driven off the literal query shapes
// provider_config_routes.ts issues today. Intimate with the SQL on purpose —
// it's a colocated white-box test, not a generic DB stub.
function makeFakeDb(
  seedRows: Record<string, unknown>[] = [],
  seedSettings: Record<string, unknown>[] = [],
) {
  const rows = seedRows.map((r) => ({ ...r }));
  const settingsRows = seedSettings.map((r) => ({ ...r }));
  const agentModelSelections: Record<string, unknown>[] = [];
  let nextId = rows.length + 1;
  const calls: Array<{ q: string; p: unknown[] }> = [];

  const sql = async (q: string, p: unknown[] = []) => {
    calls.push({ q, p });
    const nq = q.replace(/\s+/g, " ").trim();

    // --- activateDevxProviderConfig (IMPORTANT 3: PUT /activate now
    // delegates here so it stays in sync with agent_model_selection) ---

    if (nq.includes("SELECT id, provider, model FROM devx.provider_configs WHERE id = $1 AND user_id = $2")) {
      const [id, userId] = p;
      const row = rows.find((r) => r.id === id && r.user_id === userId);
      return { rows: row ? [{ id: row.id, provider: row.provider, model: row.model }] : [] };
    }
    if (nq.includes("UPDATE devx.provider_configs SET is_active = false WHERE user_id = $1")) {
      const [userId] = p;
      rows.forEach((r) => { if (r.user_id === userId) r.is_active = false; });
      return { rows: [] };
    }
    if (nq.includes("UPDATE devx.provider_configs SET is_active = true, updated_at = NOW() WHERE id = $1 AND user_id = $2")) {
      const [id, userId] = p;
      const row = rows.find((r) => r.id === id && r.user_id === userId);
      if (row) row.is_active = true;
      return { rows: [] };
    }
    if (nq.includes("UPDATE devx.settings SET provider = $1, model = $2, updated_at = NOW() WHERE user_id = $3")) {
      const [provider, model, userId] = p;
      let row = settingsRows.find((r) => r.user_id === userId);
      if (!row) { row = { user_id: userId }; settingsRows.push(row); }
      row.provider = provider;
      row.model = model;
      return { rows: [] };
    }
    if (nq.startsWith("INSERT INTO devx.agent_model_selection")) {
      // activateDevxProviderConfig's INSERT hardcodes agent='devx' as a SQL
      // literal (not a bound param), so it carries only 2 params
      // ([userId, providerConfigId]).
      const isDevxLiteral = nq.includes("'devx'");
      const [userId, agent, providerConfigId] = isDevxLiteral ? [p[0], "devx", p[1]] : p;
      const existing = agentModelSelections.find((s) => s.user_id === userId && s.agent === agent);
      if (existing) existing.provider_config_id = providerConfigId;
      else agentModelSelections.push({ user_id: userId, agent, provider_config_id: providerConfigId });
      return { rows: [] };
    }

    // Migration-applied probe (assertEncryptionMigrated) — simulate V15/V16
    // applied so every test below exercises real route behaviour, same as a
    // migrated deployment. The probed table arrives as $1.
    if (q.includes("information_schema.columns")) {
      return { rows: [{ column_name: "api_key_encrypted" }] };
    }

    // --- devx.settings (backfill only) ---

    if (q.includes("SELECT COUNT(*) as cnt FROM devx.settings WHERE user_id = $1")) {
      return { rows: [{ cnt: String(settingsRows.filter((r) => r.user_id === p[0]).length) }] };
    }

    // Matched on the FULL predicate, not a prefix: the "already encrypted
    // rows are skipped" guarantee lives in the route's WHERE clause, so if the
    // route ever drops `AND api_key_encrypted IS NULL` this must stop matching
    // and fall through to the throw below — not be re-applied in JS here,
    // which would prove only that the fake filters correctly.
    if (q.includes("SELECT api_key FROM devx.settings WHERE user_id = $1 AND api_key IS NOT NULL AND api_key_encrypted IS NULL")) {
      return {
        rows: settingsRows
          .filter((r) => r.user_id === p[0] && r.api_key != null && r.api_key_encrypted == null)
          .map((r) => ({ api_key: r.api_key })),
      };
    }

    // Same for the rewrite's own WHERE clause, which repeats the predicate to
    // close the read/write race.
    if (q.includes("UPDATE devx.settings") && q.includes("WHERE user_id = $4 AND api_key IS NOT NULL AND api_key_encrypted IS NULL")) {
      const [api_key, api_key_encrypted, api_key_iv, user_id] = p;
      const row = settingsRows.find(
        (r) => r.user_id === user_id && r.api_key != null && r.api_key_encrypted == null,
      );
      if (!row) return { rows: [] };
      row.api_key = api_key;
      row.api_key_encrypted = api_key_encrypted;
      row.api_key_iv = api_key_iv;
      return { rows: [{ user_id }] };
    }

    if (q.includes("INSERT INTO devx.provider_configs")) {
      const [user_id, provider, model, api_key, api_key_encrypted, api_key_iv, base_url, display_name] = p;
      const row = {
        id: String(nextId++),
        user_id, provider, model, api_key, api_key_encrypted, api_key_iv,
        base_url, display_name, is_active: false,
        created_at: "t0", updated_at: "t0",
      };
      rows.push(row);
      return { rows: [{ ...row }] };
    }

    // Backfill's per-row rewrite, matched including the race guard in its
    // WHERE clause (see the devx.settings equivalents above).
    if (q.includes("UPDATE devx.provider_configs") && q.includes("WHERE id = $4 AND user_id = $5 AND api_key IS NOT NULL AND api_key_encrypted IS NULL")) {
      const [api_key, api_key_encrypted, api_key_iv, id, user_id] = p;
      const row = rows.find(
        (r) => r.id === id && r.user_id === user_id && r.api_key != null && r.api_key_encrypted == null,
      );
      if (!row) return { rows: [] };
      row.api_key = api_key;
      row.api_key_encrypted = api_key_encrypted;
      row.api_key_iv = api_key_iv;
      return { rows: [{ id }] };
    }

    // PUT's dynamic UPDATE ... RETURNING (params: [configId, userId, ...dynamic set values in push order])
    if (q.includes("UPDATE devx.provider_configs SET") && q.includes("RETURNING id, user_id, provider, model, api_key")) {
      const [configId, userId, ...rest] = p;
      const row = rows.find((r) => r.id === configId && r.user_id === userId);
      if (!row) return { rows: [] };
      const setCols = [...q.matchAll(/(\w+) = \$\d+/g)].map((m) => m[1]).filter((c) => c !== "updated_at");
      setCols.forEach((col, i) => { (row as Record<string, unknown>)[col] = rest[i]; });
      row.updated_at = "t1";
      return { rows: [{ ...row }] };
    }

    if (q.includes("UPDATE devx.provider_configs SET is_active = true WHERE user_id = $1")) {
      rows.forEach((r) => { if (r.user_id === p[0]) r.is_active = true; });
      return { rows: [] };
    }

    if (q.includes("SELECT COUNT(*) as cnt FROM devx.provider_configs WHERE user_id = $1")) {
      return { rows: [{ cnt: String(rows.filter((r) => r.user_id === p[0]).length) }] };
    }

    if (q.includes("SELECT id, api_key FROM devx.provider_configs WHERE user_id = $1 AND api_key IS NOT NULL AND api_key_encrypted IS NULL")) {
      return {
        rows: rows
          .filter((r) => r.user_id === p[0] && r.api_key != null && r.api_key_encrypted == null)
          .map((r) => ({ id: r.id, api_key: r.api_key })),
      };
    }

    if (q.includes("FROM devx.provider_configs WHERE user_id = $1") && q.includes("ORDER BY is_active DESC")) {
      return { rows: rows.filter((r) => r.user_id === p[0]).map((r) => ({ ...r })) };
    }

    throw new Error("unstubbed query in test fake: " + q);
  };

  return { sql, calls, rows, settingsRows, agentModelSelections };
}

Deno.test("POST /provider-configs: no key configured writes plaintext, never touches the encrypted columns", async () => {
  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  const db = makeFakeDb();
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs", "POST", req("POST", { provider: "anthropic", model: "claude", api_key: "sk-plain" }), "u1", db.sql, CORS,
  );
  assertEquals(res!.status, 201);
  const row = db.rows[0];
  assertEquals(row.api_key, "sk-plain");
  assertEquals(row.api_key_encrypted, null);
  assertEquals(row.api_key_iv, null);
  const body = await res!.json();
  assertEquals(body.api_key, "sk-plain".substring(0, 8) + "..." + "sk-plain".slice(-4));
});

Deno.test("POST /provider-configs: key configured writes only the encrypted pair, never both columns", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb();
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs", "POST", req("POST", { provider: "anthropic", model: "claude", api_key: "sk-secret" }), "u1", db.sql, CORS,
  );
  assertEquals(res!.status, 201);
  const row = db.rows[0];
  assertEquals(row.api_key, null);
  assertEquals(typeof row.api_key_encrypted, "string");
  assertEquals(typeof row.api_key_iv, "string");
  // Never both populated.
  assertEquals(!!row.api_key && !!row.api_key_encrypted, false);
  // The response masks the real, decrypted plaintext — not left null.
  const body = await res!.json();
  assertEquals(body.api_key, "sk-secret".substring(0, 8) + "..." + "sk-secret".slice(-4));
});

Deno.test("PUT /provider-configs/:id: omitting api_key leaves all three key columns untouched", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb([{
    id: "1", user_id: "u1", provider: "anthropic", model: "claude",
    api_key: null, api_key_encrypted: "ENC", api_key_iv: "IV",
    base_url: null, display_name: "old-name", is_active: true,
    created_at: "t0", updated_at: "t0",
  }]);
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs/1", "PUT", req("PUT", { display_name: "new-name" }), "u1", db.sql, CORS,
  );
  assertEquals(res!.status, 200);
  const row = db.rows[0];
  assertEquals(row.display_name, "new-name");
  // The credential must be byte-for-byte untouched, not merely "still non-null".
  assertEquals(row.api_key, null);
  assertEquals(row.api_key_encrypted, "ENC");
  assertEquals(row.api_key_iv, "IV");
  // "ENC"/"IV" are garbage, not real ciphertext, so display-resolution can't
  // decrypt them — the response must say so via key_status (PUT doesn't
  // return auth_shape at all, same as before this task; only GET does).
  const body = await res!.json();
  assertEquals(body.key_status, "undecryptable");
  assertEquals(body.api_key, null);
});

Deno.test("PUT /provider-configs/:id: providing api_key rewrites all three columns consistently", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb([{
    id: "1", user_id: "u1", provider: "anthropic", model: "claude",
    api_key: "sk-legacy-plaintext", api_key_encrypted: null, api_key_iv: null,
    base_url: null, display_name: "cfg", is_active: true,
    created_at: "t0", updated_at: "t0",
  }]);
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs/1", "PUT", req("PUT", { api_key: "sk-rotated" }), "u1", db.sql, CORS,
  );
  assertEquals(res!.status, 200);
  const row = db.rows[0];
  assertEquals(row.api_key, null);
  assertEquals(typeof row.api_key_encrypted, "string");
  assertEquals(typeof row.api_key_iv, "string");
  assertEquals(!!row.api_key && !!row.api_key_encrypted, false);
});

// IMPORTANT 3: the legacy "AI Providers" activate route now delegates to
// activateDevxProviderConfig (agent_model_selection.ts) so it also upserts
// the unified agent_model_selection table's agent='devx' row — otherwise the
// new "Agent model assignment" UI would show a stale devx row after
// activating a config from this older panel.
Deno.test("PUT /provider-configs/:id/activate: flips is_active, mirrors devx.settings, and upserts agent_model_selection(devx)", async () => {
  const db = makeFakeDb([
    { id: "1", user_id: "u1", provider: "anthropic", model: "claude", api_key: null, api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: true, created_at: "t0", updated_at: "t0" },
    { id: "2", user_id: "u1", provider: "openai", model: "gpt-5", api_key: null, api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: false, created_at: "t0", updated_at: "t0" },
  ], [{ user_id: "u1", provider: "anthropic", model: "claude" }]);

  const res = await handleProviderConfigRoutes("/x/provider-configs/2/activate", "PUT", req("PUT"), "u1", db.sql, CORS);
  assertEquals(res!.status, 200);
  const body = await res!.json();
  assertEquals(body.ok, true);
  assertEquals(body.active.provider, "openai");
  assertEquals(db.rows.find((r) => r.id === "1")!.is_active, false);
  assertEquals(db.rows.find((r) => r.id === "2")!.is_active, true);
  assertEquals(db.settingsRows[0], { user_id: "u1", provider: "openai", model: "gpt-5" });
  assertEquals(db.agentModelSelections, [{ user_id: "u1", agent: "devx", provider_config_id: "2" }]);
});

Deno.test("PUT /provider-configs/:id/activate: 404 for a config that does not belong to the user", async () => {
  const db = makeFakeDb([
    { id: "1", user_id: "someone-else", provider: "anthropic", model: "claude", api_key: null, api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: false, created_at: "t0", updated_at: "t0" },
  ]);
  const res = await handleProviderConfigRoutes("/x/provider-configs/1/activate", "PUT", req("PUT"), "u1", db.sql, CORS);
  assertEquals(res!.status, 404);
});

Deno.test("GET /provider-configs: key_status distinguishes an undecryptable row from a genuinely keyless one", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb([
    // Row 1: legacy plaintext, decrypts trivially (readProviderKey passes it through).
    { id: "1", user_id: "u1", provider: "anthropic", model: "claude", api_key: "sk-legacy", api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: "a", is_active: true, created_at: "t0", updated_at: "t0" },
    // Row 2: encrypted pair the currently-configured key can't open (garbage ciphertext).
    { id: "2", user_id: "u1", provider: "bedrock", model: "claude", api_key: null, api_key_encrypted: "garbage", api_key_iv: "garbage", base_url: null, display_name: "b", is_active: false, created_at: "t0", updated_at: "t0" },
    // Row 3: genuinely no key configured (subscription provider).
    { id: "3", user_id: "u1", provider: "claude-code", model: "claude", api_key: null, api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: "c", is_active: false, created_at: "t0", updated_at: "t0" },
  ]);
  const res = await handleProviderConfigRoutes("/x/provider-configs", "GET", req("GET"), "u1", db.sql, CORS);
  assertEquals(res!.status, 200);
  const body = await res!.json();
  const byId = Object.fromEntries(body.map((r: any) => [r.id, r]));
  assertEquals(byId["1"].key_status, "ok");
  assertEquals(byId["1"].api_key, "sk-legacy".substring(0, 8) + "..." + "sk-legacy".slice(-4));
  assertEquals(byId["2"].key_status, "undecryptable");
  assertEquals(byId["2"].api_key, null);
  // Undecryptable must not be conflated with auth_shape "iam" — the point is
  // exactly that a bedrock row can be either shape and we currently can't tell.
  assertEquals(byId["2"].auth_shape, "none");
  assertEquals(byId["3"].key_status, "ok");
  assertEquals(byId["3"].api_key, null);
  assertEquals(byId["3"].auth_shape, "none");
  // is_plaintext (IMPORTANT 2 fix): lets the UI offer the encrypt-existing
  // backfill only for rows that actually still need it. Row 1 is legacy
  // plaintext; row 2 already holds an encrypted (if undecryptable) pair;
  // row 3 has no key at all — neither 2 nor 3 have anything to migrate.
  assertEquals(byId["1"].is_plaintext, true);
  assertEquals(byId["2"].is_plaintext, false);
  assertEquals(byId["3"].is_plaintext, false);
});

// The settings row a user predating the multi-provider UI still has (see
// V7__multi_provider.sql, which copied the key into provider_configs without
// clearing the source).
function settingsRow(overrides: Record<string, unknown> = {}) {
  return {
    user_id: "u1", provider: "anthropic", model: "claude",
    api_key: null, api_key_encrypted: null, api_key_iv: null,
    ...overrides,
  };
}

Deno.test("POST /provider-configs/encrypt-existing: no key configured is a reported no-op, not an error", async () => {
  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  const db = makeFakeDb([
    { id: "1", user_id: "u1", provider: "a", model: "m", api_key: "sk-1", api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: true, created_at: "t0", updated_at: "t0" },
    { id: "2", user_id: "u1", provider: "a", model: "m", api_key: "sk-2", api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: false, created_at: "t0", updated_at: "t0" },
  ], [settingsRow({ api_key: "sk-settings" })]);
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", db.sql, CORS,
  );
  assertEquals(res!.status, 200);
  const body = await res!.json();
  assertEquals(body, {
    migrated: 0,
    skipped: 3,
    encryptionConfigured: false,
    tables: {
      provider_configs: { migrated: 0, skipped: 2 },
      settings: { migrated: 0, skipped: 1 },
    },
  });
  // Untouched — in BOTH stores. This is the live deployment's state
  // (DEVX_ENCRYPTION_KEY is empty there), so "no key configured" must stay a
  // reported no-op rather than a half-migration or a 500.
  assertEquals(db.rows[0].api_key, "sk-1");
  assertEquals(db.rows[1].api_key, "sk-2");
  assertEquals(db.settingsRows[0].api_key, "sk-settings");
  assertEquals(db.settingsRows[0].api_key_encrypted, null);
});

Deno.test("POST /provider-configs/encrypt-existing: key configured migrates plaintext rows in both tables and is idempotent", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb([
    { id: "1", user_id: "u1", provider: "a", model: "m", api_key: "sk-1", api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: true, created_at: "t0", updated_at: "t0" },
    { id: "2", user_id: "u1", provider: "a", model: "m", api_key: null, api_key_encrypted: "already-enc", api_key_iv: "already-iv", base_url: null, display_name: null, is_active: false, created_at: "t0", updated_at: "t0" },
  ], [settingsRow({ api_key: "sk-settings-plain" })]);

  const first = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", db.sql, CORS,
  );
  assertEquals((await first!.json()), {
    migrated: 2,
    skipped: 1,
    encryptionConfigured: true,
    tables: {
      provider_configs: { migrated: 1, skipped: 1 },
      settings: { migrated: 1, skipped: 0 },
    },
  });
  assertEquals(db.rows[0].api_key, null);
  assertEquals(typeof db.rows[0].api_key_encrypted, "string");
  assertEquals(typeof db.rows[0].api_key_iv, "string");
  // Row 2 (already encrypted) is untouched byte-for-byte.
  assertEquals(db.rows[1].api_key_encrypted, "already-enc");
  assertEquals(db.rows[1].api_key_iv, "already-iv");
  // The settings row migrated the same way: plaintext nulled in the same
  // statement that wrote the pair.
  assertEquals(db.settingsRows[0].api_key, null);
  assertEquals(typeof db.settingsRows[0].api_key_encrypted, "string");
  assertEquals(typeof db.settingsRows[0].api_key_iv, "string");
  // The encrypted settings key still decrypts to the original.
  assertEquals(
    await readProviderKey(db.settingsRows[0] as Record<string, string | null>),
    "sk-settings-plain",
  );
  // Never both populated, in either table.
  for (const row of [...db.rows, ...db.settingsRows]) {
    assertEquals(!!row.api_key && !!row.api_key_encrypted, false);
  }

  // Second run: nothing left to migrate, and nothing re-encrypted.
  const encryptedBefore = db.settingsRows[0].api_key_encrypted;
  const second = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", db.sql, CORS,
  );
  assertEquals((await second!.json()), {
    migrated: 0,
    skipped: 3,
    encryptionConfigured: true,
    tables: {
      provider_configs: { migrated: 0, skipped: 2 },
      settings: { migrated: 0, skipped: 1 },
    },
  });
  assertEquals(db.settingsRows[0].api_key_encrypted, encryptedBefore);
});

Deno.test("POST /provider-configs/encrypt-existing: a settings-only plaintext key still migrates (no provider_configs rows at all)", async () => {
  // The user the visibility flag exists for: everything they have predates
  // the multi-provider UI, so provider_configs is empty and the only
  // plaintext credential is in devx.settings.
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb([], [settingsRow({ api_key: "sk-only-in-settings" })]);
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", db.sql, CORS,
  );
  assertEquals((await res!.json()), {
    migrated: 1,
    skipped: 0,
    encryptionConfigured: true,
    tables: {
      provider_configs: { migrated: 0, skipped: 0 },
      settings: { migrated: 1, skipped: 0 },
    },
  });
  assertEquals(db.settingsRows[0].api_key, null);
  assertEquals(
    await readProviderKey(db.settingsRows[0] as Record<string, string | null>),
    "sk-only-in-settings",
  );
});

Deno.test("POST /provider-configs/encrypt-existing: an already-encrypted settings row is never re-encrypted from a stale plaintext column", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  // Both columns populated — a state no write path produces, but the
  // candidate query excludes it structurally rather than relying on that.
  const db = makeFakeDb([], [settingsRow({ api_key: "sk-stale", api_key_encrypted: "enc", api_key_iv: "iv" })]);
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", db.sql, CORS,
  );
  const body = await res!.json();
  assertEquals(body.tables.settings, { migrated: 0, skipped: 1 });
  assertEquals(db.settingsRows[0].api_key_encrypted, "enc");
  assertEquals(db.settingsRows[0].api_key_iv, "iv");
});

Deno.test("POST /provider-configs/encrypt-existing: a PUT landing between the SELECT and the UPDATE is not clobbered", async () => {
  // The read/write race the rewrite's WHERE clause exists for: the backfill
  // reads a plaintext key, and before it writes the encrypted form back, a
  // PUT /settings stores a NEW key. Matching on user_id alone would replace
  // that new credential with the encrypted form of the old one.
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb([], [settingsRow({ api_key: "sk-old-plaintext" })]);
  const racingSql = async (q: string, p: unknown[] = []) => {
    const result = await db.sql(q, p);
    if (q.includes("SELECT api_key FROM devx.settings WHERE user_id = $1")) {
      // The interleaved PUT: new key, already encrypted, plaintext nulled.
      db.settingsRows[0].api_key = null;
      db.settingsRows[0].api_key_encrypted = "NEWER-ENC";
      db.settingsRows[0].api_key_iv = "NEWER-IV";
    }
    return result;
  };
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", racingSql, CORS,
  );
  const body = await res!.json();
  // The newer credential survives byte-for-byte...
  assertEquals(db.settingsRows[0].api_key_encrypted, "NEWER-ENC");
  assertEquals(db.settingsRows[0].api_key_iv, "NEWER-IV");
  // ...and the count reports what was actually rewritten, which is nothing:
  // the row was migrated by the racing write, not by this run.
  assertEquals(body.tables.settings, { migrated: 0, skipped: 1 });
});

Deno.test("POST /provider-configs/encrypt-existing: fails with a migration-named error, before writing anything, when V16 has not applied", async () => {
  __resetMigrationCacheForTests();
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb([
    { id: "1", user_id: "u1", provider: "a", model: "m", api_key: "sk-1", api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: true, created_at: "t0", updated_at: "t0" },
  ], [settingsRow({ api_key: "sk-settings" })]);
  // V15 applied, V16 not — the probe's table arrives as $1.
  const originalSql = db.sql;
  const partiallyMigratedSql = async (q: string, p: unknown[] = []) => {
    if (q.includes("information_schema.columns")) {
      return p[0] === "settings" ? { rows: [] } : { rows: [{ column_name: "api_key_encrypted" }] };
    }
    return originalSql(q, p);
  };
  await assertRejects(
    () => handleProviderConfigRoutes("/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", partiallyMigratedSql, CORS),
    Error,
    "devx migration V16 has not been applied",
  );
  // Both tables are probed before any row is rewritten, so a failure here
  // cannot report an error for work it already did.
  assertEquals(db.rows[0].api_key, "sk-1");
  assertEquals(db.settingsRows[0].api_key, "sk-settings");
  __resetMigrationCacheForTests();
});

// CRITICAL 1: if V15 never applied, devx.provider_configs.api_key_encrypted
// doesn't exist and the real SELECT would throw a raw
// `column "api_key_encrypted" does not exist`. assertProviderConfigEncryptionMigrated
// probes for the column first and fails with a message naming the migration
// instead — proven here by making the fake db's information_schema probe
// report the column missing, the same simulation Critical 1's fix requires.
Deno.test("GET /provider-configs: fails with a migration-named error when V15 has not applied", async () => {
  __resetMigrationCacheForTests();
  const db = makeFakeDb();
  // Override: report the column as absent, as a real un-migrated database would.
  const originalSql = db.sql;
  const unmigratedSql = async (q: string, p: unknown[] = []) => {
    if (q.includes("information_schema.columns")) return { rows: [] };
    return originalSql(q, p);
  };
  await assertRejects(
    () => handleProviderConfigRoutes("/x/provider-configs", "GET", req("GET"), "u1", unmigratedSql, CORS),
    Error,
    "devx migration V15 has not been applied",
  );
  __resetMigrationCacheForTests();
});
