// The DEK envelope on the columns Better Auth writes.
//
// These are unit tests on the hook functions, and they are deliberately written
// against `merged()` rather than against the hook's return value. The return
// value is not the write: with-hooks.mjs:18-21 merges it over the pending row,
// so a field the hook leaves out of its patch still reaches the adapter,
// carrying whatever Better Auth put there. An earlier round of these tests
// asserted `"refreshToken" in sealed.data === false` and was true of a version
// that wrote the upstream's raw value to the column.
//
// They still cannot show that the hooks are *wired*: deleting `databaseHooks`
// from better-auth.ts leaves every one of them green.
// auth/federation/sso-callback.test.ts carries that half — it drives real
// callbacks, varies what the upstream puts in the token response, and reads
// the stored row back. That file is the authority on what is written; this one
// covers the shapes a live upstream is awkward to make produce.
import { assertEquals, assertNotEquals, assertRejects } from "jsr:@std/assert";
import { _resetDekCache, _setDekForTests, decryptWithDek } from "../dek.ts";
import { accountTokenHooks } from "./account-tokens.ts";

function withDek() {
  _setDekForTests(new Uint8Array(32));
}

/**
 * What the adapter is actually handed: the hook's patch merged over the row
 * Better Auth built, exactly as createWithHooks/updateWithHooks do it
 * (`actualData = { ...actualData, ...result.data }`).
 */
async function merged(
  hook: (d: Record<string, unknown>) => Promise<{ data: Record<string, string | null> }>,
  data: Record<string, unknown>,
) {
  return { ...data, ...(await hook(data)).data };
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

Deno.test("a column the upstream said nothing about is not written at all", async () => {
  // Better Auth drops undefined fields before the update
  // (dist/oauth2/link-account.mjs:151, .filter(([_, v]) => v !== void 0)), so an
  // absent refresh token does not reach the hook as a key. It must not be
  // invented: naming it as null here would turn "the upstream was silent" into
  // "clear this column", which is the one case the merge makes harmless and a
  // hook can easily break.
  withDek();
  try {
    const write = await merged(accountTokenHooks.update.before, {
      providerId: "logto",
      accessToken: "at-1",
    });
    assertEquals("refreshToken" in write, false);
    assertEquals("idToken" in write, false);
  } finally {
    _resetDekCache();
  }
});

Deno.test("an empty-string token is written as NULL, not passed through", async () => {
  // "" is a string, so only a length test stands between it and the column —
  // and because the patch is MERGED, declining to seal it writes "" verbatim.
  // NULL is the only state a reader can interpret.
  withDek();
  try {
    const write = await merged(accountTokenHooks.update.before, {
      refreshToken: "",
      accessToken: "at-1",
    });
    assertEquals(write.refreshToken, null);
  } finally {
    _resetDekCache();
  }
});

Deno.test("an explicit null token is written as NULL, not as the ciphertext of 'null'", async () => {
  withDek();
  try {
    const write = await merged(accountTokenHooks.create.before, {
      accessToken: null,
      idToken: "it-1",
    });
    assertEquals(write.accessToken, null);
    assertEquals(await decryptWithDek(write.idToken as string), "it-1");
  } finally {
    _resetDekCache();
  }
});

Deno.test("a non-string token never reaches the column in clear text", async () => {
  // getOAuth2Tokens maps refresh_token off the token response with no coercion
  // (@better-auth/core/src/oauth2/utils.ts:34), so a non-conformant IdP can put
  // a number there. Measured before the fix: the column held the string "12345"
  // in clear text and readAccountTokens then threw on that row for good.
  withDek();
  try {
    for (const junk of [12345, true, { nested: "object" }, ["array"]]) {
      const write = await merged(accountTokenHooks.update.before, { refreshToken: junk });
      assertEquals(write.refreshToken, null);
    }
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
