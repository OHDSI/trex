# @trex/cache

Snapshot-materialize an entire source-database schema into a local DuckDB schema.

Leans on DuckDB's native scanners (`ATTACH … (TYPE …)`), so DuckDB performs all
type conversion. Each run drops and recreates the cached tables.

## Usage

```sql
-- Cache every table in a Postgres schema into local schema "pg_cache"
SELECT trex_cache_create(
  'postgres',                                   -- dialect
  'host=db dbname=app user=u password=p',       -- connection string / DSN
  'public',                                     -- source schema
  'pg_cache'                                     -- target schema (optional)
);
-- → {"tables":["orders","users"],"copied":2,"rows":15234,"target_schema":"pg_cache","elapsed_ms":812}
```

`target` is optional; it defaults to `<dialect>_<schema>` (e.g. `postgres_public`).

## Supported dialects

| dialect    | connection string example          | notes                       |
|------------|------------------------------------|-----------------------------|
| `postgres` | `host=… dbname=… user=… password=…`| schema = pg schema          |
| `mysql`    | `host=… user=… password=… database=…`| schema = database         |
| `sqlite`   | `/path/to/file.db`                 | schema is always `main`     |
| `bigquery` | `project=my-project`               | dataset acts as the schema  |

## Notes

- Refresh semantics: drop + recreate (`CREATE OR REPLACE TABLE … AS SELECT *`).
- Synchronous: returns a JSON summary when the whole schema has been copied.
- On the first per-table failure the run aborts; re-running after a fix is safe.
- Schema-name mapping is verified for `postgres` and `sqlite`. For `mysql` and
  `bigquery`, the attached catalog's schema name may differ from the requested
  schema; if no tables match, the JSON summary includes a `warning` and `copied: 0`
  rather than failing. Confirm the mapping against a live source.
