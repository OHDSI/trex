import { assertEquals, assertNotEquals, assertRejects, assertStringIncludes, assertThrows } from "jsr:@std/assert";
import { _resetDekCache, _setDekForTests, decryptWithDek } from "../dek.ts";
import { federationEnabled, nativePasswordLoginEnabled } from "./flags.ts";
import { decideLink, emailDomain, emailDomainAllowed, isElevatedRole } from "./link.ts";
import { resolveGroups } from "./groups.ts";
import {
  findLinkCandidateByEmail,
  findLinkedUser,
  loadProviders,
  PLACEHOLDER_EMAIL_DOMAIN,
  placeholderLocalPart,
  provisionUser,
  readAccountTokens,
  resolveFederatedUser,
  upsertAccount,
} from "./providers.ts";
import { safeRedirectTo } from "./request.ts";
import type { ExistingUser } from "./link.ts";
import type { ProviderConfig, UpstreamIdentity } from "./types.ts";

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

const provider = (over: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: "logto", displayName: "Logto", clientId: "c", clientSecret: "s",
  issuer: "https://logto.test/oidc", discoveryUrl: "https://logto.test/d",
  authorizationEndpoint: null,
  scopes: "openid profile email", claimMap: {}, groupsSource: "none",
  groupsClaim: null, linkPolicy: "verified_email", autoProvision: false,
  emailDomainAllowlist: null, allowElevatedAutoLink: false, ...over,
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

// The guards are only as good as the configuration reaching them, and the
// column→field mapping is the one part of that with no type to catch it.
Deno.test("the link guards are loaded off sso_provider onto ProviderConfig", async () => {
  const row = (over: Record<string, unknown>) => ({
    id: "logto", displayName: "Logto", clientId: "c", clientSecret: "s",
    issuer: "https://logto.test/oidc", discovery_url: null,
    scopes: "openid profile email", claim_map: {}, groups_source: "none",
    groups_claim: null, link_policy: "verified_email", auto_provision: false, ...over,
  });
  const load = async (over: Record<string, unknown>) =>
    (await loadProviders({ query: () => Promise.resolve({ rows: [row(over)] }) })).get("logto")!;

  const configured = await load({
    // As an operator would plausibly write them: mixed case, padding, and the
    // '@' they think of as part of a domain.
    email_domain_allowlist: [" Corp.TEST ", "@example.test"],
    allow_elevated_auto_link: true,
  });
  assertEquals(configured.emailDomainAllowlist, ["corp.test", "example.test"]);
  assertEquals(configured.allowElevatedAutoLink, true);

  // Unset, and an empty list, both mean "no restriction" — an existing row is
  // exactly as unrestricted as it was before these columns existed.
  for (const allowlist of [null, undefined, []]) {
    const p = await load({ email_domain_allowlist: allowlist });
    assertEquals(p.emailDomainAllowlist, null);
    assertEquals(p.allowElevatedAutoLink, false);
  }
  // Anything short of boolean true leaves the elevated guard on.
  for (const raw of [undefined, null, "true", 1]) {
    assertEquals((await load({ allow_elevated_auto_link: raw })).allowElevatedAutoLink, false);
  }
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

// ── Identity resolution (providers.ts) ──────────────────────────────────────

/**
 * A pg client stubbed by which statement it is asked to run. Enough to drive
 * resolveFederatedUser, which is the only place the two lookups are ordered
 * against each other, without a database.
 */
function stubClient(rows: { linked?: unknown[]; byEmail?: unknown[] }) {
  const seen: string[] = [];
  return {
    seen,
    // deno-lint-ignore no-explicit-any
    query(sql: string, _params: unknown[]): Promise<any> {
      // The link lookup joins user, so it must be recognised first.
      if (sql.includes("FROM trexdb.account a")) {
        seen.push("link");
        return Promise.resolve({ rows: rows.linked ?? [] });
      }
      if (sql.includes('FROM trexdb."user"')) {
        seen.push("email");
        return Promise.resolve({ rows: rows.byEmail ?? [] });
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

Deno.test("an existing link is found and reports whether its user is disabled", async () => {
  const live = await findLinkedUser(
    stubClient({ linked: [{ userId: "u-1", disabled: false }] }),
    "logto",
    "s-1",
  );
  assertEquals(live, { userId: "u-1", disabled: false });

  const banned = await findLinkedUser(
    stubClient({ linked: [{ userId: "u-1", disabled: true }] }),
    "logto",
    "s-1",
  );
  assertEquals(banned, { userId: "u-1", disabled: true });

  assertEquals(await findLinkedUser(stubClient({}), "logto", "s-1"), null);
});

// The upstream changed the address. The link is the identity, so the sign-in
// lands on the linked user and never looks at whoever now holds that email.
Deno.test("an existing link wins over a different email", async () => {
  const client = stubClient({
    linked: [{ userId: "u-linked", disabled: false }],
    byEmail: [{ id: "u-someone-else" }],
  });
  assertEquals(
    await resolveFederatedUser(client, provider(), {
      sub: "s-1",
      email: "changed@example.test",
      emailVerified: true,
    }),
    { action: "link", userId: "u-linked" },
  );
  // Not merely outranked: the email question is never asked.
  assertEquals(client.seen, ["link"]);
});

// An unverified upstream email would refuse a *new* link; it is irrelevant to
// one that already exists, because no linking decision is being made.
Deno.test("an existing link does not re-ask the verified-email question", async () => {
  const client = stubClient({ linked: [{ userId: "u-linked", disabled: false }] });
  assertEquals(
    await resolveFederatedUser(client, provider(), {
      sub: "s-1",
      email: "jo@example.test",
      emailVerified: false,
    }),
    { action: "link", userId: "u-linked" },
  );
  assertEquals(client.seen, ["link"]);
});

// The case this whole change exists for. d2e's migration pre-links every Logto
// user by subject before anyone signs in, and most of those accounts have no
// address, so the established link has to carry the sign-in on its own.
Deno.test("an established link signs in with no email whatsoever", async () => {
  const client = stubClient({ linked: [{ userId: "u-linked", disabled: false }] });
  assertEquals(
    await resolveFederatedUser(client, provider(), noEmail),
    { action: "link", userId: "u-linked" },
  );
  assertEquals(client.seen, ["link"]);
});

// Nothing to look one up by. The query is skipped rather than run with null and
// left to match whatever `lower(NULL)` would.
Deno.test("with no link and no email, no candidate is looked up", async () => {
  const client = stubClient({ byEmail: [{ id: "u-2" }] });
  assertEquals(
    await resolveFederatedUser(client, provider({ autoProvision: true }), noEmail),
    { action: "provision" },
  );
  assertEquals(client.seen, ["link"]);
});

Deno.test("an existing link to a disabled user is refused", async () => {
  const client = stubClient({
    linked: [{ userId: "u-banned", disabled: true }],
    // Would be email-linkable if the flow ever fell through to it.
    byEmail: [{ id: "u-someone-else" }],
  });
  const decision = await resolveFederatedUser(client, provider(), identity(true));
  assertEquals(decision, { action: "refuse", reason: "account_disabled" });
  // And it stops there rather than falling through to provision or re-link.
  assertEquals(client.seen, ["link"]);
});

Deno.test("with no link, a verified email links as before", async () => {
  const client = stubClient({ byEmail: [{ id: "u-2" }] });
  assertEquals(
    await resolveFederatedUser(client, provider(), identity(true)),
    { action: "link", userId: "u-2" },
  );
  assertEquals(client.seen, ["link", "email"]);
});

Deno.test("with no link and no matching user, the provider's policy decides", async () => {
  assertEquals(
    await resolveFederatedUser(stubClient({}), provider(), identity(true)),
    { action: "refuse", reason: "no_account" },
  );
  assertEquals(
    await resolveFederatedUser(stubClient({}), provider({ autoProvision: true }), identity(true)),
    { action: "provision" },
  );
  // An unverified upstream email still links to nothing.
  assertEquals(
    (await resolveFederatedUser(
      stubClient({ byEmail: [{ id: "u-2" }] }),
      provider(),
      identity(false),
    )).action,
    "refuse",
  );
});

Deno.test("the email lookup carries the role the elevated guard needs", async () => {
  const found = await findLinkCandidateByEmail(
    stubClient({ byEmail: [{ id: "u-1", role: "admin" }] }),
    "jo@example.test",
  );
  assertEquals(found, { id: "u-1", role: "admin" });

  // NULL role (the column is nullable, defaulting to 'user') is reported as
  // null, not dropped, so isElevatedRole decides rather than `undefined`.
  assertEquals(
    await findLinkCandidateByEmail(stubClient({ byEmail: [{ id: "u-1" }] }), "jo@example.test"),
    { id: "u-1", role: null },
  );
  assertEquals(await findLinkCandidateByEmail(stubClient({}), "jo@example.test"), null);
});

Deno.test("a first-time identity matching an admin's address is refused", async () => {
  const client = stubClient({ byEmail: [{ id: "u-admin", role: "admin" }] });
  assertEquals(
    await resolveFederatedUser(client, provider(), identity(true)),
    { action: "refuse", reason: "elevated_account_link_refused" },
  );
  assertEquals(client.seen, ["link", "email"]);
});

// The whole point of the additive guards: they gate the *first* link only.
Deno.test("an existing link to an elevated user still signs in", async () => {
  const client = stubClient({ linked: [{ userId: "u-admin", disabled: false }] });
  assertEquals(
    // Restrictive on both counts, and neither is consulted: this identity was
    // linked already, so no linking decision is being made.
    await resolveFederatedUser(
      client,
      provider({ emailDomainAllowlist: ["corp.test"] }),
      { sub: "s-1", email: "jo@example.test", emailVerified: true },
    ),
    { action: "link", userId: "u-admin" },
  );
  assertEquals(client.seen, ["link"]);
});

Deno.test("a first-time identity outside the allowlist is refused before any link", async () => {
  const client = stubClient({ byEmail: [{ id: "u-2", role: "user" }] });
  assertEquals(
    await resolveFederatedUser(client, provider({ emailDomainAllowlist: ["corp.test"] }), identity(true)),
    { action: "refuse", reason: "email_domain_not_allowed" },
  );
});

// ── Upstream tokens at rest (providers.ts) ─────────────────────────────────

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

Deno.test("loadProviders maps authorization_endpoint, absent meaning null", async () => {
  const row = (over: Record<string, unknown>) => ({
    id: "logto", displayName: "Logto", clientId: "c", clientSecret: "s",
    issuer: "https://logto.test/oidc", discovery_url: null,
    scopes: "openid profile email", claim_map: {}, groups_source: "none",
    groups_claim: null, link_policy: "verified_email", auto_provision: false, ...over,
  });
  const load = async (over: Record<string, unknown>) =>
    (await loadProviders({ query: () => Promise.resolve({ rows: [row(over)] }) })).get("logto")!;

  assertEquals((await load({ authorization_endpoint: "https://d2e.test/oidc/auth" })).authorizationEndpoint,
    "https://d2e.test/oidc/auth");
  assertEquals((await load({})).authorizationEndpoint, null);
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
  // synthesised address by, and what findLinkCandidateByEmail excludes on;
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
// confirmed: candidates for findLinkCandidateByEmail again, and a lie to any
// mail path that reads the flag.
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

// A synthesised address is an internal identifier, not a claim to an identity.
// Before this, an upstream asserting `<another user's subject>@d2e.local` as
// verified would link onto that user's account, because the candidate query
// never distinguished a placeholder from an address its owner proved. Against
// a real database rather than a stub: the exclusion is a SQL predicate, so a
// stub that answers by matching substrings could not tell it from its absence.
Deno.test({
  name: "[db] an upstream cannot claim an account through its placeholder address",
  ignore: !provisionDbUrl,
  fn: async () => {
    const { Client } = await import("npm:pg");
    const db = new Client({ connectionString: provisionDbUrl });
    await db.connect();
    const run = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const placeholder = `sub-${run}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    // The shape the rehearsal found: an address in the placeholder domain that
    // a caller SUPPLIED rather than one this module synthesised. 66 of 69
    // migrated users look like this, and until provisionUser flagged them by
    // domain they were candidates here — which is the takeover, end to end.
    const supplied = `mig-${run}@${PLACEHOLDER_EMAIL_DOMAIN}`;
    const real = `jo-${run}@example.test`;
    try {
      await provisionUser(db, anonymous(`Sub ${run}`), { id: `p${run}a` });
      await provisionUser(
        db,
        { sub: `s-${run}`, email: real, emailVerified: true },
        { id: `p${run}b` },
      );
      await provisionUser(
        db,
        { sub: `s2-${run}`, email: supplied, emailVerified: true },
        { id: `p${run}c` },
      );

      assertEquals(await findLinkCandidateByEmail(db, placeholder), null);
      // Synthesised and supplied must be indistinguishable here, or the
      // exclusion protects only the rows that never needed a migration.
      assertEquals(await findLinkCandidateByEmail(db, supplied), null);
      // Case is no way around it either: the predicate is on the row, not on
      // the spelling of the address.
      assertEquals(await findLinkCandidateByEmail(db, placeholder.toUpperCase()), null);
      // An address its owner actually proved still resolves exactly as before,
      // so this narrows the placeholder path and nothing else.
      assertEquals(await findLinkCandidateByEmail(db, real), { id: `p${run}b`, role: "user" });
    } finally {
      await db.query(`DELETE FROM trexdb."user" WHERE id LIKE $1`, [`p${run}%`]);
      await db.end();
    }
  },
});

// The migrated users V17 backfilled are the population this exclusion could
// plausibly break, so prove the ordering that spares them rather than assert
// it: resolveFederatedUser answers from the (providerId, accountId) account
// row and never reaches the email query.
Deno.test({
  name: "[db] a migrated user with a placeholder address still signs in through its link",
  ignore: !provisionDbUrl,
  fn: async () => {
    const { Client } = await import("npm:pg");
    const db = new Client({ connectionString: provisionDbUrl });
    await db.connect();
    const run = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    _setDekForTests(new Uint8Array(32));
    const decoyEmail = `decoy-${run}@example.test`;
    try {
      const id = await provisionUser(db, anonymous(`Sub ${run}`), { id: `p${run}a` });
      await upsertAccount(db, { userId: id, providerId: "logto", accountId: `Sub ${run}` });
      // The address the email path would resolve to, held by somebody else. An
      // identity asserting no address at all would take decideLink's no-address
      // branch and never reach the email query, so it could not tell "consulted
      // first" from "consulted at all"; this can.
      await provisionUser(
        db,
        { sub: `decoy-${run}`, email: decoyEmail, emailVerified: true },
        { id: `p${run}b` },
      );

      assertEquals(
        await resolveFederatedUser(db, provider(), {
          sub: `Sub ${run}`,
          email: decoyEmail,
          emailVerified: true,
        }),
        { action: "link", userId: id },
      );
    } finally {
      await db.query(`DELETE FROM trexdb."user" WHERE id LIKE $1`, [`p${run}%`]);
      await db.end();
      _resetDekCache();
    }
  },
});

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

      // The point of the clear: the candidate query finds them again, and a
      // provider asserting the address they chose links rather than refusing.
      assertEquals(await findLinkCandidateByEmail(db, chosen), { id, role: "user" });
      assertEquals(
        await resolveFederatedUser(db, provider(), {
          sub: `other-${run}`,
          email: chosen,
          emailVerified: true,
        }),
        { action: "link", userId: id },
      );
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      await db.query(`DELETE FROM trexdb."user" WHERE id LIKE $1`, [`p${run}%`]);
      await db.end();
    }
  },
});
