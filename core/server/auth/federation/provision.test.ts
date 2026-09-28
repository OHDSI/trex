// The idp block and the sign-in stamp, as statements rather than as a
// redirect. The end-to-end proof that these reach the table is in
// sso-callback.test.ts — a unit test on a resolver function cannot tell a
// write that happens from one that is never called, and this task exists
// because the columns groups_source and groups_claim were read by nothing.
import { assertEquals } from "jsr:@std/assert";
import { SignJWT } from "npm:jose";
import { provisionSsoUser } from "./provision.ts";

type Statement = [string, unknown[]];

/** A client that records what it was asked to run and answers nothing. */
function recorder() {
  const statements: Statement[] = [];
  return {
    statements,
    query: (sql: string, params: unknown[]) => {
      statements.push([sql, params]);
      return Promise.resolve({ rows: [] });
    },
  };
}

/** An id_token-shaped string carrying these claims, unsigned. */
async function idTokenFor(claims: Record<string, unknown>): Promise<string> {
  // Signed with an all-zero HMAC key: provisionSsoUser never verifies, and the
  // point of using a real JWT rather than a hand-rolled string is that the
  // decoder is measured against the encoding a real upstream emits.
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .sign(new Uint8Array(32));
}

/** The idp block the single recorded statement would write. */
function idpBlock(statements: Statement[]): { provider: string; groups: string[] } {
  assertEquals(statements.length, 1);
  assertEquals(statements[0][1][1], "idp");
  return JSON.parse(statements[0][1][2] as string);
}

Deno.test("the idp block records the provider and the groups it asserted", async () => {
  // The OIDC provider's fetchUser() is handed nothing but a user id — no
  // session row, no code record — so the fact has to be durable and keyed by
  // the user. A native password sign-in drops the block again, so it always
  // describes the most recent sign-in rather than accumulating.
  const client = recorder();
  await provisionSsoUser({
    user: { id: "u1" },
    userInfo: {},
    provider: { providerId: "logto", groups_source: "claim", groups_claim: "roles" },
    token: { idToken: await idTokenFor({ sub: "s1", roles: ["alp-admins", "study-42"] }) },
  }, client);

  assertEquals(idpBlock(client.statements), {
    provider: "logto",
    groups: ["alp-admins", "study-42"],
  });
  assertEquals(client.statements[0][1][0], "u1");
});

Deno.test("the groups are passed through raw, in the order the upstream stated them", async () => {
  // trex resolves group membership; d2e maps groups to roles. A relying party
  // that receives a re-ordered or de-duplicated list cannot reason about it,
  // so the block must hold what was asserted and not a tidied version.
  const client = recorder();
  await provisionSsoUser({
    user: { id: "u1" },
    userInfo: {},
    provider: { providerId: "entra", groups_source: "claim", groups_claim: "groups" },
    token: { idToken: await idTokenFor({ sub: "s1", groups: ["b", "a", "b"] }) },
  }, client);
  assertEquals(idpBlock(client.statements).groups, ["b", "a", "b"]);
});

Deno.test("a provider with groups_source 'none' still stamps last_sign_in_at", async () => {
  // Parity with the native grants, which stamp it on every successful login.
  // Without it a federated user never records a sign-in.
  const client = recorder();
  await provisionSsoUser({
    user: { id: "u1" },
    userInfo: {},
    // The column's own default, so this is the shape most rows carry.
    provider: { providerId: "plain", groups_source: "none", groups_claim: null },
    token: { idToken: await idTokenFor({ sub: "s1", roles: ["ignored"] }) },
  }, client);

  assertEquals(idpBlock(client.statements), { provider: "plain", groups: [] });
  assertEquals(client.statements[0][0].includes("last_sign_in_at = NOW()"), true);
});

Deno.test("the write merges into app_metadata rather than replacing it", async () => {
  // user_metadata and the rest of app_metadata belong to trex and to d2e. A
  // SET app_metadata = <block> would drop every other key on each sign-in.
  const client = recorder();
  await provisionSsoUser({
    user: { id: "u1" },
    userInfo: {},
    provider: { providerId: "plain", groups_source: "none", groups_claim: null },
    token: { idToken: await idTokenFor({ sub: "s1" }) },
  }, client);
  const sql = client.statements[0][0];
  assertEquals(sql.includes("COALESCE(app_metadata, '{}'::jsonb)"), true);
  assertEquals(sql.includes("||"), true);
});

Deno.test("group resolution never fails the sign-in", async () => {
  // A non-array claim, an array with non-string members, an absent claim, a
  // claim name the provider never set, an unparseable token and no token at
  // all: every one yields no groups and still writes the block. A sign-in
  // must not fail over group metadata — and it cannot be retried, because
  // provisionUser runs after the session was already committed.
  const cases: Array<[string, { idToken?: string }, Record<string, unknown>]> = [
    ["a non-array claim", { idToken: await idTokenFor({ roles: "alp-admins" }) }, {
      groups_source: "claim",
      groups_claim: "roles",
    }],
    ["an array with non-string members", {
      idToken: await idTokenFor({ roles: ["ok", 7] }),
    }, { groups_source: "claim", groups_claim: "roles" }],
    ["an absent claim", { idToken: await idTokenFor({ sub: "s1" }) }, {
      groups_source: "claim",
      groups_claim: "roles",
    }],
    ["no groups_claim configured", { idToken: await idTokenFor({ roles: ["x"] }) }, {
      groups_source: "claim",
      groups_claim: null,
    }],
    ["groups_source graph, not yet implemented", {
      idToken: await idTokenFor({ roles: ["x"] }),
    }, { groups_source: "graph", groups_claim: "roles" }],
    ["a token that is not a JWT", { idToken: "not-a-jwt" }, {
      groups_source: "claim",
      groups_claim: "roles",
    }],
    ["a JWT whose payload is not base64url", { idToken: "a.!!!.c" }, {
      groups_source: "claim",
      groups_claim: "roles",
    }],
    ["a JWT whose payload is not an object", {
      idToken: `a.${btoa('"nope"').replace(/=+$/, "")}.c`,
    }, { groups_source: "claim", groups_claim: "roles" }],
    ["no token at all", {}, { groups_source: "claim", groups_claim: "roles" }],
  ];

  for (const [what, token, provider] of cases) {
    const client = recorder();
    await provisionSsoUser({
      user: { id: "u1" },
      userInfo: {},
      provider: { providerId: "p", ...provider },
      token,
    }, client);
    assertEquals(idpBlock(client.statements), { provider: "p", groups: [] }, what);
  }
});
