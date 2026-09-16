import { assertEquals } from "jsr:@std/assert";
import { parseLinkRequest, parseProviderUpsert } from "./admin-policy.ts";
import { linkIdentity, setProviderEnabled, upsertProvider } from "./admin-store.ts";

const validProvider = {
  displayName: "Logto", clientId: "cid", clientSecret: "sec",
  issuer: "https://logto.internal:3001/oidc",
  authorizationEndpoint: "https://d2e.test/oidc/auth",
};

Deno.test("parseProviderUpsert fills defaults and keeps the id from the path", () => {
  assertEquals(parseProviderUpsert("logto", validProvider), {
    id: "logto", displayName: "Logto", clientId: "cid", clientSecret: "sec",
    issuer: "https://logto.internal:3001/oidc", discoveryUrl: null,
    authorizationEndpoint: "https://d2e.test/oidc/auth", scopes: "openid profile email",
    groupsSource: "none", groupsClaim: null, autoProvision: false, enabled: true,
  });
});

Deno.test("parseProviderUpsert refuses bad ids, missing fields and unknown groups sources", () => {
  assertEquals(parseProviderUpsert("Logto", validProvider), null);
  assertEquals(parseProviderUpsert("logto", { ...validProvider, clientSecret: "" }), null);
  assertEquals(parseProviderUpsert("logto", { ...validProvider, issuer: undefined }), null);
  assertEquals(parseProviderUpsert("logto", { ...validProvider, groupsSource: "ldap" }), null);
  assertEquals(parseProviderUpsert("logto", "nope"), null);
});

Deno.test("parseLinkRequest trims, lower-cases the email and defaults banned to false", () => {
  assertEquals(
    parseLinkRequest({ providerId: "logto", accountId: " abc ", email: " Admin@D2E.local " }),
    { providerId: "logto", accountId: "abc", email: "admin@d2e.local", name: null, banned: false },
  );
  for (const body of [null, {}, { providerId: "logto", accountId: "a" },
                      { providerId: "logto", accountId: "a", email: "no-at-sign" }]) {
    assertEquals(parseLinkRequest(body), null, JSON.stringify(body));
  }
});

// A scripted pg client: each query is matched by a substring and answered in
// order, and every statement is recorded so the test can assert what ran.
function fakeClient(script: Array<[string, unknown[]]>) {
  const ran: string[] = [];
  return {
    ran,
    query(sql: string, _params?: unknown[]) {
      ran.push(sql.replace(/\s+/g, " ").trim());
      const i = script.findIndex(([needle]) => sql.includes(needle));
      if (i === -1) return Promise.resolve({ rows: [], rowCount: 0 });
      const [, rows] = script.splice(i, 1)[0];
      return Promise.resolve({ rows, rowCount: rows.length });
    },
  };
}

const link = { providerId: "logto", accountId: "logto-1", email: "a@x.test", name: "A", banned: false };

Deno.test("linkIdentity reports an existing link without writing", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["FROM trexdb.account a", [{ userId: "u1", disabled: false }]],
  ]);
  assertEquals(await linkIdentity(c, link), { userId: "u1", outcome: "already_linked" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
});

Deno.test("linkIdentity links to the trex user holding the email", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["lower(email) = lower($1)", [{ id: "u2" }]],
  ]);
  assertEquals(await linkIdentity(c, link), { userId: "u2", outcome: "linked" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT INTO trexdb.account")), true);
  assertEquals(c.ran.at(-1), "COMMIT");
});

Deno.test("linkIdentity creates a password-less user when nobody holds the email", async () => {
  const c = fakeClient([["FROM trexdb.sso_provider", [{ id: "logto" }]]]);
  const result = await linkIdentity(c, link);
  assertEquals("outcome" in result && result.outcome, "created");
  assertEquals(c.ran.some((s) => s.startsWith('INSERT INTO trexdb."user"')), true);
});

