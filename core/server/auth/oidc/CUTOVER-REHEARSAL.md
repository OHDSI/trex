# Phase 2 cutover rehearsal — what a real stack said

Task 13. Everything here was **run**, not reasoned about. Where a check could
not be run, it says so and says why; nothing is recorded as passing that was not
observed passing.

Ran on: macOS (darwin/arm64), Docker Desktop 4.76.0, engine 29.5.2.

- trex worktree `/Users/ph/code/trex/.worktrees/better-auth-oauth`,
  branch `p-hoffmann/better-auth-oauth-provider`, at `048cefb1`.
- d2e worktree `/Users/ph/code/d2e-wt-logto-fed`,
  branch `p-hoffmann/logto-federation-migration`, at `cbf6c02fc`.

## 0. Getting an image to rehearse with — a finding in its own right

`npm run build -- -s trex` does **not** build trex. It builds d2e's own layer
(`services/trex/Dockerfile.v2`), which is `FROM ghcr.io/ohdsi/trexsql:${TREXSQL_REF}`
and explicitly does **not** vendor the core:

> NOTE: the core (main + event, with D2E_COMPAT) is NOT vendored — it is provided
> by the base trexsql image at /usr/src/core (index.eszip already bundled there).

So the code under test in this phase reaches a d2e stack only through a
**published trexsql image**. The two refs d2e pins today are both ancestors of
this branch and neither contains any of Phase 2:

| where | ref | relation to `p-hoffmann/better-auth-oauth-provider` |
|---|---|---|
| `Dockerfile.v2` default (lean/prod) | `prod-sha-04ec21ad…` (`04ec21ad` "Pre-link federated identities…") | ancestor, **95 commits behind** |
| `docker-compose-local.yml` (devx) | `sha-48a46626…` (`48a46626` "Renumber the federation migrations…") | ancestor, **99 commits behind** |

Verified further that the currently published `ghcr.io/ohdsi/d2e-trex:develop`
is older still — its `/usr/src/core/server/package.json` names **no**
`better-auth` at all and `/usr/src/core/server/auth/oidc/` still holds the
hand-rolled `router.ts`/`clients.ts`/`codes.ts`. Phase 1 is not in it either.

**Consequence for the real cutover, and it is not in any task so far:** the
release cannot be "d2e branch + trex branch". It is "d2e branch + a **published
trexsql image built from the trex branch** + a `TREXSQL_REF` bump in
`services/trex/Dockerfile.v2` **and** in `docker-compose-local.yml`". Task 12's
deployment-ordering note names two things that must ship together; there are
three, and the third is a version-controlled pin in d2e that nothing in Tasks
1–12 touches.

The whole diff from either pinned base to this branch is confined to `core/`
(plus `plugins/docs` and one workflow) — no Rust, no `src/` — which is what
makes the rehearsal possible at all: the base image can be overlaid with this
branch's `core/` and re-bundled in-image with `trex bundle`, exactly as the trex
`Dockerfile` prod stage does.

(Progress log follows; appended as each check completed.)
