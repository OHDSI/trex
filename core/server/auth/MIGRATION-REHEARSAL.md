# Migration rehearsal — V13…V17 and the population that arrives after them

The Better Auth cutover has no fallback engine. Recovery from a bad deploy is
restoring a snapshot and redeploying the previous image, so this branch is gated
on a rehearsal against a real installation's data rather than against fixtures.

This file records that rehearsal: what was run, against what, and what an
operator has to do before upgrading. Local parts of real addresses are redacted
to their first two characters; real usernames are not reproduced.

**Two function names in this file no longer exist.** The rehearsal is a dated
record and is left as it was measured, but a reader following it into the tree
should know that Phase 3's cutover to `@better-auth/sso` deleted
`resolveFederatedUser` and `findLinkCandidateByEmail`. Their successors are
`federation/resolve-user.ts`'s `resolveSsoUser` and its `findCandidate`, which
make the same decisions in the same order against Better Auth's adapter; every
property this file relies on is pinned in `federation/resolve-user.test.ts`.

The tree rehearsed is this file's parent commit. Re-running it after a change to
`engine-address.ts`, `federation/link.ts`, `federation/admin-store.ts`,
`federation/providers.ts` or `core/schema/V16`–`V17` is the point of recording
it; the numbers below are only true of that tree.

## What it ran against

| | |
|---|---|
| data | `pg_dump` of `alp` from a live installation, 2026-09-17, 156 MB gzipped |
| engine | `postgres:15-alpine`, `PostgreSQL 15.19 on aarch64-unknown-linux-musl` — the version the installation runs, not the 17 the test suite uses |
| schema on arrival | `trexdb.refinery_schema_history` holds V1–V9, V11, V12 (there is no V10); `user.email` is `NOT NULL`, there is no `user_email_lower_key` and no `is_placeholder_email` |
| migration runner | each `V*.sql` file's whole text in one transaction, `psql --single-transaction -v ON_ERROR_STOP=1`, mirroring `execute_migrations` in `plugins/migration/src/lib.rs` |

The restore produces two errors, both benign and unrelated to auth:
`logto.applications_roles` and `logto.users_roles` lose their `COPY` because the
dump's `public.check_role_type` trigger references an unqualified `roles` table
that `search_path=''` cannot resolve. Everything else restores clean.

## The thing the rehearsal had to get right

`trexdb."user"` in that dump holds **one row** — the seeded default admin. The
installation's 71 real users are still in the old IdP, and **66 of them have no
email address at all**. So applying V13…V17 to this dump exercises almost none
of V17's data handling, and a rehearsal that stopped there would have proved the
upgrade safe on one row.

Those 66 reach `trexdb` **after** V17 has run, through the federation admin link
API (`PUT /trex/admin/federation/links`), which a migration drives in bulk. That
is the population this branch's guards actually have to serve, and it is what
the bulk of this rehearsal drives.

## 1. The migrations themselves

V13, V14, V15, V16 and V17 applied in version order, each clean. V17's data
statements on this dump: `INSERT 0 1` (the admin's credential account), the
`impersonatedBy` and `is_placeholder_email` DDL, both `DO` blocks passing, ten
no-op backfill `UPDATE 0`s, four `ALTER TABLE`s, two `COMMENT`s. The address
fold matched nothing; the placeholder backfill minted nothing.

Afterwards: `user.email`, `emailVerified`, `createdAt`, `updatedAt` and
`is_placeholder_email` are `NOT NULL`; `session."impersonatedBy"` exists and is
nullable; `user_email_lower_key` sits alongside V1's `user_email_key`;
`trexdb.account` holds one `credential` row carrying the admin's password.

The branch's own auth suite was then run against that migrated database on the
same 15.19 server:

```
ok | 360 passed | 0 failed (13s)
```

including `no schema migration is outstanding` and Better Auth's own schema
check.

## 2. The population that arrives afterwards

Driven through the real route, over HTTP, with the exact body the caller sends
(`providerId`, `accountId` = the upstream id, `userId` = the upstream id,
`email`, `name`, `banned`), for the whole real directory: 71 rows joined to an
upstream identity, of which the caller's own planning excludes 4 (two pairs of
directory rows that resolve to one address), leaving **67 links**.

Of those 67, **3 carry a real address** and **64 are a bare username qualified
with a configured domain**.

