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
