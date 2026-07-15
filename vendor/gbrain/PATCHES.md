# Vendored gbrain patches

Upstream: https://github.com/garrytan/gbrain.git @ 5008b28 (v0.42.59.0)

These patches make gbrain multi-tenant (schema-per-brain in one Postgres DB).
Re-apply each on upgrade. Never edit `src/core/schema-embedded.ts` (generated)
or `src/core/migrate.ts` migration bodies (checksum-verified).

## P1 — schema-safe triggers (src/schema.sql)
`bump_page_generation_clock_fn`, `update_page_search_vector`, and
`bump_page_generation_fn` had pinned `SET search_path = pg_catalog, public`
yet referenced schema-scoped objects (`page_generation_clock_seq`,
`timeline_entries`, `pages`). Retemplated so the apply layer injects the
deploy schema. See Task 2.

`bump_page_generation_fn` was originally MISSED by this patch and found in
the first live worker e2e (2026-07-15): its `SELECT MAX(generation) FROM
pages` failed with `relation "pages" does not exist` on EVERY put_page into
a tenant schema once its trigger attached — but only after a SECOND
provision replay, because the first (partial) replay had not reached the
CREATE TRIGGER statement, which is how it slipped past the initial
verification. `update_chunk_search_vector` and `notify_minion_job_change`
keep the `pg_catalog, public` pin deliberately — their bodies only touch
NEW/OLD and pg_catalog builtins, no schema-scoped objects.

## P2 — schema templating + schema-aware provisioning (src/core/postgres-engine.ts)
`getPostgresSchema(dims, model, schema?)`, `initSchema(schema?)`,
`provisionSchema(name)`, `withSchema(schema, fn)`. See Tasks 3, 5.

## P3 — verify follows search_path (src/core/schema-verify.ts)
Hardcoded `table_schema = 'public'` → `current_schema()`. See Task 4.

## P4 — per-request tenancy (src/mcp/dispatch.ts, src/mcp/http-transport.ts, src/core/multi-tenant.ts)
Brain name from `/memory/<name>/mcp`; `schema` threaded through DispatchOpts +
OperationContext; dispatch runs inside `withSchema`. See Tasks 5, 6.

## P5 — Deno-compat (src/core/chunkers/code.ts, src/version.ts, src/core/content-sanity-literals.ts, src/core/markdown.ts)
Makes the memory-path core (`postgres-engine.ts` → `mcp/dispatch.ts` →
`operations.ts`'s `put_page`/`query`) load natively under `deno`, with no
absolute-path import-map redirection tricks, so it can be hosted as a trex
Deno edge worker. Behavior-preserving; Bun tolerates every form below (all 4
files pass `bun test`; see H0 spike report for the regression run).

1. **`src/core/chunkers/code.ts`** — 31 static
   `import X from '....wasm' with { type: 'file' }` statements (tree-sitter
   grammar assets). Bun's bundler resolves `type: 'file'` to a path string;
   Deno rejects the import attribute outright. Replaced each with
   `const X = new URL('<relative-wasm-path>', import.meta.url).pathname;` —
   a plain path string constant, same variable name, same target asset,
   resolved relative to the module's own URL (works identically under Bun
   and Deno; the pattern is already used elsewhere in this codebase, e.g.
   `src/commands/schema.ts`). `Parser.init()` still resolves these paths
   correctly when code ingestion is exercised (verified: `bun test
   test/chunkers/code.test.ts` — 62/62 pass, unchanged).

2. **`src/version.ts`** — `import pkg from '../package.json';` had no
   import attribute. Deno requires `with { type: 'json' }` on JSON imports;
   Bun infers it either way. Added the attribute (`import pkg from
   '../package.json' with { type: 'json' };`) — no fallback needed, Bun
   accepts the attribute unchanged (verified under both runtimes).

3. **`src/core/content-sanity-literals.ts`** — `resolveLiteralsPath()` did
   `const { gbrainPath } = require('./config.ts');` inside the function
   body, reached on every `put_page` via the content-sanity gate. Bun's
   `require()` can synchronously load an ESM/TS module (a Bun-only
   require/import blur); Deno defines no global `require` at all, so this
   threw `ReferenceError: require is not defined`. Promoted to a static
   top-level `import { gbrainPath } from './config.ts';` — functionally
   identical; the original comment says the laziness was only to avoid
   loading `config.ts` for pure-assessor callers, not for correctness.

