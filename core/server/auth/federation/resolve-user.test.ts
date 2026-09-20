// trex's link policy, as @better-auth/sso sees it.
//
// Every case below is a decision trex's own /callback made before the cutover
// and that the plugin makes none of: it has no per-provider enable switch, no
// per-provider auto-provision, no multi-domain allowlist, no elevated-account
// guard, and no idea that a synthesised placeholder address is not a claim to
// an identity. resolveUser is the one hook they can all be made in, so the
// tests are written against that hook rather than against the helpers under it.
//
// The fake adapter is deliberately strict rather than convenient: it knows
// three models by name, evaluates where-clauses instead of ignoring them, and
// throws on a model it has not been seeded with. A resolver that read the
// wrong model, or that forgot a predicate, would pass a stub that answered the
// first thing it was asked for.
import { assertEquals, assertRejects } from "jsr:@std/assert";
import { resolveSsoUser } from "./resolve-user.ts";
import { _resetRootKeyCache } from "../keys.ts";

type Row = Record<string, unknown>;
type Where = { field: string; value: unknown; operator?: string };

/** The three models the resolver is allowed to read, and nothing else. */
const KNOWN_MODELS = new Set(["ssoProvider", "user", "account"]);

function matches(row: Row, where: Where[]): boolean {
  return where.every((w) => {
    const actual = row[w.field];
    switch (w.operator ?? "eq") {
      case "eq":
        return actual === w.value;
      case "in":
        return Array.isArray(w.value) && (w.value as unknown[]).includes(actual);
      default:
        throw new Error(`fake adapter does not implement operator ${w.operator}`);
    }
  });
}

interface Fake {
  findOne: <T>(a: { model: string; where: Where[] }) => Promise<T | null>;
  findMany: <T>(a: { model: string; where?: Where[]; limit?: number }) => Promise<T[]>;
  reads: string[];
}

function fakeDb(tables: { ssoProvider?: Row[]; user?: Row[]; account?: Row[] }): Fake {
  const reads: string[] = [];
  const table = (model: string): Row[] => {
    if (!KNOWN_MODELS.has(model)) throw new Error(`unknown model ${model}`);
    return (tables as Record<string, Row[] | undefined>)[model] ?? [];
  };
  return {
    reads,
    // deno-lint-ignore no-explicit-any
    findOne: ((a: { model: string; where: Where[] }) => {
      reads.push(`${a.model}:${a.where.map((w) => `${w.field}=${String(w.value)}`).join(",")}`);
      return Promise.resolve(table(a.model).find((r) => matches(r, a.where)) ?? null);
      // deno-lint-ignore no-explicit-any
    }) as any,
    // deno-lint-ignore no-explicit-any
    findMany: ((a: { model: string; where?: Where[]; limit?: number }) => {
      reads.push(
        `${a.model}:${(a.where ?? []).map((w) => `${w.field}=${String(w.value)}`).join(",")}`,
      );
      const hits = table(a.model).filter((r) => matches(r, a.where ?? []));
      return Promise.resolve(a.limit === undefined ? hits : hits.slice(0, a.limit));
      // deno-lint-ignore no-explicit-any
    }) as any,
  };
}

/** The one provider every case below signs in through, unless it says otherwise. */
const PROVIDER = {
  id: "logto",
  providerId: "logto",
  enabled: true,
  issuer: "https://logto.example.test/oidc",
  link_policy: "verified_email",
  auto_provision: false,
  email_domain_allowlist: null,
  allow_elevated_auto_link: false,
};

// deno-lint-ignore no-explicit-any
const input = (over: Record<string, unknown> = {}): any => ({
  protocol: "oidc",
  providerId: "logto",
  accountKey: { issuer: "https://logto.example.test/oidc", accountId: "sub-1" },
  // What mapping.email produced, which on d2e's username-only Logto is a
  // username. Present in every case so a resolver that reached for it instead
  // of for the id_token's own email claim is visible.
  providerUser: { email: "alice-username", emailVerified: false, name: "Alice" },
  providerReference: {
    providerId: "logto",
    source: { type: "persisted", recordId: "logto" },
    authenticationConfigurationFingerprint: "fp",
  },
  providerClaims: {},
  verifiedIdTokenClaims: { sub: "sub-1" },
  ...over,
});

