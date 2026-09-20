# Phase 3 spike: can a pre-linked, email-less identity sign in on `@better-auth/sso`?

Measured 2026-09-19 against `npm:better-auth@1.7.5` + `npm:@better-auth/sso@1.7.5`,
a stub OIDC upstream on `127.0.0.1`, and a scratch Postgres 16 carrying
`core/schema/V1..V19` applied in `sort -V` order (V10 does not exist).

The throwaway that produced these numbers was `auth/federation/sso-spike.test.ts`
and is deleted. Everything a later task needs is written down here; nothing below
needs re-running.

## Verdict: **GO**

A user whose `trexdb.account` row already exists signs in with no email claim
anywhere in the upstream's id_token, provided `oidcConfig.mapping.email` names a
claim the upstream does emit. `trexdb."user".email` is not written. The gate the
phase rests on is open.

Three things Phase 3 must carry that the plan did not have: the schema check in
§4, the `user.email` NOT NULL restored by V17 in §5, and the RLS exposure in §2.

---

## 1. Question 1 — the gate

**Does a pre-linked identity sign in when `mapping.email` names a non-address
claim? YES. Is `user.email` untouched afterwards? YES — the plugin does not write
the non-address value anywhere near the user row.**

The check the whole phase was gated on is confirmed present, verbatim, at
`node_modules/@better-auth/sso/dist/index.mjs:3938`:

```js
if (!userInfo.email || !userInfo.id) return redirectOIDCError("invalid_provider", "missing_user_info");
```

It is fed by, two lines earlier in the same function (id_token branch):

```js
email: readStringClaim(idToken, mapping.email || "email"),
```

and `readStringClaim` accepts any non-empty string — it does **not** validate the
value as an address:

```js
const readStringClaim = (claims, claim) => {
  const value = claims[claim];
  return typeof value === "string" && value.length > 0 ? value : void 0;
};
```

So `mapping.email` pointing at a username claim satisfies line 3938 with the
username. That is the lever, and it works.

### Q1a — the brief's premise: `user.email IS NULL`, `mapping.email: "username"`

Seeded: `trexdb."user"` id `logto-subject-1`, `email NULL`; `trexdb.account`
`(userId, accountId) = ('logto-subject-1','logto-subject-1')`,
`providerId = 'spike_username'`. Upstream id_token carried `sub` and `username`
and **no `email`, no `email_verified`**.

| Observation | Value |
|---|---|
| callback redirect | `302 http://127.0.0.1:9911/done` |
| `error` query param | absent |
| `user` row after | `{"id":"logto-subject-1","email":null,"emailVerified":false,"name":"alice"}` |
| `account` rows after | `[{"id":"acct-spike_username","userId":"logto-subject-1","accountId":"logto-subject-1","providerId":"spike_username"}]` — unchanged, no second row |
| sessions for that user | `1` |

`user.email` is still `null`. `user.name` is still `alice` (the seeded value; the
plugin passes `name: ""` since no `name` claim was emitted, and does not write
it). No placeholder, no `alice` written into the address column.

### Q1b — control: the same flow with **no** `mapping` at all

Both measurements, not only the confirming one. Identical setup, `oidcConfig`
carries no `mapping` key, so `mapping.email || "email"` falls back to `email`,
which the upstream does not emit.

| Observation | Value |
|---|---|
| callback redirect | `302 http://127.0.0.1:9911/api/auth/error?error=invalid_provider&error_description=missing_user_info` |
| `user.email` after | `bob@d2e.local` — untouched |

**Exact refusal string:** `error=invalid_provider&error_description=missing_user_info`.
That is what a Phase 3 misconfiguration will look like in the wild, and it is a
redirect, not a thrown error — nothing is logged at the server beyond the
redirect, so this is the string to grep for.

### Q1c — the fallback when there is no `username` claim: `mapping.email: "sub"`

| Observation | Value |
|---|---|
| callback redirect | `302 http://127.0.0.1:9911/done` |
| `error` query param | absent |
| `user.email` after | `carol@d2e.local` — untouched |

`sub` works as well as `username`. This matters because `sub` is the one claim
every OIDC upstream is required to emit, so the fallback is always available.

### Q1d — the shape the schema *actually* holds at V19

See §5: at V19 there are no NULL-email rows, because V17 backfilled
`<username>@d2e.local` and put `NOT NULL` back. This is the case Phase 3 will
really meet, so it was measured too: `user.email = 'dave@d2e.local'`,
`is_placeholder_email = true`, pre-linked account, `mapping.email: "username"`,
upstream emits `username: "dave"`.

