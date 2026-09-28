import { assertEquals, assertNotEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import { _resetDekCache, _setDekForTests, decryptWithDek } from "../dek.ts";
import { federationEnabled, nativePasswordLoginEnabled } from "./flags.ts";
import { decideLink, emailDomain, emailDomainAllowed, isElevatedRole } from "./link.ts";
import { resolveGroups } from "./groups.ts";
import {
  findLinkedUser,
  PLACEHOLDER_EMAIL_DOMAIN,
  placeholderLocalPart,
  provisionUser,
  readAccountTokens,
  upsertAccount,
} from "./providers.ts";
import { safeRedirectTo } from "./request.ts";
import type { ExistingUser, LinkPolicy } from "./link.ts";
import type { GroupsConfig } from "./groups.ts";
import type { UpstreamIdentity } from "./types.ts";

Deno.test("federationEnabled is off unless explicitly enabled", () => {
  assertEquals(federationEnabled(undefined), false);
  assertEquals(federationEnabled("false"), false);
  assertEquals(federationEnabled("true"), true);
  assertEquals(federationEnabled("1"), true);
});

// The opposite default to federationEnabled, and deliberately so: every
// existing deployment signs in this way.
Deno.test("nativePasswordLoginEnabled is on unless explicitly turned off", () => {
  assertEquals(nativePasswordLoginEnabled(undefined), true);
  assertEquals(nativePasswordLoginEnabled(""), true);
  assertEquals(nativePasswordLoginEnabled("false"), false);
  assertEquals(nativePasswordLoginEnabled("0"), false);
  // A typo leaves sign-in working rather than locking everyone out of the
  // installation they would need to reach to correct it.
  assertEquals(nativePasswordLoginEnabled("FALSE"), true);
  assertEquals(nativePasswordLoginEnabled("no"), true);
});

// Exactly the fields decideLink and resolveGroups declare, because those are
// the only fields either reads. There is no wider provider type to Partial<>
// any more, and inventing one here would put a shape in the tests that no
// caller builds.
type TestProvider = LinkPolicy & GroupsConfig;
const provider = (over: Partial<TestProvider> = {}): TestProvider => ({
  groupsSource: "none",
  groupsClaim: null,
  autoProvision: false,
  emailDomainAllowlist: null,
  allowElevatedAutoLink: false,
  ...over,
});
const identity = (verified: boolean): UpstreamIdentity => ({
  sub: "s-1", email: "jo@example.test", emailVerified: verified,
});

const ordinary = (id = "u-1"): ExistingUser => ({ id, role: "user" });

Deno.test("verified email + existing user links", () => {
  assertEquals(decideLink(identity(true), provider(), ordinary()), {
    action: "link",
    userId: "u-1",
  });
});

Deno.test("unverified email never links, even to an existing user", () => {
  const d = decideLink(identity(false), provider(), ordinary());
  assertEquals(d.action, "refuse");
});

Deno.test("unverified email is refused even when auto-provision is on", () => {
  const d = decideLink(identity(false), provider({ autoProvision: true }), null);
  assertEquals(d.action, "refuse");
});

Deno.test("verified email, no user, auto-provision off is refused", () => {
  const d = decideLink(identity(true), provider(), null);
  assertEquals(d.action, "refuse");
});

Deno.test("verified email, no user, auto-provision on provisions", () => {
  assertEquals(
    decideLink(identity(true), provider({ autoProvision: true }), null),
    { action: "provision" },
  );
});

// ── An upstream address the engine cannot serve ─────────────────────────────
//
// The upstream's `email` claim is taken verbatim — it is an identifier and not
// trex's to rewrite — so an IdP is free to assert one V17 would have refused to
// migrate. auto_provision then writes it, after V17 has run, with no
// administrator in the loop: the only one of the six address-writing routes
// (see isEngineAddressable) that needs none.

const unusable = (over: Partial<UpstreamIdentity> = {}): UpstreamIdentity => ({
  sub: "s-1", email: "alice@localhost", emailVerified: true, ...over,
});

Deno.test("auto-provision refuses an upstream address the engine cannot serve", () => {
  assertEquals(
    decideLink(unusable(), provider({ autoProvision: true }), null),
    { action: "refuse", reason: "upstream_email_unusable" },
  );
});

// The refusal is about writing the address, not about reading it. A row that
// already holds it was vetted by whichever door created it, and linking writes
// no address at all — so this must not start refusing established users.
Deno.test("an unservable upstream address still links to an existing user", () => {
  assertEquals(
    decideLink(unusable(), provider({ autoProvision: true }), ordinary()),
    { action: "link", userId: "u-1" },
  );
});

// Order matters: the cheaper, more specific refusals stay ahead of it, so an
// operator reading the error code learns the first thing that was wrong.
Deno.test("the earlier refusals still win over the addressability check", () => {
  assertEquals(
    decideLink(unusable({ emailVerified: false }), provider({ autoProvision: true }), null),
    { action: "refuse", reason: "upstream_email_unverified" },
  );
  assertEquals(
    decideLink(
      unusable(),
      provider({ autoProvision: true, emailDomainAllowlist: ["corp.test"] }),
      null,
    ),
    { action: "refuse", reason: "email_domain_not_allowed" },
  );
  // auto_provision off is already a refusal, and stays the one reported.
  assertEquals(
    decideLink(unusable(), provider(), null),
    { action: "refuse", reason: "no_account" },
  );
});

// The address-less branch provisions too, and is deliberately NOT guarded: it
// mints a placeholder rather than writing what the upstream said. This asserts
// the exemption is safe rather than assumed.
Deno.test("an identity with no address still provisions, since its placeholder is addressable", () => {
  assertEquals(
    decideLink({ sub: "s-1", email: null, emailVerified: false }, provider({ autoProvision: true }), null),
    { action: "provision" },
  );
});

// ── Link guards: domain allowlist and elevated accounts (link.ts) ──────────

Deno.test("the domain is what follows the LAST '@', lower-cased", () => {
  assertEquals(emailDomain("jo@Example.TEST"), "example.test");
  // A quoted local part may itself contain '@'. Splitting on the first one
  // would read "b" as the domain here, and would let a permissive upstream
  // choose the domain trex checks.
  assertEquals(emailDomain('"a@b"@attacker.test'), "attacker.test");
  assertEquals(emailDomain('"victim@allowed.test"@attacker.test'), "attacker.test");
  // Nothing usable.
  assertEquals(emailDomain("nobody"), null);
  assertEquals(emailDomain("@example.test"), null);
  assertEquals(emailDomain("jo@"), null);
});

Deno.test("a null or empty allowlist restricts nothing", () => {
  assertEquals(emailDomainAllowed("jo@anywhere.test", null), true);
  assertEquals(emailDomainAllowed("jo@anywhere.test", []), true);
});

Deno.test("an allowlist matches the domain case-insensitively", () => {
  assertEquals(emailDomainAllowed("Jo@Example.Test", ["example.test"]), true);
  assertEquals(emailDomainAllowed("jo@example.test", ["EXAMPLE.TEST"]), true);
  assertEquals(emailDomainAllowed("jo@other.test", ["example.test"]), false);
  // A subdomain is a different domain; nothing here implies a suffix match.
  assertEquals(emailDomainAllowed("jo@sub.example.test", ["example.test"]), false);
  // An address with no determinable domain cannot satisfy a restriction.
  assertEquals(emailDomainAllowed("nobody", ["example.test"]), false);
});

Deno.test("a verified email inside the allowlist links as before", () => {
  const p = provider({ emailDomainAllowlist: ["example.test"] });
  assertEquals(decideLink(identity(true), p, ordinary()), { action: "link", userId: "u-1" });
});

Deno.test("a verified email outside the allowlist is refused, with its own reason", () => {
  const p = provider({ emailDomainAllowlist: ["corp.test"] });
  assertEquals(decideLink(identity(true), p, ordinary()), {
    action: "refuse",
    reason: "email_domain_not_allowed",
  });
  // And it cannot provision its way in either: the address is not this
  // provider's to speak for at all.
  assertEquals(
    decideLink(identity(true), provider({ emailDomainAllowlist: ["corp.test"], autoProvision: true }), null),
    { action: "refuse", reason: "email_domain_not_allowed" },
  );
});

Deno.test("a NULL allowlist leaves every existing behaviour untouched", () => {
  const p = provider();
  assertEquals(p.emailDomainAllowlist, null);
  assertEquals(decideLink(identity(true), p, ordinary()), { action: "link", userId: "u-1" });
  assertEquals(
    decideLink(identity(true), provider({ autoProvision: true }), null),
    { action: "provision" },
  );
});

Deno.test("elevated is 'anything but the default role', and NULL is not elevated", () => {
  assertEquals(isElevatedRole("admin"), true);
  assertEquals(isElevatedRole("ADMIN"), true);
  // A privileged value a deployment adds later must not fall outside the guard
  // just because it is not spelled 'admin'.
  assertEquals(isElevatedRole("superuser"), true);
  assertEquals(isElevatedRole("user"), false);
  assertEquals(isElevatedRole(" User "), false);
  assertEquals(isElevatedRole(null), false);
  assertEquals(isElevatedRole(undefined), false);
  assertEquals(isElevatedRole(""), false);
});

Deno.test("an elevated target is not auto-linked by default", () => {
  const admin: ExistingUser = { id: "u-admin", role: "admin" };
  assertEquals(decideLink(identity(true), provider(), admin), {
    action: "refuse",
    reason: "elevated_account_link_refused",
  });
});

Deno.test("an elevated target links when the provider opts in", () => {
  const admin: ExistingUser = { id: "u-admin", role: "admin" };
  assertEquals(
    decideLink(identity(true), provider({ allowElevatedAutoLink: true }), admin),
    { action: "link", userId: "u-admin" },
  );
});

Deno.test("the two guards compose: an opted-in provider still obeys its allowlist", () => {
  const admin: ExistingUser = { id: "u-admin", role: "admin" };
  const p = provider({ allowElevatedAutoLink: true, emailDomainAllowlist: ["corp.test"] });
  assertEquals(decideLink(identity(true), p, admin), {
    action: "refuse",
    reason: "email_domain_not_allowed",
  });
});

Deno.test("ordinary users are unaffected by the elevated guard", () => {
  for (const role of ["user", null, ""]) {
    assertEquals(
      decideLink(identity(true), provider(), { id: "u-1", role }),
      { action: "link", userId: "u-1" },
    );
  }
});

// ── First-time identities carrying no address at all ────────────────────────

const noEmail: UpstreamIdentity = { sub: "s-1", email: null, emailVerified: false };

// The address is what an allowlist restricts, so with none there is no way to
// tell whether the restriction is met — the same call this module already makes
// for an address whose domain cannot be determined.
Deno.test("a first-time identity with no email is refused under an allowlist", () => {
  assertEquals(
    decideLink(noEmail, provider({ emailDomainAllowlist: ["corp.test"] }), null),
    { action: "refuse", reason: "email_domain_not_allowed" },
  );
  // Including where it would otherwise have been provisioned.
  assertEquals(
    decideLink(
      noEmail,
      provider({ emailDomainAllowlist: ["corp.test"], autoProvision: true }),
      null,
    ),
    { action: "refuse", reason: "email_domain_not_allowed" },
  );
});

// email_verified is absent from a token with no email, so the unverified rule
// would refuse every such identity if it ran first. It is not the rule here:
// an identity asserting no address can claim no existing account.
Deno.test("a first-time identity with no email provisions under auto-provision", () => {
  assertEquals(
    decideLink(noEmail, provider({ autoProvision: true }), null),
    { action: "provision" },
  );
});

Deno.test("a first-time identity with no email and no auto-provision is refused", () => {
  assertEquals(
    decideLink(noEmail, provider(), null),
    { action: "refuse", reason: "no_account" },
  );
});

// ── Group resolution (groups.ts) ────────────────────────────────────────────

Deno.test("groups_source 'claim' reads the configured claim, raw", () => {
  const p = provider({ groupsSource: "claim", groupsClaim: "roles" });
  // Order, case and duplicates are the upstream's to decide; d2e maps them.
  assertEquals(
    resolveGroups({ roles: ["Zeta", "alpha", "Zeta"] }, p),
    ["Zeta", "alpha", "Zeta"],
  );
});

Deno.test("groups_claim names an arbitrary claim, not just 'groups'", () => {
  const claims = { groups: ["wrong"], "http://schemas.test/groups": ["right"] };
  assertEquals(
    resolveGroups(claims, provider({
      groupsSource: "claim",
      groupsClaim: "http://schemas.test/groups",
    })),
    ["right"],
  );
});

Deno.test("an absent, empty or non-array claim yields no groups, never an error", () => {
  const p = provider({ groupsSource: "claim", groupsClaim: "groups" });
  assertEquals(resolveGroups({}, p), []);
  assertEquals(resolveGroups({ groups: [] }, p), []);
  assertEquals(resolveGroups({ groups: null }, p), []);
  assertEquals(resolveGroups({ groups: "admins" }, p), []);
  assertEquals(resolveGroups({ groups: { a: 1 } }, p), []);
  // Configured for claims but with no claim named: nothing to read.
  assertEquals(
    resolveGroups({ groups: ["a"] }, provider({ groupsSource: "claim", groupsClaim: null })),
    [],
  );
});

// A partial list that looks complete is worse than none: the relying party
// would map it to roles and silently under-grant.
Deno.test("an array with non-string members is treated as no group list", () => {
  const p = provider({ groupsSource: "claim", groupsClaim: "groups" });
  assertEquals(resolveGroups({ groups: ["a", 2] }, p), []);
  assertEquals(resolveGroups({ groups: [{ id: "a" }] }, p), []);
});

Deno.test("'none' and (for now) 'graph' resolve to no groups", () => {
  const claims = { groups: ["admins"] };
  assertEquals(resolveGroups(claims, provider({ groupsSource: "none", groupsClaim: "groups" })), []);
  // The MS Graph resolver is a later phase; until it exists this must be an
  // empty list rather than the id_token claim it would not have used anyway.
  assertEquals(resolveGroups(claims, provider({ groupsSource: "graph", groupsClaim: "groups" })), []);
});

// ── The link lookup the federation ADMIN api still uses (providers.ts) ──────
//
// resolveFederatedUser and findLinkCandidateByEmail are gone: the sign-in path
// makes those decisions in resolve-user.ts, through Better Auth's adapter, and
// resolve-user.test.ts pins them. findLinkedUser survived because linkIdentity
// still calls it, so it is still tested — for what linkIdentity actually reads.

/** A pg client stubbed by which statement it is asked to run. */
function stubClient(rows: unknown[]) {
  const seen: string[] = [];
  return {
    seen,
    // deno-lint-ignore no-explicit-any
    query(sql: string, params: unknown[]): Promise<any> {
      seen.push(sql.replace(/\s+/g, " ").trim());
      if (sql.includes("FROM trexdb.account a")) return Promise.resolve({ rows });
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

Deno.test("an existing link is found by (providerId, accountId), and only the id is read", async () => {
  const client = stubClient([{ userId: "u-1" }]);
  assertEquals(await findLinkedUser(client, "logto", "s-1"), { userId: "u-1" });
  // Keyed on BOTH columns: UNIQUE("providerId","accountId") is the identity, and
  // a lookup on accountId alone would hand one upstream's subject the account
  // another upstream owns.
  assertEquals(client.seen.length, 1);
  assertStringIncludes(client.seen[0], 'a."providerId" = $1 AND a."accountId" = $2');
  // The JOIN is load-bearing rather than decoration: a link whose user row has
  // gone must read as NO link, not as a link to a missing id.
  assertStringIncludes(client.seen[0], 'JOIN trexdb."user" u ON u.id = a."userId"');
});

Deno.test("no link, or a link the JOIN drops, is reported as no link at all", async () => {
  assertEquals(await findLinkedUser(stubClient([]), "logto", "s-1"), null);
});

// ── Upstream tokens at rest (providers.ts) ─────────────────────────────────
//
// Both subjects are still here, so these cases are: upsertAccount is the
// statement the federation ADMIN link runs (admin-store.ts's linkIdentity), and
// readAccountTokens is the only sanctioned reader of the three ciphertext
// columns — V21's column comment names it as such, and phase 5's token broker
// is the consumer it exists for.
//
// One honest limit on what they are evidence OF. No live caller passes
// upsertAccount a token any more: linkIdentity supplies only
// (userId, providerId, accountId), and the sign-in path's writes go through
// account-tokens.ts's Better Auth hooks, which seal independently and are
// pinned in account-tokens.test.ts. So the sealing half below pins a capability
// the statement has rather than one anything currently exercises, and the
// COALESCE half reads back through captureClient's own emulation of the ON
// CONFLICT clause — the load-bearing assertion there is that an absent token
// reaches SQL as NULL, which is real; the read-back is the stub agreeing with
// itself. What actually preserves a stored refresh token in production is
// V21's trg_account_preserve_refresh_token, pinned against a real database.

/**
 * The DEK is a process-wide singleton, so pin a known one for these tests and
 * clear it afterwards rather than leaving it set for whatever file deno runs
 * next.
 */
function withDek(): void {
  _setDekForTests(crypto.getRandomValues(new Uint8Array(32)));
}

/** Captures the parameter array upsertAccount would send to Postgres. */
function captureClient(stored: Record<string, unknown> = {}) {
  const calls: unknown[][] = [];
  return {
    calls,
    stored,
    query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }> {
      if (sql.includes("INSERT INTO trexdb.account")) {
        calls.push(params);
        // Emulate the ON CONFLICT COALESCE: a NULL incoming refresh token
        // leaves whatever is stored, anything else replaces it.
        stored.accessToken = params[4];
        stored.refreshToken = params[5] ?? stored.refreshToken ?? null;
        stored.idToken = params[8];
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("FROM trexdb.account")) {
        return Promise.resolve({ rows: [{ userId: "u-1", ...stored }] });
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

Deno.test("upstream tokens are ciphertext in the row and plaintext through the reader", async () => {
  withDek();
  try {
    const client = captureClient();
    await upsertAccount(client, {
      userId: "u-1",
      providerId: "logto",
      accountId: "s-1",
      accessToken: "upstream-access",
      refreshToken: "upstream-refresh",
      idToken: "upstream-id",
      scope: "openid email",
    });

    const [params] = client.calls;
    // Nothing recognisable reaches the statement.
    for (const [i, plain] of [[4, "upstream-access"], [5, "upstream-refresh"], [8, "upstream-id"]] as const) {
      const stored = params[i] as string;
      assertNotEquals(stored, plain);
      assertEquals(stored.includes(plain), false);
      // …and it really is this DEK's ciphertext, not an encoding.
      assertEquals(await decryptWithDek(stored), plain);
    }
    // scope is not a credential and stays readable, as before.
    assertEquals(params[7], "openid email");

    const back = await readAccountTokens(client, "logto", "s-1");
    assertEquals(back?.accessToken, "upstream-access");
    assertEquals(back?.refreshToken, "upstream-refresh");
    assertEquals(back?.idToken, "upstream-id");
  } finally {
    _resetDekCache();
  }
});

Deno.test("the same token seals differently every time (fresh IV)", async () => {
  withDek();
  try {
    const a = captureClient();
    const b = captureClient();
    const args = { userId: "u-1", providerId: "logto", accountId: "s-1", accessToken: "same" };
    await upsertAccount(a, args);
    await upsertAccount(b, args);
    assertNotEquals(a.calls[0][4], b.calls[0][4]);
    // Which is exactly why nothing may compare these columns — only null-test
    // them, as the ON CONFLICT COALESCE does.
  } finally {
    _resetDekCache();
  }
});

// The behaviour the plaintext version had, which encrypting must not break:
// a provider that issues a refresh token only on first authorization must not
// have it destroyed by the next sign-in.
Deno.test("an absent refresh token reaches SQL as NULL, so COALESCE preserves the stored one", async () => {
  withDek();
  try {
    const client = captureClient();
    await upsertAccount(client, {
      userId: "u-1", providerId: "logto", accountId: "s-1",
      accessToken: "a1", refreshToken: "the-only-refresh-token",
    });
    for (const absent of [undefined, ""]) {
      await upsertAccount(client, {
        userId: "u-1", providerId: "logto", accountId: "s-1",
        accessToken: "a2", refreshToken: absent,
      });
      // NULL, not a ciphertext of "" — a ciphertext is non-null and COALESCE
      // would take it, wiping the stored token.
      assertEquals(client.calls.at(-1)?.[5], null);
    }
    const back = await readAccountTokens(client, "logto", "s-1");
    assertEquals(back?.refreshToken, "the-only-refresh-token");
    assertEquals(back?.accessToken, "a2");
  } finally {
    _resetDekCache();
  }
});

Deno.test("a NULL token column reads back as null rather than failing", async () => {
  withDek();
  try {
    const client = captureClient();
    await upsertAccount(client, { userId: "u-1", providerId: "logto", accountId: "s-1" });
    assertEquals(client.calls[0][4], null);
    assertEquals(client.calls[0][8], null);
    const back = await readAccountTokens(client, "logto", "s-1");
    assertEquals(back, {
      userId: "u-1", accessToken: null, refreshToken: null, idToken: null,
      accessTokenExpiresAt: null, scope: null,
    });
    assertEquals(await readAccountTokens(captureClientEmpty(), "logto", "s-1"), null);
  } finally {
    _resetDekCache();
  }
});

function captureClientEmpty() {
  return { query: () => Promise.resolve({ rows: [] }) };
}

// Fail closed: storing a live upstream credential in the clear because
// encryption was unavailable is the outcome this change exists to prevent.
Deno.test("with no DEK the write fails rather than storing plaintext", async () => {
  _resetDekCache();
  const client = captureClient();
  await assertRejects(
    () =>
      upsertAccount(client, {
        userId: "u-1", providerId: "logto", accountId: "s-1", accessToken: "upstream-access",
      }),
    Error,
    "could not encrypt upstream access token",
  );
  assertEquals(client.calls.length, 0);
});

Deno.test("an undecryptable stored token is surfaced, not silently reported absent", async () => {
  withDek();
  try {
    // What a row written before these columns were encrypted looks like.
    const client = captureClient({ accessToken: "plaintext-from-an-older-row" });
    const err = await assertRejects(() => readAccountTokens(client, "logto", "s-1"), Error);
    assertStringIncludes(err.message, "could not decrypt stored upstream access token");
  } finally {
    _resetDekCache();
  }
});

// ── Request shaping for the RP routes (request.ts) ──────────────────────────

Deno.test("redirect_to accepts same-origin paths", () => {
  assertEquals(safeRedirectTo("/atlas/"), "/atlas/");
  assertEquals(safeRedirectTo("/d2e/portal?x=1"), "/d2e/portal?x=1");
});

Deno.test("redirect_to rejects absolute URLs and protocol-relative ones", () => {
  assertEquals(safeRedirectTo("https://evil.test/x"), "/");
  assertEquals(safeRedirectTo("//evil.test/x"), "/");
  assertEquals(safeRedirectTo("javascript:alert(1)"), "/");
});

Deno.test("redirect_to falls back when absent or malformed", () => {
  assertEquals(safeRedirectTo(undefined), "/");
  assertEquals(safeRedirectTo(""), "/");
  // A repeated query parameter arrives as an array, whatever the cast claims.
  assertEquals(safeRedirectTo(["/a", "/b"] as unknown as string), "/");
});

// Browsers normalise a backslash to a slash in the authority position, so
// "/\evil.test" is protocol-relative in practice even though it is not "//".
// Control characters are stripped before parsing, which re-forms "//host" out
// of something that passed a naive prefix check.
Deno.test("redirect_to rejects backslash and control-character smuggling", () => {
  assertEquals(safeRedirectTo("/\\evil.test/x"), "/");
  assertEquals(safeRedirectTo("/\t/evil.test/x"), "/");
  assertEquals(safeRedirectTo("/\n/evil.test"), "/");
});

// ── Placeholder addresses (providers.ts) ─────────────────────────────────────
//
// V17 restored user.email NOT NULL, so the branch decideLink routes an
// address-less identity down — {action:"provision"} under autoProvision —
// cannot write a NULL any more. These pin the rule that replaced it, which is
// shared by hand with V17's DO block.

Deno.test("the placeholder local part is the slug V17 computes", () => {
  assertEquals(placeholderLocalPart("Alice.Example"), "alice.example");
  assertEquals(placeholderLocalPart("alice example"), "alice-example");
  assertEquals(placeholderLocalPart("carol@corp.example"), "carol-corp.example");
  // btrim(…, '-.') at both ends: a local part may neither start nor end with a
  // dot, and a run of rejected characters must not leave a trailing dash.
  assertEquals(placeholderLocalPart(".weird!"), "weird");
  // Nothing usable survives. The caller has to notice rather than mint the
  // address `@d2e.local`.
  assertEquals(placeholderLocalPart("###"), "");
});

/** Answers provisionUser's collision probe and records what it would insert. */
function provisionClient(taken: string[] = []) {
  const inserts: unknown[][] = [];
  return {
    inserts,
    query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }> {
      if (sql.includes('INSERT INTO trexdb."user"')) {
        inserts.push(params);
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes("lower(email) = $1")) {
        return Promise.resolve({ rows: taken.includes(params[0] as string) ? [{ one: 1 }] : [] });
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

const anonymous = (sub: string) => ({ sub, email: null, emailVerified: false });

Deno.test("an identity asserting no address is provisioned with a flagged placeholder", async () => {
  const c = provisionClient();
  assertEquals(await provisionUser(c, anonymous("Alice.Example"), { id: "u-1" }), "u-1");
  // Unverified and flagged. The flag is what every mail path tells a
  // synthesised address by, and what resolve-user.ts's findCandidate excludes
  // on;
  // `"emailVerified"` false is a true statement about a row nobody asserted and
  // protects nothing on its own, since decideLink reads the incoming identity.
  assertEquals(c.inserts, [[
    "u-1",
    "Alice.Example",
    `alice.example@${PLACEHOLDER_EMAIL_DOMAIN}`,
    false,
    true,
  ]]);
});

Deno.test("a subject that slugifies to nothing falls back to the user id", async () => {
  const c = provisionClient();
  await provisionUser(c, anonymous("###"), { id: "u-1" });
  assertEquals(c.inserts[0][2], `u-1@${PLACEHOLDER_EMAIL_DOMAIN}`);
});

Deno.test("a placeholder whose slug is taken falls back to the user id", async () => {
  const c = provisionClient([`alice.example@${PLACEHOLDER_EMAIL_DOMAIN}`]);
  await provisionUser(c, anonymous("Alice.Example"), { id: "u-2" });
  assertEquals(c.inserts[0][2], `u-2@${PLACEHOLDER_EMAIL_DOMAIN}`);
});

Deno.test("a placeholder with no address left is refused, never attached to one", async () => {
  const c = provisionClient([
    `alice.example@${PLACEHOLDER_EMAIL_DOMAIN}`,
    `u-2@${PLACEHOLDER_EMAIL_DOMAIN}`,
  ]);
  await assertRejects(
    () => provisionUser(c, anonymous("Alice.Example"), { id: "u-2" }),
    Error,
    "already taken",
  );
  assertEquals(c.inserts, []);
});

Deno.test("a user id that slugifies to nothing is refused rather than given `@domain`", async () => {
  const c = provisionClient();
  await assertRejects(
    () => provisionUser(c, anonymous("###"), { id: "!!!" }),
    Error,
    "no usable local part",
  );
  assertEquals(c.inserts, []);
});

Deno.test("an identity that asserts an address is provisioned with it, verified and unflagged", async () => {
  const c = provisionClient();
  await provisionUser(
    c,
    { sub: "s-1", email: "jo@example.test", emailVerified: true },
    { id: "u-1" },
  );
  assertEquals(c.inserts, [["u-1", "jo@example.test", "jo@example.test", true, false]]);
});

// An address IN the placeholder domain, supplied rather than synthesised. The
// federation admin link cannot reach the synthesis branch at all —
// parseLinkRequest requires an '@' — so a migration with no address to give
// sends `<username>@<its configured domain>`, which at d2e's default is this
// exact string. 66 of 69 rehearsed users landed here, unflagged, verified and
// confirmed: link candidates again, and a lie to any mail path that reads the
// flag.
Deno.test("an asserted address in the placeholder domain is flagged like a synthesised one", async () => {
  const c = provisionClient();
  await provisionUser(
    c,
    { sub: "s-1", email: `alice@${PLACEHOLDER_EMAIL_DOMAIN}`, emailVerified: true },
    { id: "u-1" },
  );
  // emailVerified false and the flag true — identical to the synthesis branch,
  // which is the point: a row from either must be indistinguishable. The name
  // is the existing fallback chain (name ?? email ?? sub) and is deliberately
  // not part of this change: it is what an administrator's list shows, and the
  // address is the only identifier this caller supplied.
  assertEquals(c.inserts, [[
    "u-1",
    `alice@${PLACEHOLDER_EMAIL_DOMAIN}`,
    `alice@${PLACEHOLDER_EMAIL_DOMAIN}`,
    false,
    true,
  ]]);
});

// Keyed on the domain, so case and subdomain are decided by emailDomain's rule
// rather than by a substring test that `evil-d2e.local` would slip past.
Deno.test("the placeholder domain is matched case-insensitively and exactly", async () => {
  const upper = provisionClient();
  await provisionUser(upper, { sub: "s-1", email: "alice@D2E.Local", emailVerified: true }, { id: "u-1" });
  assertEquals(upper.inserts[0][4], true);

  for (const notIt of ["alice@evil-d2e.local", "alice@d2e.local.evil.test", "alice@sub.d2e.local"]) {
    const c = provisionClient();
    await provisionUser(c, { sub: "s-1", email: notIt, emailVerified: true }, { id: "u-1" });
    assertEquals(c.inserts[0][4], false, notIt);
    assertEquals(c.inserts[0][3], true, notIt);
  }
});

// Gated on DATABASE_URL like admin.test.ts's [db] block: the stubs above pin
// which address is computed, but only a real database proves the row V17's
// NOT NULL constraints will actually accept — which is the difference between
// a placeholder and a 500 on the first sign-in of a username-only user.
const provisionDbUrl = Deno.env.get("DATABASE_URL");

Deno.test({
  name: "[db] provisioning an address-less identity writes a row V17 accepts",
  ignore: !provisionDbUrl,
  fn: async () => {
    const { Client } = await import("npm:pg");
    const db = new Client({ connectionString: provisionDbUrl });
    await db.connect();
    const run = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    try {
      const id = await provisionUser(db, anonymous(`Sub ${run}`), { id: `p${run}` });
      const { rows } = await db.query(
        `SELECT email, "emailVerified", is_placeholder_email, email_confirmed_at
           FROM trexdb."user" WHERE id = $1`,
        [id],
      );
      assertEquals(rows, [{
        email: `sub-${run}@${PLACEHOLDER_EMAIL_DOMAIN}`,
        emailVerified: false,
        is_placeholder_email: true,
        email_confirmed_at: null,
      }]);
    } finally {
      await db.query(`DELETE FROM trexdb."user" WHERE id LIKE $1`, [`p${run}%`]);
      await db.end();
    }
  },
});

// The two db cases that used to sit here — "an upstream cannot claim an account
// through its placeholder address" and "a migrated user with a placeholder
// address still signs in through its link" — drove findLinkCandidateByEmail and
// resolveFederatedUser, which are gone. Both moved to resolve-user.test.ts, with
// their rows and their decoy intact, where they run against the real adapter
// that actually makes the decision now.

// The exclusion is only correct while the address is still synthesised. V17's
// column comment defines the flag as "the address is synthesised, not a contact
// address", so an address the account holder supplied has to clear it — and
// PUT /user is the one route that writes a caller-supplied address. Without the
// clear, closing the takeover path would have made every placeholder user
// permanently unlinkable: a provider asserting the address they had just set
// would get `no_account`, or, under auto-provision, a UNIQUE violation on
// user_email_key surfacing as a 500 out of /callback.
//
// Driven through the real route rather than an UPDATE of its own: what is being
// pinned is that the handler clears the flag, which a hand-written statement
// would assert about itself.
Deno.test({
  name: "[db] a placeholder user who sets a real address becomes linkable again",
  ignore: !provisionDbUrl,
  // ../db.ts owns a pool that deliberately outlives the test, as in
  // auth-router.contract.test.ts.
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { Client } = await import("npm:pg");
    const express = (await import("express")).default;
    const { authRouter } = await import("../auth-router.ts");
    const { _resetJwtSecretCache, signAccessToken } = await import("../jwt.ts");
    const { _resetRootKeyCache } = await import("../keys.ts");

    _resetRootKeyCache();
    _resetJwtSecretCache();
    Deno.env.set("TREX_ROOT_KEY", btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i))));

    const db = new Client({ connectionString: provisionDbUrl });
    await db.connect();
    const run = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const chosen = `chosen-${run}@example.test`;
    const app = express();
    app.use("/trex/auth/v1", authRouter);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", () => r()));
    const { port } = server.address() as { port: number };
    try {
      const id = await provisionUser(db, anonymous(`Sub ${run}`), { id: `p${run}` });
      const token = await signAccessToken({ id, email: null, role: "user" }, crypto.randomUUID());

      const res = await fetch(`http://127.0.0.1:${port}/trex/auth/v1/user`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: chosen }),
      });
      assertEquals(res.status, 200);
      await res.body?.cancel();

      const { rows } = await db.query(
        `SELECT email, is_placeholder_email FROM trexdb."user" WHERE id = $1`,
        [id],
      );
      assertEquals(rows, [{ email: chosen, is_placeholder_email: false }]);

      // The other half of the clear — that a provider asserting the address they
      // chose now links rather than refusing — is pinned where the decision is
      // made, in resolve-user.test.ts's "[db] a placeholder-addressed user is
      // not a candidate through the real adapter", which flips this same flag
      // and signs the identity in. Asserting it here would mean rebuilding
      // Better Auth's adapter beside a raw pg client to reach a resolver that
      // needs one.
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      await db.query(`DELETE FROM trexdb."user" WHERE id LIKE $1`, [`p${run}%`]);
      await db.end();
    }
  },
});