// deno-lint-ignore no-explicit-any
const resolve = (i: any, db: Fake) => resolveSsoUser!(i, { database: db as any });

Deno.test("a disabled provider refuses every sign-in", async () => {
  // sso_provider.enabled is what the sign-in button is built from and what an
  // administrator turns off in an incident. resolveOIDCProvider filters on
  // providerId alone (dist/index.mjs:4090-4097) and no plugin path consults
  // enabled, so without this a row an operator disabled keeps authenticating
  // people — and it keeps authenticating the one already linked, which is the
  // case an incident is most likely to be about.
  const db = fakeDb({
    ssoProvider: [{ ...PROVIDER, enabled: false }],
    account: [{ providerId: "logto", accountId: "sub-1", userId: "u1" }],
    user: [{ id: "u1", role: "user" }],
  });
  assertEquals(await resolve(input(), db), { action: "reject", code: "provider_disabled" });
});

Deno.test("a provider whose enabled column is not exactly true is disabled", async () => {
  // loadProviders' WHERE clause was `enabled = true`, which is false for NULL
  // as well as for false. A truthiness test here would read a column an older
  // database has not got as "enabled".
  for (const enabled of [null, undefined, 0, "true"]) {
    const db = fakeDb({ ssoProvider: [{ ...PROVIDER, enabled }] });
    assertEquals(
      await resolve(input(), db),
      { action: "reject", code: "provider_disabled" },
      `enabled=${JSON.stringify(enabled)} must not authenticate anybody`,
    );
  }
});

Deno.test("the provider row is read by the locked record's id", async () => {
  // providerReference.source.recordId is the trexdb.sso_provider.id of the
  // exact row this flow was fingerprinted against and that the transaction
  // locked. Reading by providerId instead would be a second lookup that could
  // in principle answer from a different row.
  const db = fakeDb({ ssoProvider: [{ ...PROVIDER, id: "logto", providerId: "other" }] });
  await resolve(input({ providerId: "other" }), db);
  assertEquals(db.reads[0], "ssoProvider:id=logto");
});

Deno.test("a provider with no persisted row is refused", async () => {
  const db = fakeDb({ ssoProvider: [] });
  assertEquals(await resolve(input(), db), { action: "reject", code: "unknown_provider" });
});

Deno.test("a SAML identity is refused rather than half-policed", async () => {
  // SAML is a non-goal. Nothing writes a samlConfig, so reaching here means a
  // row was hand-edited — and none of the columns below describe a SAML flow.
  const db = fakeDb({ ssoProvider: [PROVIDER] });
  assertEquals(
    await resolve(input({ protocol: "saml", providerAttributes: {} }), db),
    { action: "reject", code: "unsupported_protocol" },
  );
});

Deno.test("an established link signs in with no address and no verified claim", async () => {
  // The link IS the identity: whatever the upstream now asserts, and whether
  // or not it says it is verified, this is the user. This is the case that
  // carries the 64 migrated Logto accounts whose upstream asserts no address.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    account: [{ providerId: "logto", accountId: "sub-1", userId: "u1" }],
    user: [{
      id: "u1",
      email: "alice@d2e.local",
      is_placeholder_email: true,
      role: "user",
      banned: null,
      deletedAt: null,
    }],
  });
  assertEquals(await resolve(input(), db), {
    action: "link",
    userId: "u1",
    profile: "preserve",
  });
});

Deno.test("an established link to a banned user is refused", async () => {
  // A ban has to stop this path too, or a banned user keeps signing in through
  // the link they already have — the same family as Phase 2's banned-account
  // Critical.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    account: [{ providerId: "logto", accountId: "sub-1", userId: "u1" }],
    user: [{ id: "u1", role: "user", banned: true, deletedAt: null }],
  });
  assertEquals(await resolve(input(), db), { action: "reject", code: "account_disabled" });
});

Deno.test("an established link to a soft-deleted user is refused", async () => {
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    account: [{ providerId: "logto", accountId: "sub-1", userId: "u1" }],
    user: [{ id: "u1", role: "user", banned: false, deletedAt: new Date() }],
  });
  assertEquals(await resolve(input(), db), { action: "reject", code: "account_disabled" });
});