Deno.test("linkIdentity refuses an email already linked to another account at the provider", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["lower(email) = lower($1)", [{ id: "u3" }]],
    ['"userId" = $1 AND "providerId" = $2', [{ accountId: "logto-other" }]],
  ]);
  assertEquals(await linkIdentity(c, link), { conflict: true, userId: "u3" });
  assertEquals(c.ran.some((s) => s.startsWith("INSERT")), false);
  assertEquals(c.ran.at(-1), "ROLLBACK");
});

Deno.test("linkIdentity bans the linked user when asked", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["FROM trexdb.account a", [{ userId: "u1", disabled: false }]],
  ]);
  await linkIdentity(c, { ...link, banned: true });
  assertEquals(c.ran.some((s) => s.startsWith('UPDATE trexdb."user" SET banned = true')), true);
});

// M-T3: a rollback that itself fails must not replace the real error — same
// rule router.ts's /callback already follows (`.catch(() => {})` around its
// ROLLBACK). Without the guard, linkIdentity would throw "rollback also
// failed" instead of the actual write failure that triggered the rollback.
Deno.test("linkIdentity surfaces the original error even when its ROLLBACK also fails", async () => {
  const c = {
    ran: [] as string[],
    query(sql: string, _params?: unknown[]) {
      const trimmed = sql.replace(/\s+/g, " ").trim();
      c.ran.push(trimmed);
      if (trimmed.includes("FROM trexdb.sso_provider")) {
        return Promise.resolve({ rows: [{ id: "logto" }], rowCount: 1 });
      }
      if (trimmed.includes("FROM trexdb.account a")) {
        return Promise.resolve({ rows: [{ userId: "u1", disabled: false }], rowCount: 1 });
      }
      if (trimmed.startsWith('UPDATE trexdb."user" SET banned')) {
        return Promise.reject(new Error("banned update failed"));
      }
      if (trimmed === "ROLLBACK") {
        return Promise.reject(new Error("rollback also failed"));
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  };
  let caught: unknown;
  try {
    await linkIdentity(c, { ...link, banned: true });
  } catch (err) {
    caught = err;
  }
  assertEquals((caught as Error)?.message, "banned update failed");
  assertEquals(c.ran.at(-1), "ROLLBACK");
});

Deno.test("linkIdentity refuses an unknown provider", async () => {
  const c = fakeClient([]);
  assertEquals(await linkIdentity(c, link), { unknownProvider: true });
});

Deno.test("linkIdentity takes the advisory lock right after BEGIN, before the link check", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["FROM trexdb.account a", [{ userId: "u1", disabled: false }]],
  ]);
  await linkIdentity(c, link);
  const beginIdx = c.ran.indexOf("BEGIN");
  const lockIdx = c.ran.findIndex((s) => s.startsWith("SELECT pg_advisory_xact_lock"));
  const linkCheckIdx = c.ran.findIndex((s) => s.includes("FROM trexdb.account a"));
  assertEquals(beginIdx !== -1 && lockIdx === beginIdx + 1 && linkCheckIdx > lockIdx, true);
});

Deno.test("linkIdentity locks the matched email row so a concurrent link on the same email serializes", async () => {
  const c = fakeClient([
    ["FROM trexdb.sso_provider", [{ id: "logto" }]],
    ["lower(email) = lower($1)", [{ id: "u2" }]],
  ]);
  await linkIdentity(c, link);
  assertEquals(c.ran.some((s) => s.includes('lower(email) = lower($1)') && s.includes("FOR UPDATE")), true);
});

Deno.test("upsertProvider writes every federation column in one statement", async () => {
  const c = fakeClient([]);
  await upsertProvider(c, parseProviderUpsert("logto", validProvider)!);
  assertEquals(c.ran.length, 1);
  assertEquals(c.ran[0].includes("ON CONFLICT (id) DO UPDATE"), true);
  assertEquals(c.ran[0].includes("authorization_endpoint"), true);
});

Deno.test("setProviderEnabled reports whether the provider exists", async () => {
  assertEquals(await setProviderEnabled(fakeClient([["UPDATE trexdb.sso_provider", [{ id: "logto" }]]]), "logto", false), true);
  assertEquals(await setProviderEnabled(fakeClient([]), "logto", false), false);
});