| Observation | Value |
|---|---|
| callback redirect | `302 http://127.0.0.1:9911/done` |
| `error` query param | absent |
| `user` row after | `{"email":"dave@d2e.local","emailVerified":false,"is_placeholder_email":true}` |
| `account` rows after | `[{"id":"acct-spike_placeholder","accountId":"logto-subject-4","providerId":"spike_placeholder"}]` — unchanged |
| `providerUser` the plugin built | `{"email":"dave","emailVerified":false,"name":""}` |

The plugin carried `dave` as its internal `userInfo.email` for the whole flow and
**still did not write it** over the stored `dave@d2e.local`. `overrideUserInfo`
and `updateUserInfoOnLink` both default false and that default is what protects
the address column.

**Why `user.email` survives:** once line 3938 passes, `handleOAuthUserInfo` does
its `findAccountOwnerByKey({providerId, accountId})` lookup first. A pre-linked
account short-circuits every email-based path, so the non-address value is never
compared against, nor written to, `user.email`. The protection is the pre-link,
not the mapping.

### The exact configuration that worked

`trexdb.sso_provider."oidcConfig"` (TEXT, JSON):

```json
{
  "issuer": "<upstream issuer>",
  "clientId": "<client id>",
  "clientSecret": "<secret>",
  "pkce": true,
  "discoveryEndpoint": "<issuer>/.well-known/openid-configuration",
  "jwksEndpoint": "<issuer>/jwks",
  "scopes": ["openid", "profile"],
  "mapping": { "email": "username" }
}
```

For d2e: `"mapping": { "email": "username" }`, falling back to
`"mapping": { "email": "sub" }` for any upstream that does not emit `username`.
Both were measured and both work.

Note `scopes` deliberately omits `email`: the flow completes without it, which
confirms nothing in the plugin requires the `email` scope to have been granted.

---

## 2. Question 2 — RLS on `trexdb.sso_provider`

**Does Better Auth's adapter read and write `sso_provider` through trex's pool
despite `admin_all_sso_providers`? YES — but only because trex's pool connects as
`postgres`, which both owns the table and is a superuser. The policy is inert for
that connection, not satisfied by it.**

Operations actually exercised: `adapter.findOne` (read), `adapter.update`
(write, verified by a raw `SELECT` read-back through a separate statement), and
the whole sign-in path, which writes to this table on **every** SSO callback —
`lockSSOProviderForAccountLink` at `dist/index.mjs:2097` calls
`lockSSOProviderRow`, which is an `adapter.update`:

```js
return (await getCurrentAdapter(context.adapter)).update({
  model: "ssoProvider",
  where,
  update: { providerId: provider.providerId }
});
```

So an SSO sign-in is not read-only against `sso_provider`. It also fires
`trg_sso_provider_updated_at` on each sign-in.

### Q2a — trex's own pool (`core/server/db.ts` shape)

Connection identity, read from the same pool:

```json
{"current_user":"postgres","session_user":"postgres","superuser":true,
 "owner":"postgres","relrowsecurity":true,"relforcerowsecurity":false,
 "app_user_role":null}
```

`relrowsecurity = true` but `relforcerowsecurity = false`, and the connecting
role is both the owner and a superuser — so RLS is bypassed on two independent
grounds. `app.user_role` is `null`, i.e. the policy's predicate
`current_setting('app.user_role', true) = 'admin'` is **false**, and it does not
matter.

| Operation | Result |
|---|---|
| `adapter.findOne({model:"ssoProvider", where:[{field:"providerId",value:"rls_probe"}]})` | full row returned |
| `adapter.update({... update:{domain:"written.test"}})` | updated row returned |
| raw `SELECT domain ...` read-back | `{"domain":"written.test"}` |

### Q2b — the same adapter under a non-owner role the policy *does* apply to

Role `rls_probe_role`: `LOGIN`, non-superuser, `GRANT USAGE ON SCHEMA trexdb`,
`GRANT ALL ON trexdb.sso_provider`. No `app.user_role` set.

```json
{"current_user":"rls_probe_role","superuser":false,"app_user_role":null}
```

| Operation | Result |
|---|---|
| `adapter.findOne(...)` | `null` |
| `adapter.update(...)` | `null` — **returned, not thrown** |

**This is exactly the Phase 1 failure mode.** The write did not error. It
reported `null` and the row was untouched. Under such a role every SSO sign-in
would fail with the plugin's `SSO_PROVIDER_CHANGED` conflict (because
`lockSSOProviderForAccountLink` treats a `null` update as the provider having
changed), and any migration that `UPDATE`d this table would report success having
changed nothing.

**What Phase 3 must therefore assert, not assume:** that the pool Better Auth is
handed is the `postgres` pool from `core/server/db.ts`. If any later task routes
Better Auth through a PostgREST-style role (`anon`, `authenticated`,
`service_role`) or through `middleware/auth-context.ts`'s `pgSettings` role
switch, SSO breaks silently. `service_role` is `BYPASSRLS` (V1) and would
survive; `authenticated` and `anon` would not. No RLS migration is needed for the
current wiring; a guard test that the adapter's connection is owner-or-superuser
is worth more than one.