Deno.test("an account row pointing at no user is refused, not provisioned around", async () => {
  // account."userId" has a foreign key, so this is a torn row rather than an
  // ordinary state — falling through to the email path would hand the identity
  // whoever now holds the address.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    account: [{ providerId: "logto", accountId: "sub-1", userId: "gone" }],
    user: [],
  });
  assertEquals(await resolve(input(), db), { action: "reject", code: "account_disabled" });
});

Deno.test("the account is looked up by this provider's own subject", async () => {
  // UNIQUE("providerId","accountId") is the link. A lookup on accountId alone
  // would hand one upstream's subject the account another upstream owns.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    account: [{ providerId: "other", accountId: "sub-1", userId: "u1" }],
    user: [{ id: "u1", role: "user" }],
  });
  assertEquals(await resolve(input(), db), { action: "reject", code: "no_account" });
});

Deno.test("a first-time identity with an unverified address never links", async () => {
  // A provider that lets someone set an address they do not control would
  // otherwise be a takeover path into any existing account with that address.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    user: [{ id: "u9", email: "alice@allowed.test", role: "user" }],
  });
  assertEquals(
    await resolve(
      input({ verifiedIdTokenClaims: { sub: "sub-1", email: "alice@allowed.test" } }),
      db,
    ),
    { action: "reject", code: "upstream_email_unverified" },
  );
});

Deno.test("email_verified is read off the verified id_token, not off the profile", async () => {
  // providerUser.emailVerified is hard-coded false unless the deprecated
  // trustEmailVerified is on (dist/index.mjs:3922, :3933), so a resolver that
  // trusted it would refuse every verified identity. The id_token is also the
  // stronger source: it is what the upstream signed.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    user: [{ id: "u9", email: "alice@allowed.test", role: "user" }],
  });
  assertEquals(
    await resolve(
      input({
        providerUser: { email: "alice-username", emailVerified: false, name: "Alice" },
        verifiedIdTokenClaims: {
          sub: "sub-1",
          email: "alice@allowed.test",
          email_verified: true,
        },
      }),
      db,
    ),
    { action: "link", userId: "u9", profile: "preserve" },
  );
});

Deno.test("an email_verified claim that is not exactly true is unverified", async () => {
  // Absent means unverified, and so does the string "true": the whole link
  // policy rests on this one boolean and a loose test is how an upstream that
  // emits it as text gets treated as authoritative.
  for (const claim of [undefined, null, "true", 1, "1"]) {
    const db = fakeDb({
      ssoProvider: [PROVIDER],
      user: [{ id: "u9", email: "alice@allowed.test", role: "user" }],
    });
    assertEquals(
      await resolve(
        input({
          verifiedIdTokenClaims: {
            sub: "sub-1",
            email: "alice@allowed.test",
            email_verified: claim,
          },
        }),
        db,
      ),
      { action: "reject", code: "upstream_email_unverified" },
      `email_verified=${JSON.stringify(claim)} must not count as verified`,
    );
  }
});

Deno.test("the mapped profile address is never treated as an address", async () => {
  // mapping.email names whatever claim satisfies dist/index.mjs:3938, which on
  // a username-only upstream is a username or the subject. Treating it as an
  // address would hand it to the allowlist and to the existing-user lookup —
  // and a trex user whose address happened to equal someone's username would
  // be signed into by them.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    user: [{ id: "u9", email: "alice-username", role: "user" }],
  });
  assertEquals(
    await resolve(
      input({
        providerUser: { email: "alice-username", emailVerified: true, name: "Alice" },
        verifiedIdTokenClaims: { sub: "sub-1" },
      }),
      db,
    ),
    { action: "reject", code: "no_account" },
  );
});

Deno.test("a first-time identity outside the allowlist is refused", async () => {
  // A verified address is only as trustworthy as the provider that asserted
  // it; with several upstreams configured, nothing else stops the least
  // trusted of them asserting an address in a domain it has no authority over.
  const db = fakeDb({
    ssoProvider: [{ ...PROVIDER, email_domain_allowlist: ["@Allowed.test "] }],
    user: [{ id: "u9", email: "alice@elsewhere.test", role: "user" }],
  });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: {
          sub: "sub-1",
          email: "alice@elsewhere.test",
          email_verified: true,
        },
      }),
      db,
    ),
    { action: "reject", code: "email_domain_not_allowed" },
  );
});

