// deno test --no-check --allow-all plugins/devx/functions/api_key_mask.test.ts
//
// The mask is what every GET hands the client in place of a credential, and
// isMaskOf is the only thing standing between a client that echoes its loaded
// form back on save and a stored key overwritten by its own mask (which, once
// DEVX_ENCRYPTION_KEY is set, would then be encrypted and become permanent).
import { assertEquals } from "jsr:@std/assert";
import {
  discardableKeyUpdateReason,
  isEmptyCredentialBlob,
  isMaskOf,
  maskKey,
  resolveStoredSettingsKey,
} from "./api_key_mask.ts";
import { writeProviderKeyFields } from "./provider_key.ts";

const KEY = "0".repeat(64); // 32 bytes as hex, matches provider_key.test.ts

// Just enough of devx.settings for the guard's single SELECT.
function fakeSettingsDb(row: Record<string, string | null> | null) {
  return async (q: string, _p: unknown[] = []) => {
    if (q.includes("SELECT api_key, api_key_encrypted, api_key_iv FROM devx.settings WHERE user_id = $1")) {
      return { rows: row ? [{ ...row }] : [] };
    }
    throw new Error("unstubbed query in test fake: " + q);
  };
}

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

// isEmptyCredentialBlob — the payload a client produces when it unpacks the
// masked value into per-field inputs (the parse throws, the fields stay empty)
// and re-packs them on save. Not the mask, so isMaskOf never sees it.
Deno.test("isEmptyCredentialBlob: the shapes a re-packed empty bedrock form produces", () => {
  assertEquals(isEmptyCredentialBlob('{"bearerToken":""}'), true);
  assertEquals(isEmptyCredentialBlob('{"accessKeyId":"","secretAccessKey":""}'), true);
  assertEquals(isEmptyCredentialBlob("{}"), true);
  assertEquals(isEmptyCredentialBlob('{"bearerToken":null}'), true);
  // Whitespace around it is still the same payload.
  assertEquals(isEmptyCredentialBlob('  {"bearerToken":""}  '), true);
});

Deno.test("isEmptyCredentialBlob: a real bedrock credential is never discarded", () => {
  assertEquals(isEmptyCredentialBlob('{"bearerToken":"bt-real"}'), false);
  assertEquals(isEmptyCredentialBlob('{"accessKeyId":"AKIA","secretAccessKey":"s"}'), false);
  // Half-filled is still content the user typed — not ours to throw away.
  assertEquals(isEmptyCredentialBlob('{"accessKeyId":"AKIA","secretAccessKey":""}'), false);
});

Deno.test("isEmptyCredentialBlob: ordinary opaque keys are never treated as blobs", () => {
  assertEquals(isEmptyCredentialBlob("sk-ant-api03-abcdefghijklmnop"), false);
  assertEquals(isEmptyCredentialBlob(""), false);
  assertEquals(isEmptyCredentialBlob("sk-ant-a...mnop"), false); // a mask
  // Valid JSON, but not a credential object: scalars and arrays are keys as
  // far as this module is concerned, and must not be discarded.
  assertEquals(isEmptyCredentialBlob('""'), false);
  assertEquals(isEmptyCredentialBlob("null"), false);
  assertEquals(isEmptyCredentialBlob("[]"), false);
  // Broken JSON that merely starts with a brace is not a blob either.
  assertEquals(isEmptyCredentialBlob('{"bearerToken":'), false);
});

Deno.test("isEmptyCredentialBlob: an object with unrelated content is kept", () => {
  // Narrower than "the three bedrock fields are empty" on purpose: only
  // bedrock reads this column as structured JSON, so a JSON-shaped value that
  // still carries content stays a credential.
  assertEquals(isEmptyCredentialBlob('{"foo":"bar"}'), false);
  assertEquals(isEmptyCredentialBlob('{"token":"t"}'), false);
});

Deno.test("isEmptyCredentialBlob: non-strings are not blobs", () => {
  assertEquals(isEmptyCredentialBlob(null), false);
  assertEquals(isEmptyCredentialBlob(undefined), false);
  assertEquals(isEmptyCredentialBlob({ bearerToken: "" }), false);
});

// resolveStoredSettingsKey + discardableKeyUpdateReason: the whole PUT
// /settings guard, exercised against a fake devx.settings row.
Deno.test("resolveStoredSettingsKey: decrypts the stored pair, and never throws on an undecryptable one", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-stored-secret");
  assertEquals(await resolveStoredSettingsKey(fakeSettingsDb(fields), "u1"), "sk-stored-secret");
  // No row at all.
  assertEquals(await resolveStoredSettingsKey(fakeSettingsDb(null), "u1"), null);
  // Rotated key: null rather than a throw, so an unusable credential can
  // still be replaced.
  Deno.env.set("DEVX_ENCRYPTION_KEY", "1".repeat(64));
  assertEquals(await resolveStoredSettingsKey(fakeSettingsDb(fields), "u1"), null);
});

Deno.test("discardableKeyUpdateReason: the stale bundle's masked echo is discarded", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-ant-api03-abcdefghijklmnop");
  const reason = await discardableKeyUpdateReason(
    maskKey("sk-ant-api03-abcdefghijklmnop")!,
    fakeSettingsDb(fields),
    "u1",
  );
  assertEquals(typeof reason, "string");
});

Deno.test("discardableKeyUpdateReason: the stale bundle's empty bedrock blob is discarded too", async () => {
  // The bundles cached in browsers today never send the mask for bedrock —
  // their save path JSON.parse()s it, throws, and posts empty fields instead.
  // Discarding only the mask would leave this half of the round trip open.
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields(JSON.stringify({ bearerToken: "bt-real" }));
  const reason = await discardableKeyUpdateReason('{"bearerToken":""}', fakeSettingsDb(fields), "u1");
  assertEquals(typeof reason, "string");
});

Deno.test("discardableKeyUpdateReason: a genuine new key is stored", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-ant-api03-abcdefghijklmnop");
  assertEquals(await discardableKeyUpdateReason("sk-ant-api03-rotated-value", fakeSettingsDb(fields), "u1"), null);
  assertEquals(await discardableKeyUpdateReason('{"bearerToken":"bt-new"}', fakeSettingsDb(fields), "u1"), null);
});

Deno.test("discardableKeyUpdateReason: a first-time save with nothing stored is never swallowed", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  assertEquals(await discardableKeyUpdateReason("sk-brand-new", fakeSettingsDb(null), "u1"), null);
  assertEquals(await discardableKeyUpdateReason('{"bearerToken":"bt-first"}', fakeSettingsDb(null), "u1"), null);
  // An empty blob with nothing stored is still discarded — there is nothing
  // to lose, and storing a credential-free blob helps no one.
  assertEquals(typeof await discardableKeyUpdateReason("{}", fakeSettingsDb(null), "u1"), "string");
});

Deno.test("discardableKeyUpdateReason: an undecryptable stored key does not block replacing it", async () => {
  Deno.env.set("DEVX_ENCRYPTION_KEY", KEY);
  const fields = await writeProviderKeyFields("sk-old-secret");
  Deno.env.set("DEVX_ENCRYPTION_KEY", "1".repeat(64)); // rotated
  assertEquals(await discardableKeyUpdateReason("sk-replacement", fakeSettingsDb(fields), "u1"), null);
});
