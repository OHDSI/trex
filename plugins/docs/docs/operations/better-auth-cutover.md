---
sidebar_position: 2
---

# Upgrading to the Better Auth Engine

`V17__better_auth_canonical_tables.sql` hands `trexdb.user`, `session`,
`account` and `verification` to Better Auth, and the `/trex/auth/v1` router
stops verifying passwords itself. See
[Concepts → Auth & Authorization](../concepts/auth-model) for what the engine
owns and why the GoTrue-shaped router still exists in front of it.

This page is the operator's half: the three things that can go wrong on the way
through, and what to do about each.

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
*after* five mutating statements: the credential move into `trexdb.account`
(`V17:13`, `V17:22`), the two `ALTER TABLE`s that add `session."impersonatedBy"`
and `user.is_placeholder_email` (`V17:31`, `V17:38`), and the placeholder
backfill block (`V17:41`). What discards them is the runner submitting the file
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
core/schema/V17__better_auth_canonical_tables.sql` runs each statement in its
own implicit transaction, so a refusal would leave the five statements above it
committed. Pass `--single-transaction`:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
  -f core/schema/V17__better_auth_canonical_tables.sql
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
placeholder domain, and a row created on it is normally flagged
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
route where leaving the flag off costs nothing: `user_email_lower_key` means an
attacker cannot register an address a row already holds, and
`synthesisePlaceholderEmail` falls back to `<id>@d2e.local` when a slug is
taken, so a hostile upstream asserting a self-registered `@d2e.local` address
can only ever link onto the attacker's own row.

**So: if you bootstrap with `IDP__INITIAL_USER__DOMAIN=d2e.local`, the initial
administrator is created verified and unflagged.** That is intended. Everything
migrated afterwards, through any of the other five routes, is flagged. Only the
dotted-domain requirement is load-bearing for the 422.

## The rolling-deploy constraint

`/change-password` and sign-in trust different columns, and during a rolling
deploy they can briefly disagree.

- **Sign-in** (`POST /token`, password grant) *verifies* against
  `trexdb.account.password` and nothing else. That is the engine's column. It
  does read `user.password_hash` on the way past, in `adoptLegacyCredential`,
  but only to fill an account row that has no credential yet — the copy is
  guarded by `WHERE account.password IS NULL`, so it can never overwrite a
  current credential with a stale one, and the conclusion below holds.
- **`/change-password`** resolves `trexdb.user.password_hash` first and only
  falls back to `account.password`. That is the pre-V17 column, and the wire
  contract pins it, because it is the column a node that has not yet restarted
  still writes.

They disagree in **one direction only**: `account.password` current,
`user.password_hash` stale. Exactly one thing produces it — a node still running
code from before `5a48ab98` serving a `PUT /user` that carried both a password
and an address that collided. That code wrote the credential first and the user
row second, so the row update failed and the new password landed on
`account.password` alone.

**The consequence is not a lockout, it is the opposite.** The superseded
password goes on authorizing a password change while the working one is refused
there. A password the account holder believes they replaced can still be
presented to `/change-password`.

**It heals on the next successful password change or admin reset** — both write
the two columns in one transaction — and the window needs a pre-`5a48ab98` node
still serving traffic. So:

- Do not run a pre-`5a48ab98` node alongside a post-V17 one for longer than the
  deploy takes. A blue/green or a rolling restart that completes is fine; a
  half-finished rollout left in place overnight is not.
- If one was left running, this closes the window for the whole population:

  ```sql
  UPDATE trexdb."user" u
     SET password_hash = a.password, "updatedAt" = NOW()
    FROM trexdb.account a
   WHERE a."userId" = u.id
     AND a."providerId" = 'credential'
     -- NOT NULL is load-bearing: an account row with no credential yet is a
     -- user whose password still lives only on user.password_hash, and
     -- copying NULL over it would delete their password.
     AND a.password IS NOT NULL
     AND a.password IS DISTINCT FROM u.password_hash;
  ```

Phase 2 must revisit this if Better Auth's own change-password or reset
endpoints are ever mounted: those write `account.password` alone, at which point
the split stops being a transitional artefact of this rollout and becomes
permanent. The reasoning lives on `storedPasswordHash` in
`core/server/auth/auth-router.ts`.