Deno.test("the allowlist column is normalised the way loadProviders normalises it", async () => {
  // Same column, two readers: loadProviders for trex's own router and this for
  // the plugin. An entry written '@Allowed.test ' has to mean the same thing in
  // both, or an allowlist is enforced differently depending on which side of
  // the cutover a sign-in went through.
  const db = fakeDb({
    ssoProvider: [{ ...PROVIDER, email_domain_allowlist: [" ", "@Allowed.test "] }],
    user: [{ id: "u9", email: "alice@allowed.test", role: "user" }],
  });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: {
          sub: "sub-1",
          email: "Alice@Allowed.test",
          email_verified: true,
        },
      }),
      db,
    ),
    { action: "link", userId: "u9", profile: "preserve" },
  );
});

Deno.test("an allowlist of nothing but blanks is no restriction", async () => {
  // normaliseDomains reduces it to null, which is what an unset column means.
  // The alternative reading — "an empty list allows nothing" — would lock out
  // every provider whose column was written with an empty entry.
  const db = fakeDb({
    ssoProvider: [{ ...PROVIDER, email_domain_allowlist: ["", "  "] }],
    user: [{ id: "u9", email: "alice@elsewhere.test", role: "user" }],
  });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: {
          sub: "sub-1",
          email: "alice@elsewhere.test",
          email_verified: true,
        },
      }),
      db,
    ),
    { action: "link", userId: "u9", profile: "preserve" },
  );
});

Deno.test("a first-time identity with no address is refused under an allowlist", async () => {
  // A restriction that cannot be evaluated must not pass.
  const db = fakeDb({
    ssoProvider: [{ ...PROVIDER, auto_provision: true, email_domain_allowlist: ["allowed.test"] }],
  });
  assertEquals(await resolve(input(), db), {
    action: "reject",
    code: "email_domain_not_allowed",
  });
});

Deno.test("a first-time identity matching an elevated account is refused by default", async () => {
  // Silently handing a federated identity an existing administrator's account
  // is a decision a deployment makes on purpose.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    user: [{ id: "u9", email: "root@allowed.test", role: "admin" }],
  });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: { sub: "sub-1", email: "root@allowed.test", email_verified: true },
      }),
      db,
    ),
    { action: "reject", code: "elevated_account_link_refused" },
  );
});

Deno.test("allow_elevated_auto_link that is not exactly true is off", async () => {
  // The column arrived in V12; a row written before it, or a database that has
  // not got it, reads as null or undefined. `!== false` would read both as
  // permission to hand a federated identity an administrator's account, which
  // is the one decision that must never default on.
  for (const flag of [null, undefined, "", 0, "false"]) {
    const db = fakeDb({
      ssoProvider: [{ ...PROVIDER, allow_elevated_auto_link: flag }],
      user: [{ id: "u9", email: "root@allowed.test", role: "admin" }],
    });
    assertEquals(
      await resolve(
        input({
          verifiedIdTokenClaims: {
            sub: "sub-1",
            email: "root@allowed.test",
            email_verified: true,
          },
        }),
        db,
      ),
      { action: "reject", code: "elevated_account_link_refused" },
      `allow_elevated_auto_link=${JSON.stringify(flag)} must not link an admin`,
    );
  }
});

Deno.test("the elevated-account guard can be opted out of per provider", async () => {
  const db = fakeDb({
    ssoProvider: [{ ...PROVIDER, allow_elevated_auto_link: true }],
    user: [{ id: "u9", email: "root@allowed.test", role: "admin" }],
  });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: { sub: "sub-1", email: "root@allowed.test", email_verified: true },
      }),
      db,
    ),
    { action: "link", userId: "u9", profile: "preserve" },
  );
});

Deno.test("a placeholder address is never a link candidate", async () => {
  // <subject>@d2e.local is trex's own invention for a user whose upstream
  // asserted none (V17 backfilled 64 of them). Nobody asserted it and nobody
  // can be reached at it, so an upstream verifying it is claiming an identity
  // rather than proving one. This is the takeover findLinkCandidateByEmail's
  // is_placeholder_email predicate exists to close, and the adapter cannot
  // express `IS NOT TRUE`, so it has to be closed here instead.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    user: [{ id: "u9", email: "victim@d2e.local", is_placeholder_email: true, role: "user" }],
  });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: { sub: "sub-1", email: "victim@d2e.local", email_verified: true },
      }),
      db,
    ),
    { action: "reject", code: "no_account" },
  );
});

