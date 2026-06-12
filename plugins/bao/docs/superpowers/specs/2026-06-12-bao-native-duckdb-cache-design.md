# bao cache — restore the native DuckDB scanner path + fix native-image cache creation

**Date:** 2026-06-12
**Status:** Approved design, pending implementation plan
**Component:** `plugins/bao/java` (`trexsql` Clojure library, AOT-compiled into WebAPI's GraalVM native image)

## Summary

Reinstate the DuckDB **native scanner** read path for cache (datamart) creation
for the dialects DuckDB can connect to directly — **postgres, mysql, bigquery** —
while keeping the current **JDBC + HikariCP + SqlRender** path as the fallback for
every other dialect (oracle, sql server, redshift, snowflake, impala, netezza,
hive/spark). In the same effort, fix cache creation under WebAPI's GraalVM
**native image**: the native-scanner path removes JDBC/reflection for the common
dialects, and the JDBC fallback is made native-image-safe so the remaining
dialects also work.

This is a targeted restoration of the path deleted in commit `1a5b763`
("add chat endpoint (#151)", 2026-05-10), generalized from postgres/bigquery to
postgres/mysql/bigquery, not a new Rust extension.

## Motivation

Two coupled problems:

1. **Lost native path.** Cache creation used to read postgres/bigquery sources via
   DuckDB's bundled scanners (`ATTACH … (TYPE postgres|bigquery, READ_ONLY)` +
   `CREATE TABLE … AS SELECT`), letting DuckDB do all type conversion over the
   `TrexEngine` FFI handle. `1a5b763` collapsed every dialect onto a single JDBC
   batch-transfer path (`batch/create-cache-jdbc`: HikariCP → `ResultSet` →
   DuckDB Appender with a manual per-type map).

2. **Cache creation is broken in the native image.** The `trexsql` library is
   AOT-compiled into WebAPI's GraalVM native image and talks to DuckDB through the
   `TrexEngine` JNA FFI. The JDBC path drags in `DriverManager` driver
   auto-registration, HikariCP, and SqlRender resource loading — all
   reflection / service-loader / resource machinery that the closed-world native
   build does not see. Concretely, `plugins/webapi/graalvm-config/` registers
   `HikariConfig`/`HikariDataSource`/`DriverManager` but **no JDBC driver classes**
   and **no SqlRender resources**, and the config-capture trace
   (`gen-graalvm-config.sh`) runs with `trexsql.enabled=false`, so the cache path
   is never exercised and its metadata is never captured.

The native-scanner path is pure DuckDB SQL over the FFI handle, so it sidesteps the
JDBC/reflection machinery entirely for the dialects it covers — making it both the
restoration of a faster read path and a large part of the native-image fix.

## Scope

- **Native scanner dialects:** postgres (`postgres`/`postgresql`), mysql
  (`mysql`/`mariadb`), bigquery.
- **JDBC fallback dialects:** everything else currently in `valid-dialects`
  (sql server/pdw/synapse, redshift, oracle, impala, netezza, hive/spark,
  snowflake).
- **Native-image fix:** both prongs — native path for the common dialects AND a
  native-image-safe JDBC fallback for the rest.
- **FTS:** unchanged; the existing post-copy FTS indexer is reused verbatim.
- **Out of scope:** HANA via a native path (stays JDBC for now); a separate Rust
  `plugins/cache/` extension (rejected — see Alternatives); async job execution;
  incremental/watermark refresh.

## Infrastructure facts (verified)

- The image **pre-bundles** the scanner extensions: `Dockerfile` (~L132–137)
  downloads `postgres_scanner`, `mysql_scanner`, `sqlite_scanner`, `bigquery`
  (community), plus `fts`, `httpfs`, `icu`, `json`, etc. into the image.
- `src/main.rs` sets `autoinstall_known_extensions=true`,
  `autoload_known_extensions=true`, and `allow_unsigned_extensions`, so
  `INSTALL`/`LOAD postgres|mysql|bigquery` resolves to the bundled extension
  **offline** inside the native image.
- The `fts` extension is bundled, so the existing FTS step keeps working.

## Architecture

Single, unified cache flow. Only the **read** step branches on dialect; cache-file
attach, FTS, and `CacheResult` assembly are shared.

```
create-cache
  ├─ dialect ∈ native-scanner-dialects ?
  │     ├─ yes → native-scanner read  (db.clj attach + datamart copy)
  │     └─ no  → batch/create-cache-jdbc  (unchanged JDBC path)
  ├─ create-fts-indexes   (shared, unchanged)
  └─ ->CacheResult        (shared)
```

### 1. Dialect selection

```clojure
(def native-scanner-dialects #{"postgres" "postgresql" "mysql" "mariadb" "bigquery"})
```

`create-cache` checks `(contains? native-scanner-dialects (:dialect creds))`. The
`postgresql`/`mariadb` aliases map onto the `postgres`/`mysql` scanners
respectively. `create-cache` keeps its current signature and the
`(:success? result)`-gated FTS call; only the branch that produces
`tables-copied` changes.

### 2. Native attach + copy (`db.clj`, `datamart.clj`)

Restore and generalize the deleted functions:

