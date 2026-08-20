// deno test --no-check --allow-all plugins/devx/functions/provider_key.test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  __resetMigrationCacheForTests,
  assertProviderConfigEncryptionMigrated,
  encryptionConfigured,
  readProviderKey,
  writeProviderKeyFields,
} from "./provider_key.ts";

const KEY = "0".repeat(64); // 32 bytes as hex

Deno.test("no encryption key configured: writes plaintext, reads it back", async () => {
  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  assertEquals(encryptionConfigured(), false);
  const fields = await writeProviderKeyFields("sk-plain");
  assertEquals(fields, { api_key: "sk-plain", api_key_encrypted: null, api_key_iv: null });
  assertEquals(await readProviderKey(fields), "sk-plain");
});

Deno.test("key configured: writes only the encrypted pair, never the plaintext column", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-secret");
  assertEquals(fields.api_key, null);
  assertEquals(typeof fields.api_key_encrypted, "string");
  assertEquals(typeof fields.api_key_iv, "string");
  assertEquals(fields.api_key_encrypted?.includes("sk-secret"), false);
  assertEquals(await readProviderKey(fields), "sk-secret");
});

Deno.test("a legacy plaintext row still reads with a key configured", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  assertEquals(await readProviderKey({ api_key: "sk-legacy" }), "sk-legacy");
});

Deno.test("decryption failure (wrong key) is loud — never a silent plaintext fallback", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-secret");
  Deno.env.set("DEVX_ENCRYPTION_KEY", "1".repeat(64)); // rotated/wrong key
  await assertRejects(
    () => readProviderKey({ ...fields, api_key: "sk-stale-plaintext" }),
    Error,
    "rotated or corrupted",
  );
});

Deno.test("encrypted row with the key removed entirely is loud — never a silent plaintext fallback", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-secret");
  Deno.env.delete("DEVX_ENCRYPTION_KEY"); // key unset entirely, not just rotated
  await assertRejects(
    () => readProviderKey({ ...fields, api_key: "sk-stale-plaintext" }),
    Error,
    "is not configured",
  );
});

Deno.test("the unset-key and wrong-key failures are distinguishable from each other", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-secret");

  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  const unsetError = await readProviderKey(fields).catch((e) => e as Error);

  Deno.env.set("DEVX_ENCRYPTION_KEY", "1".repeat(64));
  const wrongKeyError = await readProviderKey(fields).catch((e) => e as Error);

  assertEquals(unsetError instanceof Error, true);
  assertEquals(wrongKeyError instanceof Error, true);
  assertEquals(unsetError.message === wrongKeyError.message, false);
});

Deno.test("a row with neither column yields null", async () => {
  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  assertEquals(await readProviderKey({}), null);
});

Deno.test("assertProviderConfigEncryptionMigrated: fails closed, naming V15, when the column is absent", async () => {
  __resetMigrationCacheForTests();
  let calls = 0;
  const sql = async (_q: string, _p?: unknown[]) => {
    calls++;
    return { rows: [] }; // information_schema probe finds no matching column
  };
  await assertRejects(
    () => assertProviderConfigEncryptionMigrated(sql),
    Error,
    "devx migration V15 has not been applied",
  );
  assertEquals(calls, 1);
});

Deno.test("assertProviderConfigEncryptionMigrated: does not fire when the column is present", async () => {
  __resetMigrationCacheForTests();
  let calls = 0;
  const sql = async (_q: string, _p?: unknown[]) => {
    calls++;
    return { rows: [{ "?column?": 1 }] }; // information_schema probe finds the column
  };
  await assertProviderConfigEncryptionMigrated(sql); // must not throw
  assertEquals(calls, 1);
});

Deno.test("assertProviderConfigEncryptionMigrated: caches the result — one query per process, not per call", async () => {
  __resetMigrationCacheForTests();
  let calls = 0;
  const sql = async (_q: string, _p?: unknown[]) => {
    calls++;
    return { rows: [{ "?column?": 1 }] };
  };
  await assertProviderConfigEncryptionMigrated(sql);
  await assertProviderConfigEncryptionMigrated(sql);
  await assertProviderConfigEncryptionMigrated(sql);
  assertEquals(calls, 1, "the probe query must run at most once per process");
});

Deno.test("assertProviderConfigEncryptionMigrated: a cached negative result keeps failing without re-querying", async () => {
  __resetMigrationCacheForTests();
  let calls = 0;
  const sql = async (_q: string, _p?: unknown[]) => {
    calls++;
    return { rows: [] };
  };
  await assertRejects(() => assertProviderConfigEncryptionMigrated(sql));
  await assertRejects(() => assertProviderConfigEncryptionMigrated(sql));
  assertEquals(calls, 1);
  __resetMigrationCacheForTests();
});
