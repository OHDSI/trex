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

## 0b. How the rehearsal image was actually made

```
ghcr.io/ohdsi/trexsql:prod-sha-04ec21ad…      (pulled)
  + rm -rf /usr/src/core
  + core/server,core/event package.json + npm install --omit=dev
  + COPY core/                                (this branch, 048cefb1)
  + trex bundle core/server/index.ts core/server/index.eszip
  + trex bundle core/event/index.ts  core/event/index.eszip
  = ghcr.io/ohdsi/trexsql:phase2-local
```

then d2e's own layer, unchanged, on top of it:

```
docker compose -f docker-compose.yml --profile demodb -f docker-compose-local.yml \
  --env-file .env.local build trex     # with TREXSQL_REF=phase2-local
  = d2e-trex:phase2-local              # named by TREX_IMAGE
```

Both new keys go in `.env.local` only; **nothing in the d2e tree was changed to
make this work**, which is itself the evidence for the release-engineering gap
in §0: the only two ways to get this branch into a d2e stack are to publish a
trexsql image or to override `TREXSQL_REF` by hand.

`trex bundle` re-bundled cleanly in-image against the pinned base (core/server
and core/event eszips both produced, the latter 307MB), so the 95-commit core
overlay is self-consistent with that base's extensions and binary.

**Two build facts worth keeping:**

1. `WITH_R` is passed as a build arg by `docker-compose-local.yml` with a comment
   saying it "must also bake R or it silently reverts to an R-less image", but
   `services/trex/Dockerfile.v2` **never declares or reads `WITH_R`** (`grep
   WITH_R` over its 164 lines returns nothing). The comment describes a
   Dockerfile that no longer exists; the arg is dead.
2. The `PLUGINS_FROM_REGISTRY` step is the build's whole cost and it is fragile:
   `@data2evidence/d2e-ui` alone is a **273.8 MB** npm tarball (600.7 MB
   unpacked, 12 769 files) and `npm pack` of it inside the build retried and
   failed repeatedly while the host was otherwise busy — `fetch-external-plugins.sh`
   runs under `set -eu`, so after 5 attempts it takes the whole image build with
   it. This rehearsal trimmed `PLUGINS_FROM_REGISTRY` to `@data2evidence/d2e-ui`;
   the flow/fhir/sibyl plugins are not needed to exercise sign-in and are
   recorded here as deliberately absent.