---

## 3. Question 3 — what `resolveUser` receives

**Does it receive enough to enforce trex's link policy? YES. Can it re-read its
own provider row's additional fields from `context.database`? YES — but only if
those columns are declared as `schema.ssoProvider.additionalFields`. Undeclared
columns are dropped by the adapter.**

The brief's signature was wrong: the real one is
`(input, context) => SSOUserResolution`, and `context` is `{ database }`
(a `DBTransactionAdapter`), per `dist/index.mjs:1600`:

```js
async function resolveSSOUser(resolveUser, input, database, logger) {
  let resolution;
  try { resolution = await resolveUser(input, { database }); }
  catch { logFailure(logger, "SSO user resolution failed"); throw resolutionFailure(); }
```

**Trap for Tasks 3-8: `resolveSSOUser` swallows anything the resolver throws** and
turns it into a generic `SSO_USER_RESOLUTION_FAILED` /
"Unable to resolve the SSO user". A resolver must not use assertions for control
flow, and a resolver bug is indistinguishable from a database failure in the
response. Return `{action:"reject", code, message}` instead.

Valid return shapes (`isSSOUserResolution`, `dist/index.mjs:1583`):

- `{ action: "continue" }`
- `{ action: "link", userId: <non-empty string>, profile: "preserve" | "update" }`
- `{ action: "reject", code: <non-empty string>, message?: string }`

### The exact `input` observed (Q1a, verbatim)

```json
{
  "protocol": "oidc",
  "providerId": "spike_username",
  "accountKey": {
    "issuer": "http://127.0.0.1:51110",
    "accountId": "logto-subject-1"
  },
  "providerUser": { "email": "alice", "emailVerified": false, "name": "" },
  "providerClaims": {
    "nonce": "", "username": "alice", "iss": "http://127.0.0.1:51110",
    "aud": "spike-client", "sub": "logto-subject-1",
    "iat": 1789781820, "exp": 1789782120
  },
  "verifiedIdTokenClaims": {
    "nonce": "", "username": "alice", "iss": "http://127.0.0.1:51110",
    "aud": "spike-client", "sub": "logto-subject-1",
    "iat": 1789781820, "exp": 1789782120
  },
  "providerReference": {
    "providerId": "spike_username",
    "source": { "type": "persisted", "recordId": "spike_username" },
    "authenticationConfigurationFingerprint": "EjzxXMCbpIgEFc5x6Ncf3r1sE8lv0rff2fascKrG1hI"
  }
}
```

Keys, exactly: `protocol`, `providerId`, `accountKey`, `providerUser`,
`providerClaims`, `verifiedIdTokenClaims`, `providerReference`.

Three things Phase 3's policy needs and all three are present: the **verified**
id_token claims separately from the merged profile (so a groups claim can be
taken from the verified set only), `accountKey.accountId` (the subject the
`(providerId, accountId)` link is keyed on), and
`providerReference.source.recordId` — the `trexdb.sso_provider.id` of the exact
row that authenticated this flow, which is the handle for the re-read.

### The re-read, with `additionalFields` declared

`context.database.findOne({model:"ssoProvider", where:[{field:"id", value:
providerReference.source.recordId}]})` returned:

```json
{"issuer":"http://127.0.0.1:51110",
 "oidcConfig":"{...}", "samlConfig":null, "userId":null,
 "providerId":"spike_username", "organizationId":null, "domain":"127.0.0.1",
 "link_policy":"verified_email", "auto_provision":false,
 "allow_elevated_auto_link":false,
 "id":"spike_username"}
```

trex's own policy columns come back. No error.

### Q3b — the same read with the columns **not** declared

Both measurements. Same row, same `findOne`, `sso()` mounted with
`schema.ssoProvider.modelName` only and no `additionalFields`:

```json
{"issuer":"http://127.0.0.1:1","oidcConfig":null,"samlConfig":null,
 "userId":null,"providerId":"q3b_probe","organizationId":null,
 "domain":"x.test","id":"q3b_probe"}
```

`link_policy` and `auto_provision` are **absent** — silently dropped, not
errored, even though the row in the database had `link_policy='verified_email'`
and `auto_provision=true`. Declaring them is load-bearing. A resolver written
against an undeclared column reads `undefined` and would treat every provider as
unrestricted.

Constraint from `dist/index.mjs:4469-4472`: an `additionalFields` key must not
collide with a built-in field or a returned provider field, or `sso()` throws at
construction. `link_policy`, `auto_provision` and `allow_elevated_auto_link` are
all fine.

`email_domain_allowlist` (a `TEXT[]`, V12) was measured separately, both ways,
because it is the one policy column that is not a scalar. Row seeded with
`ARRAY['a.test','b.test']`:

| `additionalFields` type | `row.email_domain_allowlist` |
|---|---|
| `{ type: "string" }` | `["a.test","b.test"]` |
| `{ type: "string[]" }` | `["a.test","b.test"]` |

Neither throws and both hand back a real JS array — `node-postgres` parses the
`TEXT[]` before the adapter sees it, and the adapter passes the value through
without coercing it. Declaring it `"string[]"` is the honest description; either
works at runtime.

### Preconditions `resolveUser` imposes (all satisfied by `database: pool`)

Measured indirectly — the flow completed, so all three asserts passed:

- `assertSSOUserResolutionNativeTransactionSupport`: requires
  `adapter.options?.adapterConfig.transaction` to be a function. The built-in
  Kysely/pg adapter over a `pg.Pool` has it.
- `assertSSOUserResolutionAsyncContextSupport`: requires the adapter async-local
  storage. Fine under Deno.
- `assertSSOUserResolutionSessionStorage`: refuses if `secondaryStorage` is set
  without `session.preserveSessionInDatabase`. trex sets no `secondaryStorage`.
- `resolveUser` also requires an id_token: with a resolver mounted and no
  id_token the flow refuses with `id_token_required_for_user_resolution`.

---

## 4. Blocker Phase 3 must carry: the schema check refuses `sso_provider`

Not in the plan, found here. `better-auth@1.7.5` validates the live schema and
**throws on the sign-in path**:

```
BetterAuthError: Database schema mismatch

  Required columns Better Auth never writes
    sso_provider.displayName
    sso_provider.clientId
    sso_provider.clientSecret

  Inserts into sso_provider will fail.

  help: Make the listed columns nullable, give them defaults, or remove them.
```

Those three columns are trex's, `NOT NULL` with no default since
`V1__initial_schema.sql`, and Better Auth never writes them.

Note the asymmetry, measured both ways: a bare `adapter.findOne` only **logs**
this at ERROR and returns the row; the SSO **sign-in** path **throws** it. So a
read-only smoke test will not catch it.

Two ways out, and Task 4 must pick one deliberately:

1. **Relax the columns** — `ALTER ... DROP NOT NULL` or give defaults to
   `displayName`, `clientId`, `clientSecret`. Keeps the check on.
2. **Turn the check off** — `advanced: { database: { validateSchema: false } }`.
   From `@better-auth/core/dist/db/schema-check.mjs`:
   ```js
   function checksSchema(options) {
     return options.advanced?.database?.validateSchema !== false;
   }
   ```
   This is what the spike used, to isolate the email question from the schema
   question. It is **not** a recommendation: it disables the check for every
   table, not just this one.

Option 1 is the honest fix; the columns are trex's and nothing but trex's admin
API writes them, so a default is cheap. Recommend option 1.

The spike also had to add the columns the plugin's own schema expects, which
Task 4 must add for real:

```sql
ALTER TABLE trexdb.sso_provider
  ADD COLUMN IF NOT EXISTS "providerId" TEXT,
  ADD COLUMN IF NOT EXISTS domain TEXT,
  ADD COLUMN IF NOT EXISTS "oidcConfig" TEXT,
  ADD COLUMN IF NOT EXISTS "samlConfig" TEXT,
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
```

`providerId` must additionally be `UNIQUE` — the plugin declares it
`required: true, unique: true`. `issuer` and `domain` are declared
`required: true` too, so no federating row may leave them NULL.

---

## 5. The brief's premise is already obsolete: V17 restored `user.email NOT NULL`

`V14__user_email_nullable.sql` dropped `NOT NULL` and is the source of the
"64 of 69 accounts have none" line. But `V17__better_auth_canonical_tables.sql`
backfills every address-less user with `<username>@d2e.local`, sets
`is_placeholder_email = true`, and then at line 310:

```sql
ALTER TABLE trexdb."user"
  ALTER COLUMN email SET NOT NULL,
```

So **at V19 a NULL-email user row cannot exist.** Measuring Q1a as the brief
wrote it required `ALTER TABLE trexdb."user" ALTER COLUMN email DROP NOT NULL`
on the scratch database first (restored afterwards). It is recorded because the
answer is the same either way (Q1d), but Phase 3's later tasks should stop
describing the population as email-less: the 64 rows carry
`<username>@d2e.local` with `is_placeholder_email = true`, and that flag — not a
NULL — is what code must branch on.

This does not change the verdict. `mapping.email` naming a non-address claim is
still required, because the **upstream** still asserts no address; what changed
is only what trex stores on its side.

---

## 6. The options block, verbatim, for Tasks 3-8 to copy

Everything below was mounted and exercised end to end. `validateSchema: false`
is included because that is what was measured; see §4 before keeping it.

