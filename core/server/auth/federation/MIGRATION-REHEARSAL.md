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
