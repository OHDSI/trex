// The DEK envelope on the columns Better Auth writes.
//
// These are unit tests on the hook functions. They cannot show that the hooks
// are *wired*: deleting `databaseHooks` from better-auth.ts leaves every one of
// them green. auth/federation/sso-callback.test.ts carries that half — it drives
// a real callback and reads the stored row back — and the two are only adequate
// together.
import { assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert";
import { _resetDekCache, _setDekForTests, decryptWithDek } from "../dek.ts";
import { accountTokenHooks } from "./account-tokens.ts";

function withDek() {
  _setDekForTests(new Uint8Array(32));
}

Deno.test("the hook seals every token column and leaves the binding alone", async () => {
  withDek();
  try {
    const originals = {
      accessToken: "at-1",
      refreshToken: "rt-1",
      // idToken too: Better Auth's own encryptOAuthTokens never covers it
      // (dist/oauth2/link-account.mjs:102, 147, 206 pass account.idToken
      // verbatim), and it is the one that carries the person's claims.
      idToken: "eyJhbGciOiJSUzI1NiJ9.e30.sig",
    };
    const sealed = await accountTokenHooks.create.before({
      id: "a1",
      userId: "u1",
      providerId: "logto",
      accountId: "sub-1",
      ...originals,
    });
    for (const field of ["accessToken", "refreshToken", "idToken"] as const) {
      // Not "it does not look like the input" — that is satisfied by any
      // transformation at all, a wrong one included. The pin is the round trip
      // through trex's own DEK.
      assertNotEquals(sealed.data[field], originals[field]);
      assertEquals(await decryptWithDek(sealed.data[field]!), originals[field]);
    }
    // With resolveUser set the plugin requires exact account binding, so a hook
    // that returned any of these would abort the sign-in with
    // account_hook_binding_conflict.
    assertEquals(Object.keys(sealed.data).sort(), ["accessToken", "idToken", "refreshToken"]);
  } finally {
    _resetDekCache();
  }
});

Deno.test("an absent token stays absent rather than becoming ciphertext", async () => {
  // Better Auth drops undefined fields before the update
  // (dist/oauth2/link-account.mjs:151, .filter(([_, v]) => v !== void 0)); a
  // ciphertext of "" would survive that filter and overwrite a stored refresh
  // token with the encryption of nothing.
  withDek();
  try {
    const sealed = await accountTokenHooks.update.before({
      providerId: "logto",
      accessToken: "at-1",
      refreshToken: undefined,
    });
    assertEquals("refreshToken" in sealed.data, false);
    assertEquals("idToken" in sealed.data, false);
    assertEquals(Object.keys(sealed.data), ["accessToken"]);
  } finally {
    _resetDekCache();
  }
});

Deno.test("an empty-string token is left alone, not turned into a valid ciphertext", async () => {
  // The sharper half of the case above: "" is a string, so a length test is the
  // only thing standing between it and a ciphertext the undefined-filter keeps.
  withDek();
  try {
    const sealed = await accountTokenHooks.update.before({ refreshToken: "", accessToken: "at-1" });
    assertEquals("refreshToken" in sealed.data, false);
  } finally {
    _resetDekCache();
  }
});

Deno.test("an explicit null token is not sealed", async () => {
  // A null reaching the adapter must stay a NULL column, not become the
  // ciphertext of the string "null".
  withDek();
  try {
    const sealed = await accountTokenHooks.create.before({ accessToken: null, idToken: "it-1" });
    assertEquals("accessToken" in sealed.data, false);
  } finally {
    _resetDekCache();
  }
});

Deno.test("with no DEK the write fails rather than storing plaintext", async () => {
  _resetDekCache();
  const err = await assertRejects(
    () => accountTokenHooks.create.before({ accessToken: "at-1" }),
    Error,
  );
  // The column is named; the credential is not.
  assertEquals(err.message.includes("accessToken"), true);
  assertEquals(err.message.includes("at-1"), false);
});

Deno.test("the update hook fails the same way", async () => {
  // Both hooks, because a create-only envelope would leave every later sign-in
  // through an existing link writing plaintext.
  _resetDekCache();
  await assertRejects(() => accountTokenHooks.update.before({ refreshToken: "rt-1" }), Error);
});

Deno.test("the same token seals differently every time", async () => {
  // AES-GCM with a fresh IV. Nothing compares these columns, which is what
  // makes that safe; only null-ness is ever tested.
  withDek();
  try {
    const a = await accountTokenHooks.create.before({ accessToken: "at-1" });
    const b = await accountTokenHooks.create.before({ accessToken: "at-1" });
    assertNotEquals(a.data.accessToken, b.data.accessToken);
    assertEquals(await decryptWithDek(a.data.accessToken!), "at-1");
    assertEquals(await decryptWithDek(b.data.accessToken!), "at-1");
  } finally {
    _resetDekCache();
  }
});
