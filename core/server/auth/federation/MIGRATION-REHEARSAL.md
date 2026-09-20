# Phase 3 migration rehearsal (Task 11)

Run 2026-09-20 in the worktree `better-auth-sso` at `c8de0d73`. Written as it
was measured; every line below is something that was watched, and anything that
could not be run says so.

Nothing here touched a deployed environment. The only non-synthetic rows in
reach were the local docker-compose d2e stack on this laptop, and even those
were read once and then cloned — every migration and boot below ran against the
clone.

## 0. What "real data" turned out to be available

The brief's step 1 assumes a dump at `~/develop-d2e-sg-*.sql.gz`. **There is no
such file on this machine**, and no database restored from one either:

- `find /Users/ph -maxdepth 6 \( -iname '*.sql.gz' -o -iname '*.dump' \)` — no hits.
- The 156 MB `pg_dump` dated 2026-09-17 that Task 10's review package ran
  against (`task-10-review-package.md:74`) is gone; nothing on disk, no docker
  volume holding it.
- None of the eleven reachable scratch databases carries the rehearsed
  population. Counts of `trexdb."user"`: `trex_task6` 91, `trex_rev8v20` 76,
  `trex_task5` 73, `trex_rev8` 43, `trex_rev6` 14, `trexspike` 6,
  `trex_task4b` 5, and 1 each in `trex`, `trex_reh2`, `trex_v19_tpl` and
  task10b's `trex`. **None holds a single `%@d2e.local` address and none has
  `is_placeholder_email = true` on any row** — so none is a copy of the
  installation whose V17 backfilled 66 of 69 users. They are synthetic.

**So the 69-row population is not rehearsable here.** Every result below that
would have wanted it says so in place.

### Where trex's tables actually live

Task 8 recorded its `claim_map` audit as resting on reachable rows plus a
writer argument, because the `d2e-trex` container ships no `psql`. trex's tables
are not in that container: `d2e-trex`'s `PGRST_DB_URI` names the compose
stack's `d2e-minerva-postgres-1`, whose `alp` database carries the `trexdb`
schema and all 35 trex tables. That container is `postgres:15-alpine` and does
ship `psql`, so the rows are readable over its own local socket with
`docker exec`. The gap Task 8 flagged is closed by inspection rather than by
argument.

That installation is at schema version 19 (`trexdb.refinery_schema_history`
tops out at `19 | oauth_provider_tables`), which is exactly the pre-cutover
state V20 and V21 have to migrate — so it is a usable, if small, migration
subject.

## 1. The `claim_map` audit, on non-synthetic rows — SETTLED, no V21-style repair

The compose stack's `trexdb.sso_provider` is **empty** (0 rows), so a fortiori
no row maps `sub`. Task 8's "d2e ships no provider row" is now observed rather
than inferred.

Swept across every reachable database as well:

| database | provider rows | rows mapping `sub` |
|---|---|---|
| compose stack `trexdb` | 0 | 0 |
| `trex_rev6` | 6 | 0 |
| `trex_reh2` | 7 | 0 |
| `trexspike` | 6 | 0 |
| `trex`, `trex_task4b`, `trex_task5`, `trex_task6`, `trex_v19_tpl`, `trex_rev8`, `trex_rev8v20`, task10b's `trex` | 0 each | 0 |

19 provider rows across 11 databases; **none maps `sub`**. Section 9.2a's repair
stays unused and no V22 is written.

## 2. The rehearsal database

Because the real rows could not be copied off the stack, the rehearsal splits
what is real from what is reconstructed, and says which is which:

- **The schema is real.** `pg_dump --schema=trexdb --schema-only` of the
  compose stack, i.e. the DDL trex's own refinery migrator produced end to end
  through V19 — not `core/schema/V*.sql` re-applied by hand, which is what
  every earlier task rehearsed against. Restored into `trex_reh11` on
  `trex-task2-pg`: 35 tables, no errors.