Deno.test("a user who has replaced their placeholder address is a candidate again", async () => {
  // The flag is cleared by PUT /user when the account holder supplies a real
  // address. A predicate that keyed on the domain instead of on the column
  // would turn "unclaimable" into "unlinkable for good".
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    user: [{
      id: "u9",
      email: "alice@allowed.test",
      is_placeholder_email: false,
      role: "user",
    }],
  });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: { sub: "sub-1", email: "alice@allowed.test", email_verified: true },
      }),
      db,
    ),
    { action: "link", userId: "u9", profile: "preserve" },
  );
});

Deno.test("a soft-deleted or banned holder of the address is not resurrected", async () => {
  for (const disabled of [{ deletedAt: new Date() }, { banned: true }]) {
    const db = fakeDb({
      ssoProvider: [PROVIDER],
      user: [{ id: "u9", email: "alice@allowed.test", role: "user", ...disabled }],
    });
    assertEquals(
      await resolve(
        input({
          verifiedIdTokenClaims: {
            sub: "sub-1",
            email: "alice@allowed.test",
            email_verified: true,
          },
        }),
        db,
      ),
      { action: "reject", code: "no_account" },
      `a ${Object.keys(disabled)[0]} user must not be linked to`,
    );
  }
});

Deno.test("two live users on one address resolve to nobody", async () => {
  // V16's unique index on lower(email) forbids this, so it is reachable only on
  // a database missing it — and that is exactly the state a takeover needs: the
  // victim's account and an attacker's case variant, both matching the address
  // the upstream just verified. Nobody can tell which one this identity is, so
  // the sign-in goes rather than the guess.
  const db = fakeDb({
    ssoProvider: [PROVIDER],
    user: [
      { id: "victim", email: "alice@allowed.test", role: "user" },
      { id: "attacker", email: "alice@allowed.test", role: "user" },
    ],
  });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: { sub: "sub-1", email: "alice@allowed.test", email_verified: true },
      }),
      db,
    ),
    { action: "reject", code: "ambiguous_account" },
  );
});

Deno.test("a first-time identity with no matching user and no auto-provision is refused", async () => {
  const db = fakeDb({ ssoProvider: [PROVIDER], user: [] });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: { sub: "sub-1", email: "alice@allowed.test", email_verified: true },
      }),
      db,
    ),
    { action: "reject", code: "no_account" },
  );
});

Deno.test("auto-provision returns continue so Better Auth creates the user", async () => {
  const db = fakeDb({ ssoProvider: [{ ...PROVIDER, auto_provision: true }], user: [] });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: { sub: "sub-1", email: "alice@allowed.test", email_verified: true },
      }),
      db,
    ),
    { action: "continue" },
  );
});

Deno.test("auto-provision still refuses an address the engine cannot serve", async () => {
  // handleOAuthUserInfo would take the address verbatim and write exactly the
  // row V17 refuses to migrate — an account that exists, looks migrated, and
  // can never authenticate.
  const db = fakeDb({ ssoProvider: [{ ...PROVIDER, auto_provision: true }], user: [] });
  assertEquals(
    await resolve(
      input({
        verifiedIdTokenClaims: { sub: "sub-1", email: "alice@localhost", email_verified: true },
      }),
      db,
    ),
    { action: "reject", code: "upstream_email_unusable" },
  );
});

Deno.test("an address-less identity provisions only where the provider allows it", async () => {
  const off = fakeDb({ ssoProvider: [PROVIDER] });
  assertEquals(await resolve(input(), off), { action: "reject", code: "no_account" });
  const on = fakeDb({ ssoProvider: [{ ...PROVIDER, auto_provision: true }] });
  assertEquals(await resolve(input(), on), { action: "continue" });
});

Deno.test("auto_provision that is not exactly true is off", async () => {
  // Same rule as enabled, and for a stronger reason: this one decides whether
  // an upstream may mint trex accounts.
  for (const flag of [null, undefined, "true", 1]) {
    const db = fakeDb({ ssoProvider: [{ ...PROVIDER, auto_provision: flag }] });
    assertEquals(
      await resolve(input(), db),
      { action: "reject", code: "no_account" },
      `auto_provision=${JSON.stringify(flag)} must not provision`,
    );
  }
});

