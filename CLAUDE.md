# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git workflow

- I will handle all git commits myself. Do not run `git commit` (or `git add` followed by a commit). Leave changes staged or unstaged for me to review and commit.

## Repository shape

Trex is a self-hosted, Supabase-wire-compatible backend that embeds a DuckDB-fork analytical engine. The repo is a polyglot monorepo:

- `src/` — Rust binary (`trex`) and `cdylib` (`trexsql_engine`). The binary in `src/main.rs` is a thin loader: it opens DuckDB (via the forked `trexsql-rs` `duckdb` crate, pinned in `Cargo.toml`), `LOAD`s every `*.trex` / `*.duckdb_extension` from `EXTENSION_DIR` (with `pool.trex` forced to load first because other extensions depend on its shared connection pool), `ATTACH`es the Postgres `_config` database from `DATABASE_URL`, runs SQL migrations from `SCHEMA_DIR` via the `migration` extension, and then starts services declared in `SWARM_CONFIG` (re-runs after all extensions load — `db.trex`'s own startup pass runs too early to find `trexas`/`pgwire`). With `--check` it exits non-zero if any extension fails to load.
- `plugins/<name>/` — DuckDB C-API extensions, each producing a `.trex` artifact. Most are Rust or C++ and follow a uniform Makefile pattern (see "Build commands"). They are also npm-published as `@trex/<name>` so that the runtime image installs them via `npm install` and `find node_modules/@trex -name "*.trex"` collects them into `/usr/lib/trexsql/extensions`.
- `core/` — Deno/TypeScript control plane that runs **inside** the `trexas` extension's embedded runtime (not as a separate process). `core/server` is the Express + PostGraphile + Better Auth + plugin-routing server (entrypoint `core/server/index.ts`); `core/event` is the event worker; `core/schema/V*.sql` is the Flyway-style migration set executed at boot by the `migration` extension.
- `plugins/runtime/` — Rust extension `trexas` that hosts the Deno runtime which runs `core/server` and the function workers. `core/` and `plugins/runtime/` are the two members of the top-level `deno.json` workspace.
- `plugins/web/`, `plugins/notebook/`, `plugins/docs/` — Vite/React frontends and a Docusaurus docs site. They are loaded by the plugin scanner via the `trex.ui.routes` field in their `package.json`.
- `plugins/storage/`, `plugins/cli/`, `plugins/pg-meta/` — submodule forks of Supabase services. Submodules also include `plugins/atlas/circe-be`, `plugins/ai/llama.cpp`, `plugins/runtime/trex-runtime`, and `plugins/extension-ci-tools` (provides the shared Makefile fragments). **Always clone with `--recurse-submodules`.**
- `integration-tests/` — Python pytest suite that drives a real `trex` binary against built extensions; this is the primary cross-extension test harness.
- `docker/`, `Dockerfile`, `docker-compose*.yml` — multi-stage build that compiles the Rust binary, builds the three frontends in parallel, downloads `libtrexsql.so` and prebuilt DuckDB extensions, then assembles a Node 22 runtime image. Note: the runtime image **rewrites `deno.json`** to drop the `workspace` key — Deno ≥2.7 refuses to bootstrap config files inside a workspace tree whose members aren't declared, which would break function-worker plugins loaded from `/usr/src/plugins-dev`. Keep the workspace key in the repo root.

## Build commands

Most extensions share the same Makefile (delegating to `plugins/extension-ci-tools/makefiles/c_api_extensions/`):

```bash
make configure      # one-time: Python venv, platform detection, version stamp
make debug          # debug build → build/debug/extension/<name>/<name>.trex
make release        # release build → build/release/extension/<name>/<name>.trex
make test_debug     # extension's own unit tests
make clean          # remove build/
make clean_all      # also remove configure artifacts
```

Top-level builds:

```bash
cargo build --release                         # build trex binary + libtrexsql_engine
docker compose -f docker-compose.dev.yml build trex   # rebuild runtime image with live source mounts
docker compose up -d                          # postgres + trex + postgrest, default creds
```

Frontends (run inside the plugin dir):

```bash
npm install && npm run build   # plugins/web, plugins/notebook, plugins/docs
npm run dev                    # vite dev server (web, notebook)
npm run lint                   # eslint (web, notebook)
```

## Integration tests

`integration-tests/` is the cross-extension harness — most plugin-vs-plugin behavior is verified here, not in extension-local tests. The tests assume each extension has been built **in debug mode** at its conventional path (e.g. `plugins/db/build/debug/extension/db/db.trex`); the Makefile's `check-*` targets enforce this and print the build command to run if missing.

```bash
cd integration-tests
make configure                          # creates venv, installs duckdb==1.4.4, pytest, psycopg2-binary
make test                               # tier1 + tier2 + tier3 + pgwire smoke (requires db, pgwire)
make test-tier1                         # single-node
make test-tier4 / test-tier5 / ...      # cross-node joins, workload mgmt, ballista, shuffle, partitioning
make test-fhir / test-atlas / test-ai   # domain extensions (each requires the matching extension built)
make hana-up / pg-trex-up               # bring up auxiliary DBs needed by some test files
SWARM_BROADCAST_THRESHOLD=0 ./venv/bin/pytest -v test_tier7_shuffle.py   # tier7 needs this env override
```

To run a single test: `./venv/bin/pytest -v path/to/test_xyz.py::test_name`. The `check-<name>` targets in `integration-tests/Makefile` are the source of truth for which extension build outputs each test depends on.

## Core schema migrations

`core/schema/V*__*.sql` files are run by the `migration` extension at trex startup, using `SCHEMA_DIR` (defaults to `/usr/src/core/schema` in the image). To add a schema change, drop a new `V{n+1}__description.sql`; do not edit existing files (Flyway-style versioning — applied versions are tracked in the `_config` Postgres).

## Things that surprise people

- `deno.json` workspace at the repo root vs the runtime image: the build strips `"workspace"` from the runtime `deno.json` on purpose — see Dockerfile comment around line 87. Don't "fix" this by aligning them.
- Extension load order: `pool.trex` must load first. `src/main.rs` enforces this with an explicit sort; if you add an extension that other extensions consume at load time, make it follow the same pattern rather than relying on filesystem order.
- `SWARM_CONFIG` is parsed twice: once inside `db.trex`'s init (which runs before `trexas`/`pgwire` are loaded and so silently fails to start them), then again in `src/main.rs::start_swarm_services` after the full extension set is loaded. The second pass is what actually starts the services.
- The dev compose (`docker-compose.dev.yml`) mounts source over the image so plugins reload from disk; the default `docker-compose.yml` uses the published `ghcr.io/p-hoffmann/trexsql:latest` image and has those mount lines commented out.
- `TREX_PRODUCTION_MODE=1` makes the entrypoint refuse to start when default placeholder secrets are still in `.env`. Random replacements printed at startup do **not** survive a container restart unless you persist them.