```ts
betterAuth({
  database: pool,                 // core/server/db.ts — MUST be the postgres pool; see §2
  secret,
  baseURL,
  // The exact upstream origin, port included. fetchOIDCEndpoint refuses
  // discovery, token and JWKS URLs outside trustedOrigins, and the refusal is
  // an APIError, not a redirect:
  //   "Untrusted OIDC discovery URL: The main discovery endpoint
  //    "<url>" is not trusted by your trusted origins configuration."
  trustedOrigins: [issuer],
  account: { encryptOAuthTokens: false },
  advanced: { database: { validateSchema: false } },   // see §4
  plugins: [
    sso({
      schema: {
        ssoProvider: {
          modelName: "sso_provider",
          // Load-bearing: undeclared columns are silently dropped from every
          // adapter read, including the one resolveUser makes. See §3/Q3b.
          additionalFields: {
            link_policy: { type: "string", required: false, input: false },
            auto_provision: { type: "boolean", required: false, input: false },
            allow_elevated_auto_link: { type: "boolean", required: false, input: false },
          },
        },
      },
      resolveUser: async (input, context) => {
        // Must not throw: resolveSSOUser swallows it into a generic
        // SSO_USER_RESOLUTION_FAILED. Reject explicitly instead. See §3.
        const row = await context.database.findOne({
          model: "ssoProvider",
          where: [{ field: "id", value: input.providerReference.source.recordId }],
        });
        return { action: "continue" };
      },
    }),
  ],
})
```

Corresponding `trexdb.sso_provider` row, as seeded:

```sql
INSERT INTO trexdb.sso_provider
  (id, "displayName", "clientId", "clientSecret", enabled, issuer,
   "providerId", domain, "oidcConfig")
VALUES ('spike_username','Spike','spike-client','shh',true,
        '<issuer>','spike_username','<issuer hostname>','<oidcConfig json from §1>');
```

`id` must satisfy V1's `CHECK (id ~ '^[a-z][a-z0-9_]*$')`, so a provider slug is
lower-snake — `spike_username`, not `spike-username`.

---

## 7. Notes on reproducing

- Scratch database: Postgres 16 in Docker, `core/schema/V*.sql` applied in
  `sort -V` order. V10 does not exist.
- The stub upstream binds `Deno.serve({ port: 0, hostname: "127.0.0.1" })` —
  never `port: 0` alone. A wildcard bind can take the Postgres port and answer
  the test's own fetch; that was a ~2% random failure in Phase 1, misdiagnosed
  twice.
- `@better-auth/sso` is not in `core/server/package.json` yet; the spike
  installed it with `npm install --no-save @better-auth/sso@1.7.5`. Task 2 adds
  it for real, pinned exactly — the package declares `"better-auth": "^1.7.5"`
  as a peer, so the two move together.
- Run with `deno test --no-check --allow-all <file>`, not `deno task test`:
  the tree carries pre-existing type errors unrelated to this work.

---

## 8. Addendum (Task 3): the §4 blocker has a third way out, and it is free

Measured 2026-09-20 against the same scratch Postgres at V19, with
`@better-auth/sso@1.7.5` installed for real (`core/server/package.json`,
pinned exactly).

Three corrections and one result §4 did not have.

### 8.1 It is not only the SSO sign-in path that throws — **sign-up throws**

§4 says "a bare `adapter.findOne` only logs this at ERROR and returns the row;
the SSO sign-in path throws". True, but the second half is narrower than
reality. The enforcement point is `runWithTransaction`
(`@better-auth/core/dist/context/transaction.mjs:59`), and
`better-auth/dist/api/routes/sign-up.mjs:143` and
`better-auth/dist/db/internal-adapter.mjs:121` both go through it. Measured:
with `sso()` mounted at V19, `auth.api.signUpEmail` throws `BetterAuthError:
Database schema mismatch`.

The blast radius of mounting the plugin against an unmigrated table is
therefore the whole engine, not federation. `sso()` must not be mounted before
the migration lands.

### 8.2 Declaring trex's columns *removes* the three "required columns"

The check's own rule (`schema-diff.mjs:40-53`): a declared field is a column
Better Auth writes, and only columns it does **not** write are reported as
`unexpected-required-column`. Declaring `displayName`, `clientId` and
`clientSecret` as `schema.ssoProvider.additionalFields` therefore settles them.
Four runs, same database, same sign-up call:

| `plugins` | `schema.ssoProvider` | sign-up at V19 | sign-up with the six plugin columns added |
|---|---|---|---|
| `[]` | — | **OK** | OK |
| `[sso()]` | `modelName` only (the §6 block) | **throws**: 6 missing + 3 required | **throws**: 3 required |
| `[sso()]` | `modelName` + trex's `additionalFields` | **throws**: 6 missing | **OK** |

