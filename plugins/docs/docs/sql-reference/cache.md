---
sidebar_position: 8
---

# cache — External Database Cache

The `cache` extension copies tables from an external database into a local
Trex (DuckDB) schema. Point it at a Postgres, MySQL, SQLite, or BigQuery
source, name a schema, and it attaches the source read-only, copies every
table in that schema, and returns a JSON summary.

Use it when you want a fast local snapshot of a remote database for analytics
— no live federation, no per-query round-trips. Unlike the `hana` attach
(which keeps queries live against the remote), `cache` materializes the data
once into Trex-resident tables.

## Functions

### `trex_cache_create(dialect, source, schema [, target])`

Attach an external database read-only and copy a schema's tables into a local
target schema.

| Parameter | Type | Description |
|-----------|------|-------------|
| dialect | VARCHAR | Source type: `postgres` (or `postgresql`), `mysql`, `sqlite`, or `bigquery`. |
| source | VARCHAR | Connection string / path, passed to DuckDB `ATTACH ... (TYPE <dialect>, READ_ONLY)`. |
| schema | VARCHAR | Source schema to copy. For SQLite this is forced to `main`. |
| target | VARCHAR | Optional. Local target schema name. Defaults to `<dialect>_<schema>`. |

**Returns:** VARCHAR — a JSON summary: `{ "tables": [...], "copied": N, "rows": N, "target_schema": "...", "elapsed_ms": N, "warning": "..."? }`.

```sql
-- Snapshot the 'public' schema of a Postgres database into local schema 'pg_public'
SELECT trex_cache_create(
  'postgres',
  'host=db.internal port=5432 dbname=omop user=reader password=secret',
  'public'
);

-- Copy into a named target schema
SELECT trex_cache_create(
  'mysql',
  'host=127.0.0.1 user=root password=pass database=app',
  'app',
  'app_cache'
);
```

## Operational notes

- **Read-only attach.** The source is attached with `READ_ONLY` (except
  BigQuery, which does not support the flag), so `cache` never writes to the
  source.
- **Point-in-time snapshot.** Data is copied once. Re-run `trex_cache_create`
  to refresh; the target schema's tables are rebuilt from the source.
- **Sizing.** The copy streams every table in the schema into Trex — plan disk
  and memory for the full dataset, and use `schema`/`target` scoping to avoid
  pulling more than you need.

## Next steps

- [SQL Reference → hana](hana) — live federation instead of a local copy.
- [SQL Reference → etl](etl) — change-data-capture for continuously syncing a
  Postgres source.
