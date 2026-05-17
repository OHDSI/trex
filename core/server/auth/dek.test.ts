import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { _resetRootKeyCache } from "./keys.ts";
import { _resetDekCache, decryptWithDek, encryptWithDek, unwrapDek, wrapDek } from "./dek.ts";

const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => 0x42 ^ i)));

function setRoot() {
  _resetRootKeyCache();
  _resetDekCache();
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
}

Deno.test("wrap then unwrap returns the original DEK", async () => {
  setRoot();
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await wrapDek(dek);
  const round = await unwrapDek(wrapped);
  assertEquals(round, dek);
});

Deno.test("wrap output is non-deterministic (random IV)", async () => {
  setRoot();
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const a = await wrapDek(dek);
  const b = await wrapDek(dek);
  assertNotEquals(a, b);
});

Deno.test("encryptWithDek roundtrips via decryptWithDek", async () => {
  setRoot();
  // Prime the in-memory DEK by wrapping+unwrapping a known one.
  const dek = crypto.getRandomValues(new Uint8Array(32));
  const wrapped = await wrapDek(dek);
  const { _setDekForTests } = await import("./dek.ts");
  _setDekForTests(await unwrapDek(wrapped));

  const enc = await encryptWithDek("hello world");
  const out = await decryptWithDek(enc);
  assertEquals(out, "hello world");
});
