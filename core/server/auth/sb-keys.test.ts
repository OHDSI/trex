import { assertEquals, assertNotEquals, assertMatch } from "jsr:@std/assert";
import {
  _setSbKeysCacheForTest,
  generatePublishableKey,
  generateSecretKey,
  isSbKey,
  resolveApiCredential,
  resolveSbKeyRole,
} from "./sb-keys.ts";

Deno.env.set("TREX_ROOT_KEY", btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i))));

const TEST_KEYS = {
  publishable: { id: "pk-1", key: "sb_publishable_testA", inserted_at: "2026-01-01T00:00:00Z" },
  secret: { id: "sk-1", key: "sb_secret_testB", inserted_at: "2026-01-01T00:00:00Z" },
};

Deno.test("generatePublishableKey format: prefix + 32+ base64url chars, unique", () => {
  const a = generatePublishableKey();
  const b = generatePublishableKey();
  assertMatch(a, /^sb_publishable_[A-Za-z0-9_-]{32,}$/);
  assertNotEquals(a, b);
});

Deno.test("generateSecretKey format: prefix + 32+ base64url chars, unique", () => {
  const a = generateSecretKey();
  assertMatch(a, /^sb_secret_[A-Za-z0-9_-]{32,}$/);
  assertNotEquals(a, generateSecretKey());
});

Deno.test("isSbKey detects sb_ prefixes only", () => {
  assertEquals(isSbKey("sb_publishable_x"), true);
  assertEquals(isSbKey("sb_secret_x"), true);
  assertEquals(isSbKey("eyJhbGciOi..."), false);
});

Deno.test("resolveSbKeyRole maps keys to roles, rejects unknown", async () => {
  _setSbKeysCacheForTest(TEST_KEYS);
  assertEquals(await resolveSbKeyRole(TEST_KEYS.publishable.key), "anon");
  assertEquals(await resolveSbKeyRole(TEST_KEYS.secret.key), "service_role");
  assertEquals(await resolveSbKeyRole("sb_secret_wrong"), null);
  assertEquals(await resolveSbKeyRole("sb_publishable_" + "A".repeat(32)), null);
  _setSbKeysCacheForTest(null);
});

Deno.test("resolveApiCredential: sb key yields role, garbage yields null", async () => {
  _setSbKeysCacheForTest(TEST_KEYS);
  const secret = await resolveApiCredential(TEST_KEYS.secret.key);
  assertEquals(secret?.role, "service_role");
  const pub = await resolveApiCredential(TEST_KEYS.publishable.key);
  assertEquals(pub?.role, "anon");
  assertEquals(await resolveApiCredential("sb_secret_nope"), null);
  assertEquals(await resolveApiCredential("not-a-jwt-not-a-key"), null);
  _setSbKeysCacheForTest(null);
});
