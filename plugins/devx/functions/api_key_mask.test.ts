// deno test --no-check --allow-all plugins/devx/functions/api_key_mask.test.ts
//
// The mask is what every GET hands the client in place of a credential, and
// isMaskOf is the only thing standing between a client that echoes its loaded
// form back on save and a stored key overwritten by its own mask (which, once
// DEVX_ENCRYPTION_KEY is set, would then be encrypted and become permanent).
import { assertEquals } from "jsr:@std/assert";
import { isMaskOf, maskKey } from "./api_key_mask.ts";

Deno.test("maskKey: first 8, ellipsis, last 4 — the shape clients already have cached", () => {
  assertEquals(maskKey("sk-ant-api03-abcdefghijklmnop"), "sk-ant-a...mnop");
});

Deno.test("maskKey: no key is null, not an empty mask", () => {
  assertEquals(maskKey(null), null);
  assertEquals(maskKey(undefined), null);
  assertEquals(maskKey(""), null);
});

Deno.test("maskKey: a key shorter than the mask window still masks (segments overlap)", () => {
  // Not a security property — just documenting that short keys don't crash
  // or leak more than the mask already implies.
  assertEquals(maskKey("sk-short"), "sk-short...hort");
});

Deno.test("isMaskOf: recognises the exact mask of the stored key", () => {
  const stored = "sk-ant-api03-abcdefghijklmnop";
  assertEquals(isMaskOf(maskKey(stored), stored), true);
});

Deno.test("isMaskOf: a real credential is never mistaken for a mask", () => {
  const stored = "sk-ant-api03-abcdefghijklmnop";
  assertEquals(isMaskOf("sk-ant-api03-zzzzzzzzzzzzzzzz", stored), false);
  // A credential that happens to contain an ellipsis is still a credential —
  // this is why the check is equality against the stored key's own mask, not
  // a pattern match on "looks masked".
  assertEquals(isMaskOf("sk-weird...key-with-dots", stored), false);
});

Deno.test("isMaskOf: the mask of a DIFFERENT key is not the mask of this one", () => {
  assertEquals(isMaskOf(maskKey("sk-ant-api03-aaaaaaaaaaaaaaaa"), "sk-ant-api03-bbbbbbbbbbbbbbbb"), false);
});

Deno.test("isMaskOf: with nothing stored, nothing is a mask — a first-time key save is never swallowed", () => {
  assertEquals(isMaskOf("sk-brand-new", null), false);
  assertEquals(isMaskOf("sk-brand-new", ""), false);
  assertEquals(isMaskOf("", null), false);
});

Deno.test("isMaskOf: non-string candidates (cleared key, absent field) are not masks", () => {
  const stored = "sk-ant-api03-abcdefghijklmnop";
  assertEquals(isMaskOf(undefined, stored), false);
  assertEquals(isMaskOf(null, stored), false);
  // An explicit clear must stay an explicit clear, not be read as "unchanged".
  assertEquals(isMaskOf("", stored), false);
});