Deno.test("a database failure is not disguised as a policy refusal", async () => {
  // resolveSSOUser turns anything thrown into a generic
  // SSO_USER_RESOLUTION_FAILED 500 (dist/index.mjs:1600-1606), which is the
  // right answer for infrastructure. Catching it here and returning a reject
  // would render a database outage to the browser as "you are not allowed".
  const broken = {
    findOne: () => Promise.reject(new Error("connection terminated")),
    findMany: () => Promise.reject(new Error("connection terminated")),
    reads: [],
  } as unknown as Fake;
  await assertRejects(() => resolve(input(), broken), Error, "connection terminated");
});

// ── Against the real adapter ────────────────────────────────────────────────
//
// Everything above proves the policy. None of it proves that the columns the
// policy reads survive the adapter: an undeclared column is silently dropped
// from every adapter read (spike §3/Q3b), so a resolver written against one
// would read `undefined` and treat every provider as unrestricted — and every
// test above would still pass, because the fake hands back whatever it is
// seeded with.

const DATABASE_URL = Deno.env.get("DATABASE_URL");
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

/** better-auth.ts derives its secret at import, so the key precedes the import. */
async function loadModules() {
  const prior = Deno.env.get("TREX_ROOT_KEY");
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
  try {
    return {
      auth: (await import("../better-auth.ts")).auth,
      pool: (await import("../../db.ts")).pool,
    };
  } finally {
    if (prior === undefined) Deno.env.delete("TREX_ROOT_KEY");
    else Deno.env.set("TREX_ROOT_KEY", prior);
    _resetRootKeyCache();
  }
}

const loaded = DATABASE_URL ? await loadModules() : null;

function dbTest(name: string, fn: (l: NonNullable<typeof loaded>) => Promise<void>) {
  Deno.test({
    name,
    ignore: !loaded,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: () => fn(loaded!),
  });
}

