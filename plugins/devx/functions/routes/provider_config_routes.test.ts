// deno test --no-check --allow-all plugins/devx/functions/routes/provider_config_routes.test.ts
//
// Exercises the write sites (INSERT, UPDATE) and the backfill route against a
// tiny in-memory fake of devx.provider_configs, so the two destructive
// failure modes this task warns about are checked without a live database:
//   1. a write ever leaving BOTH api_key and api_key_encrypted populated
//   2. an update that omits api_key blanking an existing credential
import { assertEquals } from "jsr:@std/assert";
import { handleProviderConfigRoutes } from "./provider_config_routes.ts";

const CORS = { "content-type": "application/json" };
const KEY = "0".repeat(64); // 32 bytes as hex, matches provider_key.test.ts

function req(method: string, body?: unknown) {
  return new Request("http://x/provider-configs", {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

// A minimal fake of devx.provider_configs, driven off the literal query
// shapes provider_config_routes.ts issues today. Intimate with the SQL on
// purpose — it's a colocated white-box test, not a generic DB stub.
function makeFakeDb(seedRows: Record<string, unknown>[] = []) {
  const rows = seedRows.map((r) => ({ ...r }));
  let nextId = rows.length + 1;
  const calls: Array<{ q: string; p: unknown[] }> = [];

  const sql = async (q: string, p: unknown[] = []) => {
    calls.push({ q, p });

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

    // Backfill's per-row rewrite: SET api_key = $1, api_key_encrypted = $2, api_key_iv = $3 ...
    if (q.includes("SET api_key = $1, api_key_encrypted = $2, api_key_iv = $3")) {
      const [api_key, api_key_encrypted, api_key_iv, id, user_id] = p;
      const row = rows.find((r) => r.id === id && r.user_id === user_id);
      if (row) {
        row.api_key = api_key;
        row.api_key_encrypted = api_key_encrypted;
        row.api_key_iv = api_key_iv;
      }
      return { rows: [] };
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

    if (q.includes("SELECT id, api_key FROM devx.provider_configs WHERE user_id = $1 AND api_key IS NOT NULL")) {
      return { rows: rows.filter((r) => r.user_id === p[0] && r.api_key != null).map((r) => ({ id: r.id, api_key: r.api_key })) };
    }

    if (q.includes("FROM devx.provider_configs WHERE user_id = $1") && q.includes("ORDER BY is_active DESC")) {
      return { rows: rows.filter((r) => r.user_id === p[0]).map((r) => ({ ...r })) };
    }

    throw new Error("unstubbed query in test fake: " + q);
  };

  return { sql, calls, rows };
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

Deno.test("POST /provider-configs/encrypt-existing: no key configured is a reported no-op, not an error", async () => {
  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  const db = makeFakeDb([
    { id: "1", user_id: "u1", provider: "a", model: "m", api_key: "sk-1", api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: true, created_at: "t0", updated_at: "t0" },
    { id: "2", user_id: "u1", provider: "a", model: "m", api_key: "sk-2", api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: false, created_at: "t0", updated_at: "t0" },
  ]);
  const res = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", db.sql, CORS,
  );
  assertEquals(res!.status, 200);
  const body = await res!.json();
  assertEquals(body, { migrated: 0, skipped: 2, encryptionConfigured: false });
  // Untouched.
  assertEquals(db.rows[0].api_key, "sk-1");
  assertEquals(db.rows[1].api_key, "sk-2");
});

Deno.test("POST /provider-configs/encrypt-existing: key configured migrates plaintext rows and is idempotent", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const db = makeFakeDb([
    { id: "1", user_id: "u1", provider: "a", model: "m", api_key: "sk-1", api_key_encrypted: null, api_key_iv: null, base_url: null, display_name: null, is_active: true, created_at: "t0", updated_at: "t0" },
    { id: "2", user_id: "u1", provider: "a", model: "m", api_key: null, api_key_encrypted: "already-enc", api_key_iv: "already-iv", base_url: null, display_name: null, is_active: false, created_at: "t0", updated_at: "t0" },
  ]);

  const first = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", db.sql, CORS,
  );
  assertEquals((await first!.json()), { migrated: 1, skipped: 1, encryptionConfigured: true });
  assertEquals(db.rows[0].api_key, null);
  assertEquals(typeof db.rows[0].api_key_encrypted, "string");
  assertEquals(typeof db.rows[0].api_key_iv, "string");
  // Row 2 (already encrypted) is untouched byte-for-byte.
  assertEquals(db.rows[1].api_key_encrypted, "already-enc");
  assertEquals(db.rows[1].api_key_iv, "already-iv");
  // Never both populated, for any row.
  for (const row of db.rows) {
    assertEquals(!!row.api_key && !!row.api_key_encrypted, false);
  }

  // Second run: nothing left to migrate.
  const second = await handleProviderConfigRoutes(
    "/x/provider-configs/encrypt-existing", "POST", req("POST"), "u1", db.sql, CORS,
  );
  assertEquals((await second!.json()), { migrated: 0, skipped: 2, encryptionConfigured: true });
});
