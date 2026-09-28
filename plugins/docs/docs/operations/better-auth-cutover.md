---
sidebar_position: 2
---

# Upgrading to the Better Auth Engine

`V17__better_auth.sql` hands `trexdb.user`, `session`,
`account` and `verification` to Better Auth, and the `/trex/auth/v1` router
stops verifying passwords itself. See
[Concepts → Auth & Authorization](../concepts/auth-model) for what the engine
owns and why the GoTrue-shaped router still exists in front of it.

This page is the operator's half: what can go wrong on the way through, and
what to do about each.

## V17 can refuse to apply

The engine validates an address *before* it looks a user up, on every
credential endpoint, and its rule requires a dotted domain. `V1` imposed no
format at all, so an installation can be holding `ops@localhost` or
`admin@internal` quite legitimately. After the cutover those accounts cannot
sign in — with the right password, the right credential row, and no error but
`invalid credentials`.

So V17 refuses rather than creating that state:

```
ERROR:  trexdb."user" holds addresses the authentication engine will not accept:
        admin@internal, ops@localhost
HINT:   Better Auth validates the address before it looks a user up, so each
        account above would be unable to sign in after this migration, with no
        error but "invalid credentials". Give each one an address with a dotted
        domain (someone@example.com, not someone@localhost), or delete the
        account if it is defunct — soft-deleting is not enough, a deleted row
        still holds the address. Re-run the migration after.
```

**The refusal leaves nothing behind — if the whole file is one transaction.**
V17 contains no explicit `BEGIN`/`COMMIT` of its own, and the check above comes
*after* five mutating statements: the two halves of the credential move into
`trexdb.account` (the `INSERT ... SELECT` and the `UPDATE ... SET password`),
the two `ALTER TABLE`s that add `session."impersonatedBy"` and
`user.is_placeholder_email`, and the placeholder backfill `DO` block. They are
named rather than cited by line, because line numbers into a migration drift
every time a comment is added to it. What discards them is the runner submitting the file
as one simple query, leaving atomicity to Postgres's implicit transaction over
it: `execute_migrations_in_schema`'s Postgres branch
(`plugins/migration/src/lib.rs:829-845`) issues no `BEGIN` — see its comment,
"Postgres handles transactions internally via postgres_execute". So a V17 that
aborts in normal operation has applied none of itself and written no history
row.

> Do not "correct" that to the explicit `BEGIN`/`COMMIT` at `lib.rs:388-406`.
> That is the sibling function `execute_migrations`, reached from
> `trex_migration_run`; `core/schema` goes through `trex_migration_run_schema`
> and never takes it. Two reviews have now confused the pair, which is why the
> line numbers are here.

