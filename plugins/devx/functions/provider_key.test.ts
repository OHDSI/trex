// deno test --no-check --allow-all plugins/devx/functions/provider_key.test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { encryptionConfigured, readProviderKey, writeProviderKeyFields } from "./provider_key.ts";

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

Deno.test("decryption failure is loud — never a silent plaintext fallback", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-secret");
  Deno.env.set("DEVX_ENCRYPTION_KEY", "1".repeat(64)); // rotated/wrong key
  await assertRejects(() => readProviderKey({ ...fields, api_key: "sk-stale-plaintext" }));
});

Deno.test("a row with neither column yields null", async () => {
  Deno.env.delete("DEVX_ENCRYPTION_KEY");
  assertEquals(await readProviderKey({}), null);
});