So §4's "two ways out" are not the only two. **Option 3: declare the columns.**
It keeps `validateSchema` on for every table, needs no `ALTER ... DROP NOT NULL`
on three columns trex's admin API depends on being NOT NULL, and it is work the
plugin needed anyway (§3/Q3b: undeclared columns are dropped from every read).

`auth/federation/sso-config.ts` carries the declaration. The migration task's
remaining job is the six columns §4 already lists, and nothing else.

### 8.3 A declared field with no column throws just as hard

The same diff reports `missing-column` for a declared field the table has not
got, and that is the same `SchemaMismatchError` on the same paths. So the model
is a claim about the live schema in both directions.

Consequence: **`jwks_endpoint` is not declared and does not need a column.**
The resolved JWKS URL is written into the serialized `oidcConfig`, which is
itself a persisted column, so nothing is lost. A `jwks_endpoint` column would
only be one more `missing-column` for the migration to chase.

### 8.4 `claim_map` is `type: "json"`, not `"string"`

The column is `jsonb` (V11). Better Auth maps `json` onto jsonb and `string`
onto text unconditionally — the same reason `user_metadata` and `app_metadata`
are declared `json` in `better-auth.ts`.

### 8.5 `redirectURI` cannot be resolved at module scope

`federationRedirectUri()` throws when `TREX_FEDERATION_REDIRECT_URI` is unset,
and `sso({ redirectURI: federationRedirectUri() })` evaluates at import. Wiring
it that way makes the variable mandatory for every deployment, federating or
not, and a missing one is an import-time crash of the whole engine rather than
a federation that is switched off. Whoever mounts the plugin has to gate either
the variable or the mount.

### 8.6 Option names confirmed against the installed package

`redirectURI`, `guardProviderMutation`, `resolveUser` and
`schema.ssoProvider.additionalFields` all exist on `SSOOptions`
(`dist/index-sM6JWXeV.d.mts:320-536`). `DBFieldType` admits `"string[]"`
(`@better-auth/core/dist/db/type.d.mts:29`).
`OIDCConfig.tokenEndpointAuthentication` admits only `client_secret_post`,
`client_secret_basic` and `private_key_jwt`; `client_secret_post` is what
`federation/router.ts:193` already sends.

---

## 9. Addendum (Task 7): the UserInfo branch, and two `claim_map` keys nothing reads

Measured 2026-09-20 against `trex_task6` (V1..V20) and the same stub upstream,
now able to advertise a `userinfo_endpoint`.

### 9.1 §1 measured the wrong branch for anything but email

§1's whole argument runs through `dist/index.mjs:3926-3937`, the id_token
branch. That branch is only reached when `config.userInfoEndpoint` is falsy
(`:3909` is checked first), and `ensureRuntimeDiscovery` (`:3820`) hydrates
`userInfoEndpoint` from the discovery document at **sign-in time**, from
`:370`. So against any real upstream that publishes `userinfo_endpoint` —
Logto and Entra both do — the profile comes from **UserInfo**, and §1's
measurements describe a path production does not take.

This does not move the gate: `readStringClaim(rawUserInfo, mapping.email ||
"email")` at `:3921` is the same function against the same mapping, and
`:3938` is downstream of both branches. `mapping.email` naming a non-address
claim still works. §1's verdict stands; its line numbers do not.

It does matter for anything that is not one of the five mapped fields.
`userInfo` is `{id, email, emailVerified, name, image}` plus whatever
`mapping.extraFields` names, in **both** branches — so a groups claim is not in
it either way, whichever document fed it. `provisionUser` receives `userInfo`
and `token`, never `rawProfile`, so the verified id_token is the only document
in which a groups claim reaches trex. That is what `federation/provision.ts`
decodes, and `sso-callback.test.ts` pins it on the UserInfo branch as well as
the id_token one.

### 9.2 `claim_map.sub` is dropped, and it is a link-breaking drop

`applyClaimMap` (`federation/config.ts:41-58`) honours a `sub` entry: a
provider mapping `sub` to Entra's `oid` has `trexdb.account."accountId"` rows
holding **oid** values. Under the plugin the account key is
`accountKey.accountId = userInfo.id`, which is `rawUserInfo.sub` or
`idToken.sub` (`:3920`, `:3929`) with no mapping applied anywhere —
`oidcConfigFor` builds no `sub` mapping, and V20's `mapping` object
(`V20__sso_provider_better_auth.sql:125-129`) carries only `email`,
`emailVerified` and `name`. So for such a provider every already-linked user
presents a different `accountId` than its stored row holds, the pre-link
lookup misses, and the identity falls through to the email path.

