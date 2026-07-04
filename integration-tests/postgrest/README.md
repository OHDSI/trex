# PostgREST differential conformance harness

Replays the request corpus of the upstream **PostgREST v12.2.3 hspec-wai test
suite** (plus a hand-built supabase-js v2 wire-shape corpus) against

* the real `postgrest/postgrest:v12.2.3` container (**oracle**), and
* the trex plugin (`plugins/postgrest/functions/app.ts` `handle()`) behind a
  thin Deno HTTP wrapper (`serve_plugin.ts` — *not* the full trex stack),

then diffs the normalized responses. Both sides share **one** fixture database
loaded with the verbatim upstream spec fixtures. In the default
`rollback-allow-override` config the data stays pristine and the runner only
resets sequences before every request (they advance even inside rolled-back
transactions); entries that COMMIT are replayed with the full-restore
machinery described below.

## Layout

| file | purpose |
| --- | --- |
| `fixtures/` | verbatim copies of `test/spec/fixtures/*.sql` from the PostgREST v12.2.3 source (load order in `load.sql`) |
| `initdb/zz-load-fixtures.sh` | creates the `postgrest_test_authenticator` login role, loads the fixtures exactly like upstream `nix/tools/withTools.nix`, and takes the pristine data-only `pg_dump` used by the full-restore machinery |
| `docker-compose.yml` | `db` (postgis/postgis:16-3.4, host port **15433**) + `oracle` (host port **13000**); the oracle's env comes from the generated `report/oracle.env` |
| `bucket_config.py` | single source of truth for the per-bucket PGRST_* env: `SpecHelper.hs` `baseCfg` + every `testCfg*` override, rendered per side (oracle env file / plugin process env) |
| `serve_plugin.ts` | maps `:13001/<path>` → `http://…/postgrest/<path>` (the worker expects its mount prefix; `/` maps to `/postgrest/` = OpenAPI root) and calls `handle()` |
| `extract_corpus.py` | parses `test/spec/Feature/**/*.hs` into `corpus/<Module>.jsonl` (+ `skipped.jsonl`, `supabase-js.jsonl`); RollbackSpec is hand-ported (see below) |
| `run_diff.py` | replays, normalizes, diffs; with `--orchestrate` it also restarts the oracle + plugin per bucket; writes `report/failures/<bucket>/<module>/<id>.diff` and `report/summary.json` |
| `exceptions.yaml` | `{entry-id: reason}` (or `{bucket:entry-id: reason}`) known/accepted diffs (reported separately, do not fail the run) |

## Workflow

```sh
cd integration-tests/postgrest

# 1. extract the corpus from a PostgREST v12.2.3 checkout
make corpus POSTGREST_SRC=/path/to/postgrest-12.2.3

# 2. database + oracle (DEFAULT/baseCfg env, generated into report/oracle.env)
make up

# 3. plugin server on the host (deno, background; log: report/serve_plugin.log)
make serve

# 4. replay the DEFAULT (baseCfg) bucket and diff
make diff                 # or: python3 run_diff.py --modules QuerySpec --limit 50

# 5. the FULL sweep: every config bucket (manages oracle + plugin itself)
make diff-variants        # = python3 run_diff.py --buckets ALL --orchestrate

# 6. teardown
make serve-stop down
```