- **The rows are reconstructed** to the shape the phase documents: 69 users, 66
  of them carrying a V17-style `<slug>@d2e.local` placeholder with
  `is_placeholder_email = true`, all 69 pre-linked in `trexdb.account` under
  `providerId = 'logto'`, 69 `user_role` rows, and five `sso_provider` rows
  chosen to exercise V20's derivations.

### A real-schema surprise the synthetic rehearsals could not have shown

The seed's first attempt failed:

```
ERROR:  new row for relation "sso_provider" violates check constraint
        "sso_provider_link_policy_check"
```

At V19 `link_policy` is **`CHECK (link_policy = 'verified_email')`** — a single
allowed value, from V11:35-48. `subject_only` is not a storable policy and never
has been. Anything in the plan or the briefs that reads as though `link_policy`
selects between policies is describing a column that cannot hold a second value;
`resolve-user.ts:173` is consistent with this ("This is now that rule's only
…"), but it is worth having measured.

## 3. V20 and V21 against the real schema — applied twice, idempotent by row count

Each file applied with `ON_ERROR_STOP=1`, twice, row counts watched:

| | pass 1 | pass 2 |
|---|---|---|
| V20 `SET "providerId" = id` | `UPDATE 5` | **`UPDATE 0`** |
| V20 `SET domain = …` | `UPDATE 4` | **`UPDATE 0`** |
| V20 `SET "oidcConfig" = …` | `UPDATE 4` | **`UPDATE 0`** |
| V21 | trigger created, no DML | trigger replaced, no DML |

`UPDATE 4` rather than 5 on the two issuer-derived backfills is the `noissuer`
row being skipped by `WHERE … issuer IS NOT NULL`, which is what V11's nullable
`issuer` is for. Pass 2's three `UPDATE 0`s are the idempotency evidence the
brief asked for — not merely "no error".

### Invariants (md5 over the whole table, before vs after both passes)

| | before | after | |
|---|---|---|---|
| `"user"` (id, email, is_placeholder_email, role) | `3faedfa8…` | `3faedfa8…` | unchanged |
| `account` (id, userId, accountId, providerId) | `6dd9d916…` | `6dd9d916…` | unchanged |
| `user_role` (userId, roleId) | `3791098e…` | `3791098e…` | unchanged |
| `sso_provider` policy columns | `33e5f613…` | `33e5f613…` | unchanged |

No subject lost, no federated link rewritten, no placeholder address touched,
and every per-provider policy column exactly as recorded.

### `domain` derivation vs what the admin API would write — identical

`admin-store.ts`'s `upsertProviderRow` claims to use V20's expression "character
for character". Evaluated both against the same five rows:

| id | issuer | V20's `domain` | admin API's expression | agree |
|---|---|---|---|---|
| `logto` | `https://logto.d2e.local/oidc` | `logto.d2e.local` | same | yes |
| `withport` | `https://idp.example.org:8443/oidc` | `idp.example.org:8443` | same | yes |
| `trailing` | `https://idp2.example.org/` | `idp2.example.org` | same | yes |
| `mixedcase` | `https://IdP3.Example.ORG/realms/d2e` | `idp3.example.org` | same | yes |
| `noissuer` | NULL | NULL | NULL | yes |

Port kept, case folded, path and trailing slash dropped. The claim holds.

### `oidcConfig.mapping.email` — the lever, on migrated rows

| id | `claim_map` | `mapping` written by V20 |
|---|---|---|
| `logto` | `{"email":"username"}` | `{"name":"name","email":"username","emailVerified":"email_verified"}` |
| `mixedcase` | `{"name":"display_name","email":"username"}` | `{"name":"display_name","email":"username","emailVerified":"email_verified"}` |
| `trailing` | `{"email":"email"}` | `{"name":"name","email":"email","emailVerified":"email_verified"}` |
| `withport` | `{}` | `{"name":"name","email":"sub","emailVerified":"email_verified"}` |
| `noissuer` | `{}` | no `oidcConfig` at all |

The `{}` row falling back to `sub` is V20's documented fallback and is the case
that makes a provider configured before federation still resolvable.

## 4. The suites, against the migrated copy

Run per directory, `DATABASE_URL` pointing at a clone of the migrated rehearsal
database (V19 real schema + V20 + V21 + the 69-row population):

| directory | result |
|---|---|
| `auth/federation/` | **262 passed / 0 failed** |
| `auth/*.test.ts` | **185 passed / 0 failed** |
| `auth/oidc/` | **79 passed / 0 failed** |
| `mcp/tools/` | **10 passed / 0 failed** |

536 total — identical to Task 10's baseline (`progress.md:1193`), so the
migrated real-schema database reproduces it exactly.

Frozen blobs re-verified on this tree:

```
a927802fef2abe5d93c5c79f928db702d5604ef0  admin-api.contract.test.ts
de05a39f9c4fb73f8eb165d399525e50a55a21b0  auth-router.contract.test.ts
02394bc9f89ee29e6d2e9a2587682f3ef6bfaa1d  head -2173 auth-router.contract.test.ts
```

All three match. Neither file was edited.

### Two things the run needed that the brief did not mention

1. **`deno test` must be run `--no-check`.** Type-checking fails on
   `core/server/auth/password.ts:20` and `:41` — `Expected 3 arguments, but got
   4` for `promisify(scrypt)`. That file was last touched in `451d3e45`, long
   before Phase 3, and nothing in `auth/federation/` imports the failing
   expression's types; it is a `@types/node` mismatch in the installed
   `node_modules`, not a defect this phase introduced. Recorded because a
   reader running the suites the obvious way will hit it and may mistake it for
   one.
2. **The copy needs the `auth` schema as well as `trexdb`.**
   `admin.test.ts:650` calls `auth.uid()`. A `--schema=trexdb` dump alone makes
   "a pre-linked user with a 12-character id signs in end to end" fail with
   `schema "auth" does not exist`. With `--schema=auth` added, green.

## 5. THE GATE, on the whole migrated population — **PASSES**

Driven through `auth.options` spread verbatim (the engine `better-auth.ts`
exports, plugins and all; only `trustedOrigins` widened for the stub and the
rate limiter off), against the **migrated** `logto` row — the row V20 wrote,
re-aimed at the stub through `refreshProviderOidcConfig`, i.e. trex's own
writer, not a literal.

The upstream is deliberately **Logto-shaped**: its discovery document
advertises `userinfo_endpoint`, so the plugin takes the UserInfo branch, and
its UserInfo document carries `sub`, `username` and `name` and **no `email`,
no `email_verified`** — a username-only directory entry.

All 69 pre-linked users signed in, one after another:

```
REFUSED: 0 []
SESSIONS distinct userId = 69
ACCOUNTS {"n":69,"same":69}
```

- **0 refusals out of 69.** Every one returned 302 to `/signed-in` with no
  `?error=`.
- **69 distinct sessions**, each keyed on the user's pre-migration id.
- **69 account rows, all with `"userId" = "accountId"`** — the plugin created
  no second row for any identity, which is what `requireExactAccountBinding`
  plus the preserved `("providerId","accountId")` key are for.
- **`SELECT id, email, is_placeholder_email FROM trexdb."user" ORDER BY id`
  is byte-identical before and after all 69 sign-ins.** The 66 `usrN@d2e.local`
  placeholders were not rewritten and not one `is_placeholder_email` was
  cleared. This is the gate the phase rests on, and it is open on the whole
  population rather than on one fixture.
- **`user_role` identical before and after**, all 69 rows.

### The branch actually taken — §9.1 confirmed, §1's branch never runs

```
USERINFO calls=69 first={"sub":"logto-subject-1","username":"usr1","name":"Rehearsed User"}
USERINFO auth header prefix=["Bearer"]
```

Sixty-nine UserInfo fetches for sixty-nine sign-ins. The id_token branch was
**not taken once**. `PHASE3-SPIKE-FINDINGS.md` §9.1 is right and §1's line
numbers describe a path this configuration never reaches — so the claim
`mapping.email` names has to be present in the **UserInfo document**, not
merely in the id_token. Section 6 below measures what happens when it is not.

### The `idp` block, from the id_token, on the UserInfo branch

```
IDP {"app_metadata":{"idp":{"groups":["alp-admins"],"provider":"logto"},
     "provider":"email","providers":["email"]},"stamped":true}
```

The groups claim reached trex even though UserInfo fed the profile, because
`provision.ts` decodes the id_token rather than reading `userInfo` — exactly
what §9.1 says has to be true, now observed on the branch that matters.
`last_sign_in_at` is stamped.

## 6. Q3 — the gate depends on the **UserInfo** document, and that is a finding

Two runs of the same provider row, the same claims, the same pre-linked user.
Only the discovery document differs:

| upstream | id_token | UserInfo | outcome |
|---|---|---|---|
| advertises `userinfo_endpoint` | `{sub, username}` | `{sub, name}` — **no `username`** | **REFUSED, `invalid_provider`** |
| advertises **no** `userinfo_endpoint` | `{sub, username}` | — | **signs in, no error** |

`mapping.email` was `"username"` in both. So:

- the claim `mapping.email` names must be in the **UserInfo document**. Its
  presence in the id_token buys nothing once the upstream publishes
  `userinfo_endpoint`, and every real upstream does.
- a pre-linked identity is refused in that case. **The link does not save it** —
  `:3938`'s `!userInfo.email` fires before anything looks the account up.

Task 5's review was right and `PHASE3-SPIKE-FINDINGS.md` §9.1 is right; §1's
measurement of the id_token branch is not merely a line-number caveat, it
measures a branch that decides nothing here.

### What this means for d2e's Logto — **UNVERIFIED, and it is now the only thing left between this phase and a locked-out installation**

`Global Constraints`' first `[UNVERIFIED]` marker says the gate rests on
"Logto's custom JWT emitting `username` and `preferred_username`". **That
premise is the wrong one.** d2e configures that customizer in
`services/alp-logto/post-init/src/main.ts:549`:

```ts
await upsert("configs/jwt-customizer/access-token", headers, payload);
```

`configs/jwt-customizer/**access-token**`. It shapes the **access token**, which
the plugin never reads for the mapping. It does not touch UserInfo and it does
not touch the id_token. The comment above it says as much in its own terms —
the claims exist so "OHDSI WebAPI, Atlas3 display the real login".

So the gate rests instead on **Logto's stock UserInfo response for a
`profile`-scoped request carrying `username`**, and on the provider row
requesting the `profile` scope. Neither has been read from a running Logto —
this machine runs no Logto container, and develop.d2e.sg is a deployed
environment this rehearsal is not allowed to touch.

**This is one `curl` from settled**, and it should be done before cutover:

```
curl -H "Authorization: Bearer <profile-scoped access token>" \
     https://<logto>/oidc/me
```

If the body has no `username`, **every** federated sign-in on a username-only
account is refused with `invalid_provider` — pre-linked or not. Section 8
records the configuration change that fixes it without a code change.

## 7. The mitigation, measured — `mapping.email = "sub"`, no code change

If Logto's UserInfo turns out not to carry `username`, the fix is a column, not
a migration. Setting the provider's `claim_map` to `{}` makes V20 and
`oidcConfigFor` write `mapping.email = "sub"`, and `sub` is the one claim every
UserInfo document must carry.

Driven against a UserInfo document containing **nothing but `sub`**, over all
69 pre-linked users:

```
Q3-MITIGATION refused=0 []
Q3-MITIGATION addresses unchanged = true
```

69 of 69 in, no address rewritten, no placeholder flag cleared. **No V22 is
needed for this and no code change is needed for it.**

## 8. Q5 — the trusted-origins audit, on the migrated rows

Run against the five rows exactly as V20 left them:

```
[federation] MISCONFIGURED: BETTER_AUTH_TRUSTED_ORIGINS does not contain the issuer
origin of 4 enabled provider(s) — logto (https://logto.d2e.local),
withport (https://idp.example.org:8443), trailing (https://idp2.example.org),
mixedcase (https://idp3.example.org). … Add these origins to
BETTER_AUTH_TRUSTED_ORIGINS (comma-separated):
https://logto.d2e.local,https://idp.example.org:8443,https://idp2.example.org,https://idp3.example.org
```

Correct on every count against real-shaped rows: four of five named, the
`noissuer` row correctly excluded (it is `enabled = false` **and** has no
issuer), the port kept on `withport`, and the mixed-case issuer folded. Trusting
only `https://logto.d2e.local` narrows the message to the other three, so the
audit is per row and not all-or-nothing.

### The configuration side of it — nothing in d2e sets the variable

`grep -rn 'BETTER_AUTH_TRUSTED_ORIGINS|TREX_FEDERATION_ENABLED|TREX_FEDERATION_REDIRECT_URI'`
over the whole of `/Users/ph/code/d2e` returns **zero hits**, and the running
`d2e-trex` container's environment has none of the three. So on the day
federation is switched on:

- the audit will fire for every provider, because the variable does not exist;
- `federationRedirectUri()` throws, which is the fifth documented reduction,
  reached rather than theoretical.

Both are d2e-side configuration, which the plan puts in PR #3358's scope. This
records that as of today it is genuinely absent, not merely unread.

## 9. Q6 — the documented reductions, against measurement

`auth-model.md`'s list has **eight** bullets, not seven; Task 10's last commit
("name the fourth capability the cutover took") added one after the count was
written. Each, with what was watched:

| # | reduction | disposition |
|---|---|---|
| 1 | `claim_map.sub` does nothing | **CONFIRMED, and inert**: no row anywhere maps `sub` (§1), so nothing is affected today |
| 2 | `claim_map.email` no longer selects the address claim; a first-time identity is refused | **CONFIRMED by measurement**: `Q6a FIRST-TIME: status=302 error=no_account created=0` — the exact code the doc names, and no row created |
| 3 | no OIDC `nonce` | **CONFIRMED**: `router.test.ts`'s "the authorization URL carries no nonce, which is a known accepted loss" passes against this database |
| 4 | signing algorithm no longer pinned to what discovery advertises | **NOT RE-MEASURED.** Carried from §10.2's reading of the plugin; this rehearsal did not build a second-algorithm JWKS |
| 5 | `TREX_FEDERATION_REDIRECT_URI` now required | **CONFIRMED**: `federationRedirectUri()` throws when unset, and d2e sets it nowhere (§8) |
| 6 | every issuer origin must be in `BETTER_AUTH_TRUSTED_ORIGINS` | **CONFIRMED by the audit's own output** (§8) |
| 7 | a stored mixed-case address no longer matches | **CONFIRMED by measurement**, see below |
| 8 | auto-provision requires `claim_map.email` to name a real address claim | **CONFIRMED**: `sso-callback.test.ts`'s "auto-provision cannot write a mapped username into the address column" passes |

### Reduction 7, the pair that shows it is the case and not the code

Same upstream, same verified `email` claim `mixed.case@example.org`, same
provider, same policy. Only the stored row's case differs:

```
Q6a-bis EXACT-CASE: status=302 error=null      linked=1
Q6b   MIXED-CASE:   status=302 error=no_account linked=0
Q6b rows now: [{"id":"q6b-existing","email":"Mixed.Case@Example.ORG"}]
```

It is fail-closed exactly as documented: the mixed-case row is not linked, and
it is also **not duplicated** — no second user row was created and the stored
address was not rewritten.

## 10. The refusal vocabulary a login page actually receives

Measured at the callback, and read out of the plugin. `router.ts:297-298` sets
`error` to `safeErrorCode(refusal)` and **deletes `error_description`**. The
plugin's `redirectOIDCError(code, description)` puts its *first* argument in
`error`, and it has only three:

```
invalid_state      x2 distinct descriptions
invalid_provider   x11 distinct descriptions
discovery_failed   x1
```

So **eleven distinct plugin failure modes arrive at the login page as the single
token `invalid_provider`** — including `missing_user_info` (§6's blocker),
`jwks_endpoint_not_found`, `token_not_verified` and
`id_token_userinfo_subject_mismatch`. `discovery_failed` never reaches a login
page at all on trex's own route: `/authorize` turns a non-404 throw into a 500
`server_error` (`router.ts:222`), and a discovery failure at the callback is
caught as an exception. And the description is **not logged either** — the only
`console.error`s in the file are on the two exception paths (`:207`, `:335`), so
a redirecting refusal leaves no server-side record of its reason.

Codes trex itself emits and that do pass through: `no_account`,
`email_domain_not_allowed` (both watched above), plus whatever the upstream
sent, bounded to `^[a-z_]{1,64}$` by `safeErrorCode`.

**Nothing was found that renders any of them.** `d2e-login` — the path
`TREX_OIDC_LOGIN_URL` names on the running installation
(`https://localhost:41100/d2e-login/`) — appears nowhere in the d2e repository,
and the stack's Caddy is running the image's stock Caddyfile with no such route.
So "does the vocabulary render sensibly" could not be answered: there is no page
in reach that maps these codes to text.

## 11. The unauthenticated callback DoS fix, under proxy chains

`router.test.ts`'s two flood cases run with `chain(edge, spoof)` —
`"<caller-chosen>, <proxy-appended>"` — under `app.set("trust proxy", 1)`, which
is the shape that separates forwarding `req.ip` from forwarding the raw header.
Both pass against this database:

```
a flood at /callback cannot lock out a sign-in from another address ... ok (1s)
a busy shared address does not lock itself out of /callback ... ok (344ms)
```

700 junk callbacks over seven addresses, then the victim's whole journey
completes with a session row. Watched, not inferred.

## 12. Disposition of every step in the brief

| step | disposition |
|---|---|
| 1 — restore a dump into a scratch database | **SUBSTITUTED.** No dump exists (§0). Replaced with a schema-only dump of the running installation plus a reconstructed population (§2) |
| 2 — record the before state | **DONE** on the rehearsal database (§3). The brief's expected numbers are not reproducible: V14's "69 users, 64 without an address" describes an installation not present here, and the installation that *is* present has 2 users, 0 with a NULL address (V17 made the column NOT NULL), 0 federated accounts and 0 provider rows |
| 3 — apply the migration and boot trex | **PARTIAL.** V20 and V21 applied twice (§3); the exported engine was driven in-process and `router.test.ts` drives the express routes over HTTP — but no `core/server` process was started as a service against the copy. The step's expected `backfillJwksEndpoints` **does not exist**, and neither does a `jwks_endpoint` column: V20:26 records the decision that superseded it |
| 4 — assert the invariants | **DONE** (§3) — all six, by whole-table md5 |
| 5 — sign every user in | **DONE** (§5) — 69 of 69, on the UserInfo branch, plus the `app_metadata.idp` block and `last_sign_in_at`. Not done through `GET ${BASE_PATH}/auth/v1/user`: roles were read from `trexdb.user_role` instead, and usermgmt was not exercised |
| 6 — d2e's `test_logto_federation` CI job | **NOT RUN.** It exists — `.github/workflows/docker-build-push.yaml:1256` on `p-hoffmann/logto-federation-migration`, confirming the brief's controller note. It needs a GHCR login, five upstream image builds and a 15 GB swapfile, and it pins `LOGTO_ERA_TAG 0.18.12` with its own `TREXSQL_REF`, so it would not exercise this worktree's V20/V21 without changing those pins |
| 7 — write down the result and commit | **DONE** — this file, committed as it was measured |