- `attach-source!` dispatches on dialect and builds the ATTACH:

  | Dialect  | ATTACH form                                                    | "schema" means       | READ_ONLY     |
  |----------|----------------------------------------------------------------|----------------------|---------------|
  | postgres | `ATTACH '<libpq dsn/uri>' AS <alias> (TYPE postgres, READ_ONLY)` | pg schema (`public`) | yes           |
  | mysql    | `ATTACH '<host=… user=… database=…>' AS <alias> (TYPE mysql, READ_ONLY)` | database == schema   | yes           |
  | bigquery | `ATTACH 'project=<id>' AS <alias> (TYPE bigquery)`             | dataset              | inherently RO |

  It `INSTALL`/`LOAD`s the scanner first (`load-extension!`, idempotent; bigquery
  via the community repo). The source alias is unique per run
  (`src_<database-code>`) to avoid collisions with concurrent runs.

- Cache file attached as a catalog via the existing `attach-cache-file!`.

- Per table:
  `CREATE OR REPLACE TABLE "<cache>"."<schema>"."<table>" AS SELECT <cols> FROM "<alias>"."<srcschema>"."<table>" WHERE <filter>`
  — DuckDB's scanner performs all type conversion. Reuses the existing
  `build-select-clause` / `build-where-clause` (column/patient/timestamp filters).
  No SqlRender, no JDBC, no Appender on this path.

- Source detached in a `finally`. All identifiers quoted with internal
  double-quotes doubled (matching `db/escape-identifier`).

The cache tables land at the same coordinates the JDBC path uses
(`<cache-alias>.<source-schema>.<table>`), so cache counts, circe SQL handlers,
and the FTS indexer address them identically.

### 3. FTS — unchanged

After the copy, the existing `create-fts-indexes` runs on the cache catalog exactly
as today: `fts-config` lookup, synthetic-id columns for synonym/relationship/
ancestor/recommended tables, `PRAGMA create_fts_index(…, stemmer='english',
stopwords='english', ignore=…, strip_accents=1, lower=1, overwrite=1)`. Because FTS
runs on the materialized cache file *after* the copy, native and JDBC reads produce
identical FTS indexes. No FTS code changes.

### 4. JDBC fallback made native-image-safe

The fallback must keep working in the native image for the non-scanner dialects:

- **Driver classes.** Register the fallback JDBC driver classes and their
  `META-INF/services/java.sql.Driver` service files in
  `plugins/webapi/graalvm-config/reflect-config.json` (today only `DriverManager`
  and Hikari are present — the driver classes are missing, so
  `DriverManager.getConnection` finds no driver under native image).
- **SqlRender resources.** Add SqlRender's bundled resource files (e.g.
  `replacementPatterns.csv` and the per-dialect translation CSVs) to
  `plugins/webapi/graalvm-config/resource-config.json` (currently absent →
  `SqlRender.translate` fails to load its translation table at runtime).
- **Capture automation.** Extend `gen-graalvm-config.sh` to run a cache-creation
  exercise with `trexsql.enabled=true` so the tracing agent records the above
  automatically; the committed `graalvm-config/` entries remain the reviewed source
  of truth (hand-authored entries are acceptable where tracing is impractical).

Only drivers actually shipped/used by the deployment need registration; the native
path already removes the postgres/mysql/bigquery driver need for the common cases.

### 5. Error handling

- Bad dialect / missing args → clear validation error (existing `validate-*`).
- ATTACH failure (auth/network/bad dsn) → surfaced verbatim; nothing is created.
- Per-table failure → recorded in `CacheResult.tables-failed` with `phase`
  (matches current behavior). Drop + recreate keeps re-runs idempotent.
- Connection strings masked in any log output.

## Testing

- **Unit:** ATTACH-string construction per dialect (postgres/mysql/bigquery);
  alias generation; `build-select-clause`/`build-where-clause` SQL with
  column/patient/timestamp filters; native-vs-JDBC dispatch in `create-cache`.
- **Integration (`plugins/bao/java/test/`):** postgres end-to-end against the
  compose stack via the native path — assert row counts and FTS index presence,
  and assert parity with the JDBC path on the same source. MySQL/BigQuery covered
  at the unit level (ATTACH-string assertions) in this pass.
- **Native image:** a smoke step (extend `plugins/webapi/smoke/`) that runs cache
  creation for a postgres source inside the built native lib (native path), plus a
  fallback-dialect smoke that exercises the JDBC path to prove driver/SqlRender
  registration is complete.

## Alternatives considered

- **Separate Rust `plugins/cache/` extension** (per the 2026-06-01 spec, with a
  `SourceDialect` trait and `trex_cache_create` scalar fn). Rejected: a parallel
  implementation in another language/plugin that duplicates bao's cache-file, FTS,
  and WebAPI Source/batch/job plumbing, and does nothing for the native-image bug.
- **ATTACH-only normalization** (custom scanners so even oracle/sql server attach).
  Rejected: DuckDB has no scanner for those; would require building custom
  extensions. Out of scope.

## Future work

- HANA via a native path (`trex_hana_attach` / `hana_scan`) behind the same
  dialect dispatch.
- MySQL/BigQuery end-to-end integration tests against live sources.
- Incremental / watermark refresh instead of drop + recreate.