4. **`src/core/markdown.ts`** — `import { safeLoad as yamlSafeLoad } from
   'js-yaml';`. js-yaml@3.x's CJS entry is `module.exports =
   require('./lib/js-yaml.js')` (whole-module re-export indirection);
   Deno's npm CJS→ESM named-export analysis doesn't surface `safeLoad`
   through that indirection (only the default import works). Switched to a
   default import + explicit destructure: `import jsYaml from 'js-yaml';
   const yamlSafeLoad = (jsYaml as any).safeLoad ?? (jsYaml as
   any).default?.safeLoad;`. This lets a Deno import map map bare `js-yaml`
   straight to `npm:js-yaml@^3.14.2` with no shim file. Grepped for other
   named imports from `'js-yaml'` on the memory path — `markdown.ts` is the
   only site.

**Deferred (not touched by P5):** ~13 other `require('./local-esm.ts')`
sites across the wider gbrain codebase (`contextual-retrieval-service.ts`,
`progress.ts`, `model-config.ts`, `pglite-engine.ts`,
`cycle/synthesize.ts`, `search/embedding-column.ts` x2,
`skillpack/registry-client.ts`, plus a few `require()`-ing real node
builtins, which work fine under Deno's CJS interop). None of these fire on
the v1 memory path (keyword-only search, no embedding provider configured),
so they're out of scope here — flagged as latent risk if a future op
(e.g. an embedding-provider-configured `query`) needs them.

**Verification:** `bun test` on the affected suites (multi-tenant-isolation,
with-schema, get-postgres-schema, markdown*, content-sanity-literals,
content-sanity, import-file-content-sanity, chunker-version-gate,
chunkers/code, chunker-timeout, cycle-synthesize-chunker) — all pass, no
regressions. A `deno run` spike (`provisionSchema` → `put_page` → `query`
against a live Postgres test DB) against these in-tree files, using a
`deno.json` import map with NO file-redirection entries and `js-yaml`
mapped directly to `npm:js-yaml@^3.14.2`, completed end-to-end
("ALL STEPS SUCCEEDED"), proving the patches make gbrain Deno-native
without redirection shims.

**Known, accepted divergence — `bun build --compile` no longer embeds the
tree-sitter WASM assets (H0).** Patch 1 above replaces the 31
`import X from '....wasm' with { type: 'file' }` statements in
`src/core/chunkers/code.ts` with plain `new URL(...).pathname` string
constants. Upstream relies on the `with { type: 'file' }` import attribute
specifically so `bun build --compile` bundles each referenced WASM into the
compiled binary (see upstream's `docs/architecture/KEY_FILES.md` entry for
`src/assets/wasm/`); a plain `new URL(...).pathname` is just a path string at
both dev-time and compile-time, so **`bun build --compile` no longer embeds
the WASM assets into the binary** — the grammars would have to ship
alongside the binary as loose files instead. Upstream's CI guard
`scripts/check-wasm-embedded.sh` (invoked from `check:wasm` /
`scripts/ci-local.sh`) exists precisely to catch this class of regression
and **will flag a `bun build --compile` of this vendored tree**.

This is intentional and accepted here: trex never runs
`bun build --compile` against `vendor/gbrain`. trex hosts this vendored
gbrain core **from source**, loaded directly by a trex Deno edge-runtime
worker (`core/server/memory/gbrain-worker/`) — there is no compiled Bun
binary in the trex deployment path, so `check-wasm-embedded.sh`'s failure
mode never triggers in trex's own CI. Flagging this here so a future
maintainer who re-vendors/upgrades gbrain and reflexively runs
`bun run check:all` (which includes `check:wasm`) understands why it fails
and does not "fix" it by reverting patch 1 (which would break the Deno
hosting path this vendoring exists for). If gbrain is ever additionally
shipped via a compiled Bun binary in this repo, the WASM assets would need
to be copied alongside the binary explicitly (or patch 1 reverted for that
build target only).
