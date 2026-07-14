import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert";
import { createOAuthStore } from "./store.ts";
import {
  _resetDekCache,
  _setDekForTests,
  decryptWithDek,
  encryptWithDek,
} from "../../../auth/dek.ts";

// A real DEK object over the AES-GCM DEK layer, primed with a fixed key so the
// tests exercise genuine encrypt/decrypt (ciphertext != plaintext, round-trip)
// rather than a stub.
function realDek() {
  _resetDekCache();
  _setDekForTests(new Uint8Array(32).map((_, i) => (0x11 * (i + 1)) & 0xff));
  return { encrypt: encryptWithDek, decrypt: decryptWithDek };
}

function fakeQuery(responses: Array<{ rows: unknown[] }>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve(responses.shift() ?? { rows: [] });
  };
  return { fn, calls };
}

Deno.test("putToken encrypts access+refresh (ciphertext != plaintext) and UPSERTs on the PK", async () => {
  const dek = realDek();
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createOAuthStore(fn as never, dek);

  await store.putToken("user", "u1", "github", {
    access: "access-secret",
    refresh: "refresh-secret",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    scopes: "repo read:user",
  });

  assertEquals(calls.length, 1);
  const call = calls[0];
  assert(call.sql.includes("INSERT INTO agents.oauth_tokens"));
  assert(call.sql.includes("ON CONFLICT"), "must UPSERT on the primary key");
  assert(
    call.sql.includes("DO UPDATE"),
    "conflict must update the existing token row",
  );

  const params = call.params as unknown[];
  // params: principal_type, principal_id, connector, access_enc, refresh_enc, expires_at, scopes
  assertEquals(params[0], "user");
  assertEquals(params[1], "u1");
  assertEquals(params[2], "github");

  const accessEnc = params[3] as string;
  const refreshEnc = params[4] as string;
  // Stored value MUST be ciphertext, never plaintext.
  assertNotEquals(accessEnc, "access-secret");
  assertNotEquals(refreshEnc, "refresh-secret");
  // And it must decrypt back to the original.
  assertEquals(await decryptWithDek(accessEnc), "access-secret");
  assertEquals(await decryptWithDek(refreshEnc), "refresh-secret");

  assertEquals(params[5], new Date("2030-01-01T00:00:00Z"));
  assertEquals(params[6], "repo read:user");
});

Deno.test("putToken stores NULL for a null refresh token", async () => {
  const dek = realDek();
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createOAuthStore(fn as never, dek);

  await store.putToken("app", "__app__", "slack", {
    access: "app-token",
    refresh: null,
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    scopes: "chat:write",
  });

  const params = calls[0].params as unknown[];
  assertEquals(params[1], "__app__");
  assertEquals(params[4], null); // refresh_token_enc stays NULL
  assertEquals(await decryptWithDek(params[3] as string), "app-token");
});

Deno.test("getToken decrypts a stored row (round-trip)", async () => {
  const dek = realDek();
  // Encrypt values the way putToken would have, then feed them to getToken.
  const accessEnc = await encryptWithDek("access-secret");
  const refreshEnc = await encryptWithDek("refresh-secret");
  const expires = new Date("2030-06-01T12:00:00Z");
  const { fn, calls } = fakeQuery([{
    rows: [{
      access_token_enc: accessEnc,
      refresh_token_enc: refreshEnc,
      expires_at: expires,
      scopes: "repo",
    }],
  }]);
  const store = createOAuthStore(fn as never, dek);

  const tok = await store.getToken("user", "u1", "github");
  assertEquals(tok, {
    access: "access-secret",
    refresh: "refresh-secret",
    expiresAt: expires,
    scopes: "repo",
  });
  // SELECT keyed on the composite PK.
  assert(calls[0].sql.includes("FROM agents.oauth_tokens"));
  assertEquals(calls[0].params, ["user", "u1", "github"]);
});

Deno.test("getToken handles a null refresh token", async () => {
  const dek = realDek();
  const accessEnc = await encryptWithDek("app-token");
  const { fn } = fakeQuery([{
    rows: [{
      access_token_enc: accessEnc,
      refresh_token_enc: null,
      expires_at: null,
      scopes: null,
    }],
  }]);
  const store = createOAuthStore(fn as never, dek);

  const tok = await store.getToken("app", "__app__", "slack");
  assertEquals(tok?.access, "app-token");
  assertEquals(tok?.refresh, null);
});

Deno.test("getToken returns null on a miss", async () => {
  const dek = realDek();
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createOAuthStore(fn as never, dek);
  assertEquals(await store.getToken("user", "nope", "github"), null);
});

Deno.test("putToken then getToken end-to-end through a shared fake db", async () => {
  const dek = realDek();
  let stored: Record<string, unknown> | null = null;
  const query = (sql: string, params?: unknown[]) => {
    const p = params as unknown[];
    if (sql.includes("INSERT INTO agents.oauth_tokens")) {
      stored = {
        access_token_enc: p[3],
        refresh_token_enc: p[4],
        expires_at: p[5],
        scopes: p[6],
      };
      return Promise.resolve({ rows: [] });
    }
    // SELECT
    return Promise.resolve({ rows: stored ? [stored] : [] });
  };
  const store = createOAuthStore(query as never, dek);

  const expires = new Date("2031-01-01T00:00:00Z");
  await store.putToken("user", "u9", "notion", {
    access: "a-tok",
    refresh: "r-tok",
    expiresAt: expires,
    scopes: "read",
  });
  const tok = await store.getToken("user", "u9", "notion");
  assertEquals(tok, {
    access: "a-tok",
    refresh: "r-tok",
    expiresAt: expires,
    scopes: "read",
  });
});

Deno.test("getConnector resolves client_secret_ref from env", async () => {
  const dek = realDek();
  const { fn, calls } = fakeQuery([{
    rows: [{
      authorization_url: "https://example.com/auth",
      token_url: "https://example.com/token",
      client_id: "client-123",
      client_secret_ref: "GITHUB_OAUTH_SECRET",
      scopes: "repo",
      principal_scope: "user",
    }],
  }]);
  const env: Record<string, string> = { GITHUB_OAUTH_SECRET: "s3cr3t" };
  const store = createOAuthStore(fn as never, dek, (k) => env[k]);

  const c = await store.getConnector("github");
  assertEquals(c, {
    authorizationUrl: "https://example.com/auth",
    tokenUrl: "https://example.com/token",
    clientId: "client-123",
    clientSecret: "s3cr3t",
    scopes: "repo",
    principalScope: "user",
  });
  assert(calls[0].sql.includes("FROM agents.oauth_connectors"));
  assertEquals(calls[0].params, ["github"]);
});

Deno.test("getConnector returns null for an unknown id", async () => {
  const dek = realDek();
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createOAuthStore(fn as never, dek, () => undefined);
  assertEquals(await store.getConnector("nope"), null);
});
