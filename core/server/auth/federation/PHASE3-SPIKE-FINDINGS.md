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
