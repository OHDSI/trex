import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { _resetRootKeyCache, deriveSubkey, getRootKey, LABELS } from "./keys.ts";

function setRoot(b64: string | null) {
  _resetRootKeyCache();
  if (b64 === null) Deno.env.delete("TREX_ROOT_KEY");
  else Deno.env.set("TREX_ROOT_KEY", b64);
}

const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

Deno.test("getRootKey throws when TREX_ROOT_KEY is unset", () => {
  setRoot(null);
  let err: Error | null = null;
  try { getRootKey(); } catch (e) { err = e as Error; }
  if (!err) throw new Error("expected throw");
});

Deno.test("getRootKey throws when TREX_ROOT_KEY is too short", () => {
  setRoot("c2hvcnQ="); // "short"
  let err: Error | null = null;
  try { getRootKey(); } catch (e) { err = e as Error; }
  if (!err) throw new Error("expected throw");
});

Deno.test("getRootKey returns 32 bytes for a valid base64 root", () => {
  setRoot(VALID_ROOT);
  const key = getRootKey();
  assertEquals(key.length, 32);
});

Deno.test("deriveSubkey is deterministic for the same label", async () => {
  setRoot(VALID_ROOT);
  const a = await deriveSubkey(LABELS.jwtHs256);
  const b = await deriveSubkey(LABELS.jwtHs256);
  assertEquals(a, b);
});

Deno.test("deriveSubkey differs across labels", async () => {
  setRoot(VALID_ROOT);
  const a = await deriveSubkey(LABELS.jwtHs256);
  const b = await deriveSubkey(LABELS.dekWrap);
  assertNotEquals(a, b);
});

Deno.test("deriveSubkey returns 32 raw bytes", async () => {
  setRoot(VALID_ROOT);
  const k = await deriveSubkey(LABELS.pgmetaAes);
  assertEquals(k.length, 32);
});