**Re-running it by hand does not get that for free.** `psql -f
core/schema/V17__better_auth.sql` runs each statement in its
own implicit transaction, so a refusal would leave the five statements above it
committed. Pass `--single-transaction`:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f core/schema/V17__better_auth.sql
```

Fix the addresses and re-run.

**The remedy, per address named:**

- Give the account a real address with a dotted domain. This is the right answer
  whenever somebody still uses it; an address is an identity, so there is no
  safe automatic choice and V17 deliberately makes none.
- Or delete the account, if it is defunct.

**Soft-deleting does not free the address.** `trexdb.user` is unique on
`lower(email)` across deleted rows too, so setting `"deletedAt"` leaves the row
holding the address: V17 still names it, and a new account cannot take it. To
free it, either `DELETE` the row or rewrite its `email` to something the engine
accepts (`ops+retired-2026@example.com` keeps the row auditable and frees
nothing anybody wants).

Every route trex serves that creates or changes a login address asks the same
rule, so an installation cannot walk back into the state V17 refused through
one of them:

| Door | Answer |
|------|--------|
| `POST /signup` | `422 signup_invalid` |
| `POST /admin/users` | `422 validation_failed` |
| `PUT /user` | `422 validation_failed` |
| `PUT /federation/links` (admin pre-link) | `422 unaddressable_email`, naming the address |
| Federated sign-in with `auto_provision` | refused with the code `upstream_email_unusable` — a 302 back to the login page carrying `?error=…`, or a `403 access_denied` where no login URL is configured |
| MCP tool `user-create` | tool error naming the address, before either insert |

**This is a claim about the routes trex serves, not about the table.**
PostGraphile mounts `trexdb`, `trexdb."user"` carries no `@omit`, and `V3`
leaves `service_role` with `GRANT ALL` on it — so a service-role token can
`UPDATE` the address directly, and so can anyone with `psql`. That is not a gap
to close; it is what `service_role` means. V17 is what checks the *table*, over
the whole population, at the one moment trex can still refuse to proceed. If
something outside trex writes addresses into `trexdb."user"`, it owns this rule
itself.

The last three are the ones that matter after the deploy. `PUT /federation/links`
is what a bulk import drives, and it runs *after* V17, so it refuses per
identity and the import records the skip and keeps going. The federated
sign-in door is the only one reached with no administrator in the loop: an
upstream asserts the address itself (trex takes the `email` claim verbatim,
because it is an identifier and not trex's to rewrite), so an upstream
asserting `alice@localhost` at a provider with `auto_provision` on would
otherwise create the row V17 exists to prevent. That sign-in is refused
instead, and the user learns at once rather than through a support ticket. And
`user-create` is `POST /admin/users`' privilege tier by another route — an
admin API key over MCP — so it answers the same way.

## The configuration trap: a single-label domain

The rule above is exactly `zod`'s `z.email()`, which **requires a dot in the
domain**. `alice@localhost` is not a valid address to the engine;
`alice@localhost.local` is.

This bites at bootstrap, where the initial user's address is assembled from
configuration rather than typed. In d2e that is `IDP__INITIAL_USER__DOMAIN`:
set it to `localhost` and *every* user creation answers

```json
{ "error": "validation_failed", "error_description": "Email must be a valid address" }
```

with a 422 — not just the first one, and with nothing in the logs that points at
the variable. (`/signup` answers the same 422 under `signup_invalid`; the
federation link answers `unaddressable_email`.) Set it to a dotted domain
(`d2e.local`, `example.com`, your real mail domain) and the same requests
succeed.

**`d2e.local` is usable, with one exception you need to know about.** It is the
placeholder domain — chosen because it is what d2e's migration mints, not
because it is reserved or unroutable. d2e's own `TLS__INTERNAL__DOMAIN` is the
same string and its services resolve under it, so the safety comes from the flag
and from the provider's domain allowlist, never from the domain being
unreachable. A row created on it is normally flagged
`is_placeholder_email`, left `emailVerified = false` and given no
`email_confirmed_at` — which is what a migration filling a missing address with
`<username>@d2e.local` should produce. But that is true of five of the six
address-writing routes, not all six:

| Route | A `@d2e.local` address is… |
|-------|-----------------------------|
| `PUT /federation/links` (admin pre-link) | flagged |
| Federated sign-in / auto-provision | flagged |
| `POST /admin/users` | flagged |
| MCP `user-create` | flagged |
| `PUT /user` | flagged (derived from the new address, on every update) |
| **`POST /signup`** | **not flagged** — see below |

`/signup` is the deliberate exception. The account being created there is one
somebody is registering for themselves — including the bootstrap administrator
— and writing that row `emailVerified = false` would be the wrong outcome: the
first admin would land unverified on their own installation. It is also the one
route where leaving the flag off costs nothing: `user_email_lower_key` means a
registration cannot take an address a row already holds, and
`synthesisePlaceholderEmail` falls back to `<id>@d2e.local` when a slug is
taken, so a self-registered `@d2e.local` address cannot be used to reach
anybody else's row.

**That exception depends on both of those facts, and dies with either.** If a
mail path is ever added that reads `is_placeholder_email`, or the unique index
on `lower(email)` is relaxed, the reasoning above stops holding and `/signup`
has to be brought in line with the other five.

**What protects the migration path is a different mechanism**, worth naming
because the two are easy to conflate: an admin link request carrying a `userId`
is answered `409` when another row already holds the address
(`resolveRequestedUser`), so a pre-link of `<username>@d2e.local` cannot be
pointed at a row a self-registration squatted. That argument is specific to a
request with a `userId`. A `PUT /federation/links` with `userId: null` resolves
by address instead and links to whichever row holds it — so it would attach the
migrated identity to the squatter's account, and this reasoning would not cover
it. Migrations that pin the upstream id, which is what d2e's does, are the case
the 409 protects.

**It does not claim that squatting is harmless.** Registering an address before
its owner arrives puts that person's federated identity inside the squatter's
account, which is a real harm rather than the absence of one. But that is
`decideLink`'s posture on *every* domain — an upstream asserting any verified
address links to the row holding it, and the provider's
`emailDomainAllowlist` is the intended control — so `d2e.local` is neither more
nor less exposed than `example.com`. The flag is about what a row *means*; the
squat is a separate question with a separate answer.

**So, for `IDP__INITIAL_USER__DOMAIN=d2e.local`, it depends which you are
doing:**

- **A fresh install.** `/signup` creates the initial administrator verified and
  unflagged, and that is intended — the first admin should not land unverified
  on their own installation.
- **An upgrade.** V17's sweep runs over the population that already exists, and
  it does not ask which route wrote a row. An administrator already holding
  `admin@d2e.local` is flagged and set unverified like everybody else on that
  domain. The account still works — the flag and `emailVerified` govern linking
  and mail, not sign-in — but it will not look the way a freshly bootstrapped
  one does.

Everything migrated afterwards, through any of the other five routes, is
flagged. Only the dotted-domain requirement is load-bearing for the 422.

## `email_verified` changes for most of a migrated installation

**Read this before upgrading an installation whose users came from an IdP
migration.** It is the one change on this page with an effect outside trex, and
that effect has not been verified.

V17's placeholder sweep sets `emailVerified = false` on every row whose address
is on the placeholder domain. Those rows were `emailVerified = true` before —
that is the defect it fixes, since nobody ever proved those addresses. But
`emailVerified` is what trex's OIDC provider emits as the `email_verified`
claim, in the id_token (`auth/oidc/claims.ts`) and from `/userinfo`
(`auth/oidc/router.ts`). So:

> **After the upgrade, those users' id_tokens carry `email_verified: false`
> where they previously carried `true`.**

**How many.** On the installation rehearsed for this work, **66 of 69 users** —
everyone whose directory entry had no address of its own. Expect the proportion
to be similar wherever the IdP migration filled addresses in, and near zero
where every user had a real one.

**What we have not checked.** Nothing in this repository consumes the claim, so
nothing here can tell you what the relying parties do with it. **The effect on
WebAPI and Atlas is unverified.** A relying party is *required* to treat an
unverified address as not an identifier, and that requirement is exactly the
protection the flag provides — but a relying party that keys on `email` and
ignores `email_verified` will not notice, while one that refuses an unverified
address may start rejecting sign-ins that worked the day before. Both are
plausible and neither has been tested.

**What to do.** Before upgrading a production installation, check how each
relying party treats `email_verified: false` — whether it gates on it, logs it,
or ignores it — on a staging copy rather than in production. If one of them
gates on it, that is a change to make on its side before this lands, not after.

**Why the claim is not simply left alone.** `emailVerified = true` on a
synthesised address is a false statement: it says somebody proved control of a
mailbox that does not belong to them and in most cases does not exist. Emitting
it keeps a relying party that trusts the claim linking accounts on an address
nobody owns, which is the account-takeover this whole area exists to prevent.
The claim going false is the fix, not a side effect of it.

## The two password columns

`trexdb.account.password` (the row with `providerId = 'credential'`) is the
only password column trex writes. `trexdb.user.password_hash` is legacy: it is
never written by current code, only read, and only as a fallback —

- **Sign-in** (`POST /token`, password grant) verifies against
  `account.password`. If that column is `NULL` and a legacy
  `user.password_hash` exists, `adoptLegacyCredential` copies it into
  `account.password` — guarded by `WHERE account.password IS NULL`, so it can
  never overwrite a current credential with a stale one.
- **`/change-password`** (`storedPasswordHash`) reads `account.password`
  first and falls back to `user.password_hash` only when the former is
  `NULL`.

`/signup` and `POST /admin/users` create the account row through the engine
directly, with no legacy hash to clear. Every route that changes an *existing*
user's password (`PUT /user`, `/change-password`, `PUT /admin/users/:id`)
writes `account.password` and clears `user.password_hash` to `NULL` in the
same statement — so a row can only ever fall back once, and the two columns
cannot re-diverge after that.

V17's one-time backfill already reconciled rows where the two columns had
drifted apart before the cutover; see that migration for the repair query.
`user.password_hash` is now a strictly-shrinking read-only fallback. A
follow-up migration (V23) will drop it once no row still depends on it. The
reasoning lives on `storedPasswordHash` and `adoptLegacyCredential` in
`core/server/auth/auth-router.ts`.