```
### Step 3 — PUT /trex/admin/federation/links, one call per planned link
  200 created: 67
  no failures

### Step 4 — re-run of the same plan (a second boot of the migration)
  200 already_linked: 67
```

Every one of the 67 came back under the id the caller asked for, so nobody's
token `sub` moved. The re-run is a no-op, which matters because the caller runs
on every boot.

### Two directory rows, one address

```
  case-variant of an already-migrated address (br…@d2e.local vs br…@d2e.local upper-cased)
    -> 409 {"error":"conflict","userId":"0l66mixo4fqp"}
  the seeded admin's address under a different upstream id -> 409 {"error":"conflict","userId":"00000000-0000-0000-0000-000000000001"}
  the 2 duplicate-address groups the caller skips, forced through anyway:
    address af…@data4life-asia.care — 2 directory rows, upstream ids <same id twice>
      -> 200 {"outcome":"created"} then 200 {"outcome":"already_linked"}
    address ti…@data4life.care — 2 directory rows, upstream ids <same id twice>
      -> 200 {"outcome":"created"} then 200 {"outcome":"already_linked"}
```

A case variant of an already-migrated address is refused with a 409 naming the
row that holds it, not silently linked onto it. The installation's two
"duplicate" directory rows turn out to share one upstream identity, so the
second call is an idempotent re-link rather than a second account.

### Awkward usernames

Each of these is a username a real directory can hold, put through the caller's
own address-building rule and then through the route.

| username | address built | route |
|---|---|---|
| `qa_researcher_1` | `qa_researcher_1@d2e.local` | 200 created |
| `QA_Researcher_2` | `qa_researcher_2@d2e.local` | 200 created |
| (upstream address, padded, mixed case) | `qa.three@data4life.care` | 200 created |
| `qa.four@data4life-asia.care` | unchanged | 200 created |
| `jane doe` | `jane doe@d2e.local` | **422 unaddressable_email** |
| `jörg` | `jörg@d2e.local` | **422 unaddressable_email** |
| `研究者` | `研究者@d2e.local` | **422 unaddressable_email** |
| `İstanbul` | `i̇stanbul@d2e.local` | **422 unaddressable_email** |
| `foo..bar` | `foo..bar@d2e.local` | **422 unaddressable_email** |
| `.lead` | `.lead@d2e.local` | **422 unaddressable_email** |
| `trail.` | `trail.@d2e.local` | **422 unaddressable_email** |
| `ops`, domain `localhost` | `ops@localhost` | **422 unaddressable_email** |
| `` (empty) | address is `null` | never reaches trex |

```
      body: {"error":"unaddressable_email","email":"jane doe@d2e.local"}
```

The refusal names the address, which is what lets a bulk migration record the
skip with a reason. **No user row was created for any refused case** — verified
directly: only the four accepted ids exist, none of the refused ones.

### Can they sign in?

```
### Step 8 — federated sign-in resolves each migrated identity to its own user
  resolved to their own id: 67/67

### Step 9 — the engine serves every migrated address (password grant, end to end)
  passwords set through PUT /admin/users/:id: 67/67
  password grants that returned an access token: 67/67
  credential accounts holding a password afterwards: 68
  engine session rows created by those grants: 67
```

`resolveFederatedUser` is the path these users actually sign in by; the password
grant is the strictest available proof that the engine will accept and resolve
each address, since it runs the engine's own validation before any lookup.
Credentials land in `account.password` for `providerId = 'credential'` and agree
with `user.password_hash` in every row.

### Invariants afterwards

| invariant | result |
|---|---|
| addresses not lower-case | 0 |
| addresses V17's own expression rejects | 0 |
| case-only duplicate addresses | 0 |
| NULL address | 0 |
| `password_hash` set with no credential account | 0 |
| credential password disagreeing with `user.password_hash` | 0 |
| upstream account rows with no user row | 0 |
| user rows created by a refused call | 0 |

## 3. FINDING — synthesised addresses arrive unflagged (FIXED — see §3.1)

```
  rows on the placeholder domain @d2e.local: 66
  ...of those, flagged is_placeholder_email: 0
  ...of those, emailVerified = true: 66
  rows flagged is_placeholder_email anywhere: 0
```

