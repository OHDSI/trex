# PostgREST differential conformance harness

Replays the request corpus of the upstream **PostgREST v12.2.3 hspec-wai test
suite** (plus a hand-built supabase-js v2 wire-shape corpus) against

* the real `postgrest/postgrest:v12.2.3` container (**oracle**), and
* the trex plugin (`plugins/postgrest/functions/app.ts` `handle()`) behind a
  thin Deno HTTP wrapper (`serve_plugin.ts` — *not* the full trex stack),

then diffs the normalized responses. Both sides share **one** fixture database
loaded with the verbatim upstream spec fixtures; `db-tx-end =
rollback-allow-override` keeps the data pristine, and the runner resets all
sequences before every request so serial keys match on both sides.

## Layout

| file | purpose |
| --- | --- |
| `fixtures/` | verbatim copies of `test/spec/fixtures/*.sql` from the PostgREST v12.2.3 source (load order in `load.sql`) |
| `initdb/zz-load-fixtures.sh` | creates the `postgrest_test_authenticator` login role and loads the fixtures exactly like upstream `nix/tools/withTools.nix` |
| `docker-compose.yml` | `db` (postgis/postgis:16-3.4, host port **15433**) + `oracle` (host port **13000**), env mirrors `SpecHelper.hs` `baseCfg` key by key |
| `serve_plugin.ts` | maps `:13001/<path>` → `http://…/postgrest/<path>` (the worker expects its mount prefix; `/` maps to `/postgrest/` = OpenAPI root) and calls `handle()` |
| `plugin.env` | PGRST_* env for the plugin server — must stay in sync with the oracle's compose env |
| `extract_corpus.py` | parses `test/spec/Feature/**/*.hs` into `corpus/<Module>.jsonl` (+ `skipped.jsonl`, `supabase-js.jsonl`) |
| `run_diff.py` | replays, normalizes, diffs; writes `report/failures/<module>/<id>.diff` and `report/summary.json` |
| `exceptions.yaml` | `{entry-id: reason}` known/accepted diffs (reported separately, do not fail the run) |

## Workflow

```sh
cd integration-tests/postgrest

# 1. extract the corpus from a PostgREST v12.2.3 checkout
make corpus POSTGREST_SRC=/path/to/postgrest-12.2.3

# 2. database + oracle
make up

# 3. plugin server on the host (deno, background; log: report/serve_plugin.log)
make serve

# 4. replay the DEFAULT (baseCfg) bucket and diff
make diff                 # or: python3 run_diff.py --modules QuerySpec --limit 50

# 5. teardown
make serve-stop down
```

The plugin server command that `make serve` runs is:

```sh
set -a; . ./plugin.env; set +a
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

Request paths are percent-encoded identically for both sides before sending
(hspec-wai feeds raw bytes like `>`/`"`/space to the WAI app; real HTTP
parsers reject them in a request line).

## Config buckets

Each corpus entry is tagged with the config its module runs under in
`test/spec/Main.hs`. Only the `DEFAULT` bucket (`baseCfg`) is replayed;
variant-config modules (maxRows, unicode schema, JWT variants, extra search
path, multiple schemas, root-spec, plan-enabled, aggregates, …) are extracted
and tagged but skipped (`skip_bucket`). See `MODULE_*` maps in
`extract_corpus.py`.

## Known limitations (deferred)

* **Variant configs are not replayed** — needs per-bucket oracle containers /
  plugin env restarts.
* **`Prefer: tx=commit` entries are skipped** (`skip_txcommit`) — they would
  mutate the shared database; a later version can reload fixtures around them.
* Requests built from unresolvable Haskell expressions are counted in
  `corpus/skipped.jsonl` (15 entries: RollbackSpec's parameterized helpers and
  one dynamic `Location`-follow request).
* `CONNECT`/`TRACE` spec entries exist only in a variant bucket; the Deno
  transport could not carry them anyway.
* The harness tests `handle()` behind `Deno.serve`, not the express bridge of
  the full trex stack (that layer is tested separately).