There is no safe code-only fix. `accountKey` is computed before `resolveUser`
runs and `requireExactAccountBinding` is on, so a resolver that found the user
by the mapped subject would have Better Auth write a **second** account row
keyed on the real `sub`. The correct repair depends on what the live rows
carry: if no provider maps `sub`, this is documentation; if one does, it is a
V21 that rewrites `trexdb.account."accountId"` for that provider. **Assigned to
Task 8**, whose job is the audit of live `claim_map` rows.

#### 9.2a Task 8's audit: **no live row maps `sub`. No V21.**

Every `trexdb.sso_provider` row reachable from this machine, read 2026-09-20:

| database | rows | `claim_map` values |
|---|---|---|
| `trex-task2-pg/trex_reh2` | 7 | six `{}`, one `{"name":"display_name","email":"username"}` |
| `trex-task2-pg/trex_rev6` | 6 | five `{"email":"username"}`, one `{"email":"email"}` |
| `trex-task2-pg/{trex,trex_task4b,trex_task5,trex_task6,trex_v19_tpl}` | 0 | — |
| `trex-task10b-pg/trex` | 0 | — |

No row carries a `sub` key, and none carries `email_verified` either. d2e ships
no provider row at all: `grep -r sso_provider` over that repository's SQL, Helm
values and TypeScript returns nothing, so its Logto row is created through
`/admin/federation`.

That last point is what makes the audit hold beyond the databases listed. The
admin writer **cannot produce** a `sub` mapping: `ProviderUpsert` has no
`claim_map` field, `upsertProviderRow` never names the column, and
`admin.test.ts:767` pins exactly that. A row mapping `sub` can therefore only
come from hand-written SQL against the table. So this stays documentation, and
a V21 would have been speculative.

**If a deployment is later found with `claim_map ? 'sub'`**, the repair is
still the one above — a migration rewriting `trexdb.account."accountId"` from
the mapped claim's value to the upstream `sub` for that provider — and it
cannot be done in code for the reason this section gives.

The one thing this leaves standing: `applyClaimMap` honours `sub` and the
plugin does not, so the column's documented meaning is now narrower than it
reads. `config.ts`'s comment naming Entra's `oid` describes behaviour that
ended at the cutover.

### 9.3 `claim_map.email_verified` is dropped too, and that one is cheap

`oidcConfigFor` does write it, as `mapping.emailVerified` — but the plugin only
reads `mapping.emailVerified` when the deprecated `trustEmailVerified` is on
(`:3921`, `:3932`), and it is not; and `resolve-user.ts:185` reads
`claims.email_verified` off the verified id_token by a hard-coded name. So the
mapped name is persisted and then read by nobody.

Unlike `sub`, V20 does not re-purpose this key, so honouring it means what it
always meant and needs no migration — it is a one-line read of
`claims[claim_map.email_verified ?? "email_verified"]`. It is left here rather
than taken with Task 7 because it decides **who may link** under
`link_policy = 'verified_email'`, which is Task 5's guard; changing a link
decision from inside a metadata task is the wrong place for it. **Assigned to
Task 8** with §9.2, which is where the live rows are already being read.

#### 9.3a Task 8: taken, and the rows were not the reason

No live row maps this key either (§9.2a), so the fix changes nothing anybody is
running today. It was taken anyway, because the argument is not about the rows:
`applyClaimMap` reads the flag through `claim_map.email_verified` **today**, so
leaving the plugin's hard-coded `claims.email_verified` in place would have been
a behaviour change shipped by the cutover rather than a feature not carried
over. A provider that named its own claim would have started reporting every
address unverified and linking nobody under `verified_email`, silently.

`resolve-user.ts` now reads `claims[claim_map.email_verified ?? "email_verified"]`,
with a blank or non-string mapping falling back to the standard name. No
migration: unlike `claim_map.email`, V20 does not re-purpose this key — it only
copies it into `mapping.emailVerified`, which nothing reads while
`trustEmailVerified` is off.

---

## 10. Addendum (Task 8): two id_token checks the cutover gives up

Both were enforced by `federation/verify.ts`, which Task 8 deleted, and neither
has an equivalent in `@better-auth/sso` 1.7.5. They are recorded here because
they were **accepted**, not overlooked: the plugin exposes no option for either
and reimplementing one would mean re-verifying the token after the plugin has
already acted on it, which is worse than the gap. Six tests went with them.

### 10.1 The OIDC `nonce` is gone

`grep -c nonce node_modules/@better-auth/sso/dist/index.mjs` → **0**. The
authorization URL the plugin builds carries no `nonce` parameter, and
`validateOIDCIdToken` checks the signature, `issuer`, `audience` and `azp` and
nothing else. `verify.ts:54-59` required a caller-supplied nonce to be present,
non-empty and equal to the claim — deliberately strict, so that a token
carrying no `nonce` could not verify against an absent one.