V17 and `provisionUser` mint a placeholder only for an identity that asserts
**no** address, under `PLACEHOLDER_EMAIL_DOMAIN = 'd2e.local'`, and flag it. The
admin link API never sees that case: its request body requires an address, and
the caller supplies `<username>@<domain>` for exactly the accounts that have
none. With the domain left at its default the two collide — 66 rows land on the
placeholder domain with `is_placeholder_email = false`, `emailVerified = true`
and `email_confirmed_at` set.

That flag is not decoration. `findLinkCandidateByEmail` excludes flagged rows so
that an upstream asserting `<somebody's subject>@d2e.local` as verified cannot
claim the account behind it — nobody owns that domain, so "verified" there means
nothing. Unflagged, those 66 rows are candidates again. Demonstrated on the
rehearsed data, with a second enabled provider and `auto_provision` off:

```
A migrated user carrying a synthesised address: id=0l66mixo4fqp email=br…@d2e.local
  is_placeholder_email = false, so findLinkCandidateByEmail does not exclude it.
  a DIFFERENT upstream asserting that address as verified resolves to:
    {"action":"link","userId":"0l66mixo4fqp"}
  => LINK onto the migrated user's account.
  the same question against a row with is_placeholder_email = true:
    {"action":"refuse","reason":"no_account"}
```

The contrast is the whole finding: the guard works, and these rows are outside
it. Nothing here is a defect in V17 or in the link route — both did exactly what
they say. It is a consequence of a caller synthesising addresses under trex's
placeholder domain without saying they are synthetic.

Everything above is the rehearsal as it ran, and the counts and transcripts are
left exactly as recorded. What follows is what changed in answer to it.

## 3.1 What was done about it

**trex now flags by domain, so neither mitigation is needed and neither was
taken.** The rehearsal proposed moving the migration's address domain off
`d2e.local`, or teaching the link API to mark an address synthetic. Both were
rejected in favour of the rule that does not depend on the caller: an address
whose domain is `PLACEHOLDER_EMAIL_DOMAIN` is synthetic by construction,
whoever supplied it, because that domain is what a migration with no address to
give mints into.

`isEngineAddressable`'s neighbour `isPlaceholderAddress`
(`auth/engine-address.ts`) is that rule, and every route that writes a login
address asks it. A row created on the domain gets `is_placeholder_email = true`,
`emailVerified = false` and a NULL `email_confirmed_at` — identical to one trex
synthesised itself, which is the property that matters:

| writer | a `@d2e.local` address is… |
|---|---|
| `PUT /federation/links` (this rehearsal's route) | flagged |
| federated sign-in, auto-provision | flagged |
| `POST /auth/v1/admin/users` | flagged |
| MCP `user-create` | flagged |
| `PUT /auth/v1/user` | flagged, derived on every update rather than cleared |
| **V17 itself** | flagged — it now sweeps the whole population, not only the rows it mints |
| `POST /auth/v1/signup` | **not** flagged, deliberately |

`/signup` is excluded on purpose: it creates an account somebody registers for
themselves, the bootstrap administrator included, and `emailVerified = false`
would be the wrong outcome there. It is also the one route where the flag buys
nothing, because `user_email_lower_key` stops a registration taking an address a
row already holds.

V17's sweep is the one that matters for **this** installation, and it was added
after this rehearsal because this rehearsal could not have found it: the
rehearsal ran V17 first against a `trexdb` holding one user, then drove the link
API. An installation that has already run d2e's IdP migration meets V17 in the
opposite order, with its users already holding `<username>@d2e.local` as
ordinary addresses — and the backfill, which only flags what it mints
(`WHERE u.email IS NULL`), passes straight over them. The sweep beside V17's
addressability check closes that.

Re-running this rehearsal's driver shape against the fixed code, at the same
proportions, on both Postgres 15.19 and 17.10:

```
pass 1: created=69 already_linked=0 other=0
pass 2 cumulative: created=69 already_linked=69 other=0
rows: {"total":69,"flagged":66,"verified":3,"misflagged":0,"unflagged_placeholder":0}
account links: 69
```

66 flagged where 0 were before, 3 genuine addresses untouched, and the 69/69
link behaviour — including idempotence on the second pass — unchanged. Flagging
cannot break the migration because `linkIdentity` resolves by
`(providerId, accountId)` first and by its own unfiltered address lookup second;
only the *sign-in* path excludes flagged rows, which is the protection being
restored.

**One thing the domain rule does not do**, recorded because §5 used to imply
otherwise: it does not make the addresses real. "66 of our users have a
confirmed address" is still false — they now say so, which is the whole point,
and anything that mails users or lists addresses must branch on
`is_placeholder_email`. Note also that `d2e.local` is **not** an unroutable
reserved domain: it is d2e's own `TLS__INTERNAL__DOMAIN`, and its services
resolve under it. The safety is the flag and the provider domain allowlist, not
unreachability.

## 4. The two refusals, on real data

Both were driven by advancing a second copy of the same dump to V15, planting
the population a migration would have created against a pre-V17 trex, and then
running the migration for real.

**V16 — two accounts differing only by case.** There is not one such pair
anywhere in the real data, so one was planted, as a case variant of a migrated
address:

```
ERROR:  trexdb."user" holds accounts that differ only by the case of their email address: br…@d2e.local
HINT:  Two accounts sharing one address cannot both keep it. For each address above, decide
       which account is the real one, then give the other a different address or delete it
       outright (soft-deleting is not enough: a deleted row still holds the address). Re-run
       the migration after.
```

Rollback is complete: `user_email_lower_key` is absent afterwards. Removing the
planted row and re-running V16 and V17 then applies clean, with 0 unserveable
addresses and 0 placeholders — the ordinary outcome for an installation that has
already been federated before it upgrades.

**V17 — an address the engine will not accept.** Modelled on the realistic
cause: the migration's user-address domain set to a single label, which nothing
validates on the way in.

```
ERROR:  trexdb."user" holds addresses the authentication engine will not accept:
        <64 addresses, comma-separated on one unwrapped line, 1437 characters>
HINT:  Better Auth validates the address before it looks a user up, so each account above
       would be unable to sign in after this migration, with no error but "invalid
       credentials". Give each one an address with a dotted domain
       (someone@example.com, not someone@localhost), or delete the account if it is
       defunct — soft-deleting is not enough, a deleted row still holds the address.
       Re-run the migration after.
```

Rollback is complete: no `account` rows, no `is_placeholder_email` column, no
`session."impersonatedBy"`, `user.email` still nullable, and
`refinery_schema_history` still at 11 rows. trexsql logs a failed migration and
carries on serving, so this costs a startup warning and a retry rather than an
outage — but nobody can sign in until it is resolved, and the message is 1437
characters on one line in a boot log.

## 5. What an operator must do before upgrading

1. **Take the snapshot.** There is no fallback engine; recovery is a restore
   plus the previous image.
2. **Check the IdP migration's user-address domain.** It must be dotted, or V17
   refuses the whole upgrade and names every affected account. `d2e.local` is
   fine and needs no avoiding — §3.1 — since every route and V17 itself now flag
   an address on it. Only the dotted requirement is load-bearing.
3. **Look for directory entries whose username is not usable in an address** — a
   space, an accent, any non-ASCII character, a leading, trailing or doubled dot.
   Each one is a 422 from the link API and a user who is not migrated. Better to
   find them in the directory beforehand than in a migration report afterwards.
4. **Look for two accounts whose addresses differ only by case.** V16 refuses
   the upgrade and will not choose a survivor.
5. **Expect most users to carry a synthesised address.** On the installation
   rehearsed here, 66 of 69 do. `is_placeholder_email` now tells you which —
   after V17, for rows that predate it, and at creation for everything after —
   so anything that mails a user or shows an address should branch on that
   column rather than on the domain.

### What they would see if they did not

* A misconfigured domain: the boot log carries one 1437-character `ERROR` line
  naming 64 accounts, the schema stays at V12, and the release does not land.
* A case-colliding pair: the same, naming the address, at V16.
* An unusable username: a 422 per identity during the IdP migration, recorded as
  a skip with a reason, the rest of the migration unaffected — and that person
  simply not migrated.
* Nothing at all, and later: a user whose password is correct, whose credential
  row is correct, and who is told only that their credentials are invalid. That
  is the outcome every guard above exists to prevent, and none of them can
  prevent it once the row is written.

One further thing V17 now repairs, found after this rehearsal and not visible in
it: a row whose `trexdb.account` credential disagrees with `user.password_hash`.
develop's `PUT /user` writes the account row before the user row, so a request
that changed both password and address and collided on the unique index left the
credential rotated by a request that answered 500. The invariant table in §2
reads 0 for this because the rehearsed installation never hit that path — but
the rows exist in installations that have. V17's account backfill no longer
skips a non-NULL credential, so it sets them back to `user.password_hash`, which
is authoritative before the cutover.