const slug = () => `t5_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

// deno-lint-ignore no-explicit-any
async function seedProvider(pool: any, id: string, over: Record<string, unknown> = {}) {
  await pool.query(
    `INSERT INTO trexdb.sso_provider
       (id, "displayName", "clientId", "clientSecret", enabled, issuer, scopes,
        claim_map, link_policy, auto_provision, email_domain_allowlist,
        allow_elevated_auto_link)
     VALUES ($1,$1,'cid','secret',$2,'https://up.test/oidc','openid profile',
             '{"email":"username"}'::jsonb,'verified_email',$3,$4,$5)`,
    [
      id,
      over.enabled ?? true,
      over.auto_provision ?? false,
      over.email_domain_allowlist ?? null,
      over.allow_elevated_auto_link ?? false,
    ],
  );
}

dbTest("the adapter hands the resolver every column the policy reads", async ({ auth, pool }) => {
  // The point of this case is not the decision, it is that a real adapter read
  // through the real model declaration carries link_policy, auto_provision,
  // email_domain_allowlist, allow_elevated_auto_link and enabled at all.
  const id = slug();
  await seedProvider(pool, id, {
    enabled: false,
    auto_provision: true,
    email_domain_allowlist: ["allowed.test"],
    allow_elevated_auto_link: true,
  });
  try {
    const ctx = await auth.$context;
    const row = await ctx.adapter.findOne<Record<string, unknown>>({
      model: "ssoProvider",
      where: [{ field: "id", value: id }],
    });
    assertEquals(
      {
        enabled: row?.enabled,
        link_policy: row?.link_policy,
        auto_provision: row?.auto_provision,
        email_domain_allowlist: row?.email_domain_allowlist,
        allow_elevated_auto_link: row?.allow_elevated_auto_link,
      },
      {
        enabled: false,
        link_policy: "verified_email",
        auto_provision: true,
        email_domain_allowlist: ["allowed.test"],
        allow_elevated_auto_link: true,
      },
    );
    // And the decision that column set produces, through the same adapter.
    assertEquals(
      // deno-lint-ignore no-explicit-any
      await resolveSsoUser!(input({ providerReference: {
        providerId: id,
        source: { type: "persisted", recordId: id },
        authenticationConfigurationFingerprint: "fp",
        // deno-lint-ignore no-explicit-any
      } }) as any, { database: ctx.adapter as any }),
      { action: "reject", code: "provider_disabled" },
    );
  } finally {
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
  }
});

dbTest("deletedAt, banned, role and is_placeholder_email survive an adapter read", async ({ auth, pool }) => {
  // deletedAt and is_placeholder_email are trex's own columns declared in
  // better-auth.ts; banned and role come from the admin() plugin. If any one of
  // them were undeclared the resolver would read undefined and sign a retired,
  // banned or placeholder-addressed account in.
  const uid = slug();
  await pool.query(
    `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, banned,
                                is_placeholder_email, "deletedAt")
     VALUES ($1,'probe',$2,false,'admin',true,true,NOW())`,
    [uid, `${uid}@d2e.local`],
  );
  try {
    const ctx = await auth.$context;
    const row = await ctx.adapter.findOne<Record<string, unknown>>({
      model: "user",
      where: [{ field: "id", value: uid }],
    });
    assertEquals(
      {
        role: row?.role,
        banned: row?.banned,
        placeholder: row?.is_placeholder_email,
        deleted: row?.deletedAt instanceof Date,
      },
      { role: "admin", banned: true, placeholder: true, deleted: true },
    );
  } finally {
    await pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [uid]);
  }
});

dbTest("an established link resolves end to end through the real adapter", async ({ auth, pool }) => {
  const id = slug();
  const uid = slug();
  await seedProvider(pool, id);
  await pool.query(
    `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, is_placeholder_email)
     VALUES ($1,'probe',$2,false,'user',true)`,
    [uid, `${uid}@d2e.local`],
  );
  await pool.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId")
     VALUES ($1,$2,$3,$4)`,
    [crypto.randomUUID(), uid, "sub-real", id],
  );
  try {
    const ctx = await auth.$context;
    const reference = {
      providerId: id,
      source: { type: "persisted", recordId: id },
      authenticationConfigurationFingerprint: "fp",
    };
    const base = input({
      providerId: id,
      providerReference: reference,
      accountKey: { issuer: "https://up.test/oidc", accountId: "sub-real" },
    });
    assertEquals(
      // deno-lint-ignore no-explicit-any
      await resolveSsoUser!(base, { database: ctx.adapter as any }),
      { action: "link", userId: uid, profile: "preserve" },
    );

    // The same identity, once the account is banned.
    await pool.query(`UPDATE trexdb."user" SET banned = true WHERE id = $1`, [uid]);
    assertEquals(
      // deno-lint-ignore no-explicit-any
      await resolveSsoUser!(base, { database: ctx.adapter as any }),
      { action: "reject", code: "account_disabled" },
    );
  } finally {
    await pool.query(`DELETE FROM trexdb.account WHERE "providerId" = $1`, [id]);
    await pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [uid]);
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
  }
});

dbTest("a placeholder-addressed user is not a candidate through the real adapter", async ({ auth, pool }) => {
  // The fake proves the predicate; this proves the column the predicate reads
  // comes back from a real row, which is the half a fake can never show.
  const id = slug();
  const uid = slug();
  await seedProvider(pool, id, { auto_provision: false });
  const address = `${uid}@d2e.local`;
  await pool.query(
    `INSERT INTO trexdb."user" (id, name, email, "emailVerified", role, is_placeholder_email)
     VALUES ($1,'probe',$2,false,'user',true)`,
    [uid, address],
  );
  try {
    const ctx = await auth.$context;
    assertEquals(
      await resolveSsoUser!(
        input({
          providerId: id,
          providerReference: {
            providerId: id,
            source: { type: "persisted", recordId: id },
            authenticationConfigurationFingerprint: "fp",
          },
          accountKey: { issuer: "https://up.test/oidc", accountId: "sub-new" },
          verifiedIdTokenClaims: { sub: "sub-new", email: address, email_verified: true },
        }),
        // deno-lint-ignore no-explicit-any
        { database: ctx.adapter as any },
      ),
      { action: "reject", code: "no_account" },
    );
  } finally {
    await pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [uid]);
    await pool.query(`DELETE FROM trexdb.sso_provider WHERE id = $1`, [id]);
  }
});