**Why accepting it is defensible.** OIDC Core makes `nonce` OPTIONAL for the
authorization-code flow (it is REQUIRED only for the implicit and hybrid flows),
and what it defends there is covered twice over here: PKCE S256 is on per
provider, so an intercepted code cannot be redeemed without the verifier, and
the `state` is single-use, database-backed and bound to a signed browser cookie,
so an id_token cannot be replayed into a session through a flow the victim did
not start. What is genuinely lost is the narrow case of an id_token minted for
one authorization request being injected into another *by the same browser*,
which the state cookie already makes uninteresting.

**What would have to change to get it back:** the plugin would have to send
`nonce` on the authorization URL, persist it in the state payload, and check it
in `validateOIDCIdToken`. That is an upstream change, not a configuration one.
`router.test.ts` pins the absence, so a version that adds it is visible rather
than silently ignored.

### 10.2 The signing algorithm is no longer restricted to what the provider advertises

`verify.ts:51` passed `algorithms: doc.id_token_signing_alg_values_supported`.
The plugin passes no `algorithms` at all.

**Narrower than it sounds, and still a reduction.** `createRemoteJWKSet`
resolves a key by the header's `alg`/`kid`, so a downgrade to `none` or to an
HMAC is not available — there is no symmetric key in an upstream's JWKS to
resolve to. What is lost is the *pinning*: an upstream whose discovery document
advertises only `RS256` but whose JWKS also serves, say, an EC key will now have
an `ES256`-signed token accepted. The document is no longer the authority on
which of its own keys may sign.

### 10.3 Both belong in the d2e PR notes

Alongside the refusal-vocabulary change (the plugin's own codes —
`invalid_provider`, `discovery_failed`, `missing_user_info` — can now reach
d2e's login page as `?error=`), these are the three behaviour changes a d2e
reviewer cannot see from the diff.

---

## 11. Addendum (Task 10): where the deleted code's behaviour went

Task 10 deleted the hand-written relying party's remaining readers. The
enumeration lives in the commit messages and in the task report; this section
records only the three things earlier sections here left open, and two facts
about this file itself.

### 11.1 §9.2's last paragraph is discharged

`applyClaimMap` is deleted, and with it the `config.ts` comment naming Entra's
`oid` — which by then described a capability that had ended at the cutover
rather than one that was merely stale. The regression is recorded where an
operator reads rather than where a maintainer does:
`plugins/docs/docs/concepts/auth-model.md`, under "What the cutover to
`@better-auth/sso` gave up", together with §10.1's `nonce` and §10.2's
algorithm pinning. The repair for a deployment whose `claim_map` maps `sub` is
still the migration §9.2 describes.

`federation/config.ts` no longer exists. Its two environment switches are
`federation/flags.ts`; every other reference in this document to `config.ts:NN`
is to a deleted file.

### 11.2 `trexdb.save_sso_provider` survives, and stopped being silent

The function writes five columns and `issuer` is not among them, so every row
the MCP `sso-save` tool can CREATE is excluded by `issuer IS NOT NULL` from both
the login page (`enabledProviderIds`) and `/authorize`. Measured: the tool
accepts `enabled: true`, reports success, `sso-list` then shows the provider
enabled, and no button ever appears with no error anywhere.

Neither is deleted. The tool has a job the admin API does not cover — rotating
`clientId`/`clientSecret` on an already-configured provider, which Task 7 wired
into `oidcConfig` — and the function is V1 and cannot be changed without a
migration. What is fixed is the silence: the write reads `issuer` back in the
same transaction and says the provider cannot federate, naming
`PUT /admin/federation/providers/:id`. Pinned in `mcp/tools/sso.test.ts`, with a
control so the warning cannot become unconditional.

Consequently **V20's `trg_sso_provider_mirror_provider_id` stays needed.** It is
the only thing filling `"providerId"` for that writer. Removing it would need a
V22 and there is nothing to remove it for.

### 11.3 `domain` and the authentication fingerprint

`domain` feeds `computeProviderAuthenticationFingerprint` (`:916-920`), so the
first `PUT /providers/:id` against a provider that predates V20's backfill
changes the fingerprint once and aborts sign-ins already in flight — the same
wanted behaviour Task 5 recorded for `oidcConfig`, arrived at for a different
reason. Recorded in `plugins/docs/docs/apis/auth.md`, along with the fact that a
hand-set multi-domain `domain` is overwritten by any later PUT and cannot be
restored through any route, since the plugin's own provider-mutation endpoints
are sealed.

### 11.4 A stale statement in a frozen file, left stale

`admin-api.contract.test.ts:15` says these tests need trexdb "at V19". The floor
is V20, and V21 once Task 6's trigger is required. The file is frozen at blob
`a927802fef2abe5d93c5c79f928db702d5604ef0` because d2e PR #3358 calls the wire
it pins, so the comment is recorded here rather than corrected there.