`make serve` generates `report/plugin.env` from `bucket_config.py` (same
source of truth as the oracle's env) and runs:

```sh
set -a; . ./report/plugin.env; PLUGIN_PORT=13001; set +a
deno run --allow-net --allow-env --allow-read serve_plugin.ts
```

## What is compared

* status code
* headers (allowlist): `Content-Type` (params order-insensitive),
  `Content-Range`, `Content-Location`, `Preference-Applied`
  (order-insensitive), `Location`, `WWW-Authenticate`, `Allow`
  (order-insensitive). `Content-Location`/`Location` values that differ only
  in percent-encoding are flagged `encoding-only`.
* body: JSON deep-equal for json-ish content types (top-level arrays compared
  as multisets when the request has no `order=`), exact text otherwise
  (modulo one trailing newline). `Date`, `Server`, `Server-Timing`,
  transfer-encoding etc. are ignored.
* EXPLAIN bodies (`application/vnd.pgrst.plan+json` / `+text`, PlanSpec):
  runtime-dependent fields (`Execution Time`, `Planning Time`, `Actual *
  Time`, buffer hit/read counts, sort memory) are scrubbed on both sides
  before comparing — everything else (node types, costs, rows, output
  expressions, i.e. the *generated SQL*) must match exactly.

Request paths are percent-encoded identically for both sides before sending
(hspec-wai feeds raw bytes like `>`/`"`/space to the WAI app; real HTTP
parsers reject them in a request line).

## Config buckets

Each corpus entry is tagged with the config bucket its spec module runs under
in `test/spec/Main.hs` (see `MODULE_*`/`FUNCTION_CONFIG` maps in
`extract_corpus.py`). `bucket_config.py` ports every `SpecHelper.hs`
`testCfg*` function to PGRST_* env overrides on top of `baseCfg`. With
`run_diff.py --orchestrate` (or `make diff-variants`) the runner iterates the
buckets; per bucket it

1. regenerates `report/oracle.env` and `docker compose up -d
   --force-recreate --no-deps oracle`,
2. respawns `serve_plugin.ts` with the matching env (passed as a process env
   dict, so schema names with quotes/backslashes survive verbatim), and
3. replays that bucket's entries.

Replayed buckets: `DEFAULT`, `maxRows`, `aggregatesEnabled`, `planEnabled`
(also carries the `serverTiming` corpus — `testCfgServerTiming` is
`baseCfg { dbPlanEnabled = True }`, i.e. the identical env), `unicode`,
`extraSearchPath` (ExtraSearchPathSpec + PostGISSpec), `multipleSchema`,
`ignorePrivOpenApi`, `disabledOpenApi`, `securityOpenApi`, `rootSpec`,
`responseHeaders` (RpcPreRequestGucsSpec), `nonexistentSchema`, `noAnon`,
`noJwt`, `binaryJwt`, `audienceJwt`, `asymmetricJwk` + `asymmetricJwkSet`
(Main.hs runs AsymmetricJwtSpec under both configs; same corpus twice),
`disallowRollback`, `forceRollback`.

### Buckets deliberately not replayed

* **`proxy`** (ProxySpec): its only requests come from
  `SpecHelper.validateOpenApiResponse` (parameterized headers + a dynamically
  JSON-encoded body) and are unresolvable at extraction time — the bucket has
  zero replayable corpus entries. The proxy-URI handling itself is covered by
  plugin unit tests (`test/openapi_test.ts`).
* **`observability`** (ObservabilitySpec): `testObservabilityCfg` only sets
  `server-trace-header`; the plugin deliberately does not implement
  `PGRST_SERVER_TRACE_HEADER` (the trex stack has its own request-id
  middleware), and the spec's only assertions are on the echoed
  `X-Request-Id` header.
* **`pgSafeUpdate`** (PgSafeUpdateSpec.spec): `test.load_safeupdate()` does
  `LOAD 'safeupdate'`, which needs the pg-safeupdate C library; the
  postgis/postgis:16-3.4 fixture image does not ship it (upstream's nix test
  env does). The disabled-mode half of the spec runs under `DEFAULT`.

Note on `serverTiming`: the harness never compares `Server-Timing` values
(wall-clock measurements can't match across implementations); the bucket's
entries are still replayed under `planEnabled` for status/header/body parity.

## Commit units and the full-restore machinery

Requests that can COMMIT changes are replayed as **commit units**:

* any corpus entry (or `it`-block group, see below) carrying
  `Prefer: tx=commit`,
* every multi-request group (later steps must observe the earlier steps'
  effects on the same side), and
* mutating requests in the `disallowRollback` bucket (`db-tx-end = commit`
  persists everything).

A commit unit is replayed as a *sequence per side*: full data restore →
all steps against the oracle → full restore → all steps against the plugin →
step-wise diff. Both sides therefore always see identical database state,
even though the requests commit. The full restore TRUNCATEs every
non-extension fixture table and reloads the pristine data-only `pg_dump`
taken at initdb time (`$PGDATA/pristine_data.sql`; sequence values are
restored by the dump's `setval()` calls, materialized views are refreshed).
Commit units run after the plain entries of their bucket, and the runner
leaves the database pristine afterwards.

The extractor groups the requests of any upstream `it`-block that contains a
tx=commit step (e.g. InsertSpec's "reset sequence + insert + verify"
sequences), so those blocks replay in upstream order. `Feature.RollbackSpec`
is hand-ported in `extract_corpus.py` (`rollback_corpus`): its requests live
in helpers parameterized by the Prefer headers, which the scanner cannot
resolve; the allowed/disallowed/forced × default/commit/rollback matrix is
expanded into concrete entries mirroring `RollbackSpec.hs` verbatim, with the
mutation helpers (postItem / verify-GETs / deleteItems) as replay groups.

## Known limitations (deferred)

* Requests built from unresolvable Haskell expressions are counted in
  `corpus/skipped.jsonl` (1 entry: InsertSpec's dynamic `Location`-follow
  request).
* `CONNECT`/`TRACE` spec entries (2, in the `nonexistentSchema` bucket) are
  skipped: Deno's HTTP transport cannot carry them.
* The harness tests `handle()` behind `Deno.serve`, not the express bridge of
  the full trex stack (that layer is tested separately).
