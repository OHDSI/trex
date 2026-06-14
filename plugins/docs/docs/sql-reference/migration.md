---
sidebar_position: 8
---

# migration — Schema Migrations

The `migration` extension is a versioned schema-migration runner. It scans a
directory of `V<n>__<name>.sql` files, computes integrity checksums, and
applies pending migrations in order — both to Trex catalogs and to
PostgreSQL databases attached to the engine. The Trex binary uses this
extension at startup to bring the core schema up to the latest version
(`SCHEMA_DIR` env var → `trex_migration_run_schema`). It is also the
intended path for plugin-owned schemas: call `trex_migration_run_schema`
against a per-plugin directory and schema.

## Concepts

### File Naming Convention

Migration files must follow the pattern `V<version>__<name>.sql`:

- **V prefix** — uppercase `V` is required
- **Version** — positive integer (e.g., `1`, `42`, `100`)
- **Separator** — double underscore `__`
- **Name** — alphanumeric characters and underscores only
- **Extension** — `.sql`

```
V1__create_tables.sql
V2__add_indexes.sql
V10__backfill_data.sql
```

Files that don't match this pattern are silently skipped. Duplicate version numbers cause an error.

### History Table

Each target schema gets a `refinery_schema_history` table. This is a custom,
refinery-*compatible* implementation (it reuses the well-known table name and
shape) — the extension does not depend on the `refinery` crate:

| Column | Type | Description |
|--------|------|-------------|
| `version` | INT4 (PK) | Migration version number |
| `name` | VARCHAR | Migration name from filename |
| `applied_on` | VARCHAR | Application timestamp |
| `checksum` | VARCHAR | SipHash-1-3 integrity checksum |

### Checksum Integrity

Checksums are computed from the migration name, version number, and SQL content using SipHash-1-3. On each run, stored checksums are compared against current file checksums. A mismatch aborts execution to prevent applying migrations against a modified history.

### Multi-Database Support

The `_schema` variants support both trexsql and PostgreSQL databases. Routing
is dynamic, not based on hard-coded database names: the runner calls
`is_postgres_database()`, which queries `duckdb_databases()` and checks whether
the target database's `type` is `postgres`.

| Database type (from `duckdb_databases()`) | Target |
|-------------------------------------------|--------|
| `postgres` | Migrations run against the attached PostgreSQL database |
| anything else | Migrations run against the trexsql attached/in-memory database |

Any database attached as a PostgreSQL database (including the `_config`
metadata database) is dispatched to the PostgreSQL path automatically.

### Status values

`trex_migration_run` / `trex_migration_run_schema` report a per-migration
`status`. Besides the success/error states, already-applied migrations that are
re-discovered on a subsequent run are reported with status `skipped`.

:::note
At startup the Trex binary runs its core schema migrations against the
`trexdb` schema (not `trex`).
:::

### Transaction Safety

Each migration runs in a transaction where supported. trexsql supports transactional DDL, so failed migrations are rolled back. PostgreSQL migrations also run transactionally.

## Typical workflow

```sql
-- Inspect what's there before running anything
SELECT * FROM trex_migration_status('/usr/src/core/schema');

-- Apply pending migrations to the default Trex catalog (memory)
SELECT * FROM trex_migration_run('/usr/src/core/schema');

-- Or scope to a specific schema/database (typical for plugins or
-- multi-tenant setups)
SELECT * FROM trex_migration_run_schema(
  '/path/to/migrations',
  'trex',          -- target schema
  '_config'        -- target database (PostgreSQL when '_config')
);

-- Check status across all migrations
SELECT version, name, status, applied_on
  FROM trex_migration_status_schema('/path/to/migrations', 'trex', '_config');
```

For the four common error cases (no files, duplicate version, checksum
mismatch, SQL failure), see [Error Scenarios](#error-scenarios) at the
bottom of this page.

## Functions

### `trex_migration_run(path)`

Discover and execute pending migrations from a directory. Migrations are SQL files named with the `V<version>__<name>.sql` convention (e.g., `V1__create_tables.sql`); see [File Naming Convention](#file-naming-convention).

| Parameter | Type | Description |
|-----------|------|-------------|
| path | VARCHAR | Path to migrations directory |

**Returns:** TABLE

| Column | Type | Description |
|--------|------|-------------|
| version | INTEGER | Migration version number |
| name | VARCHAR | Migration file name |
| status | VARCHAR | Execution status |

```sql
SELECT * FROM trex_migration_run('./migrations');
```

### `trex_migration_status(path)`

Show status of all discovered migrations (applied, pending, or checksum mismatch).

| Parameter | Type | Description |
|-----------|------|-------------|
| path | VARCHAR | Path to migrations directory |

**Returns:** TABLE

| Column | Type | Description |
|--------|------|-------------|
| version | INTEGER | Migration version number |
| name | VARCHAR | Migration file name |
| status | VARCHAR | applied, pending, or checksum_mismatch |
| applied_on | VARCHAR | Application timestamp |
| checksum | VARCHAR | File checksum |

```sql
SELECT * FROM trex_migration_status('./migrations');
```

### `trex_migration_run_schema(path, schema, database)`

Run migrations in a specific schema and database. Supports both trexsql and PostgreSQL databases.

| Parameter | Type | Description |
|-----------|------|-------------|
| path | VARCHAR | Path to migrations directory |
| schema | VARCHAR | Target schema name |
| database | VARCHAR | Target database name |

**Returns:** TABLE

| Column | Type | Description |
|--------|------|-------------|
| version | INTEGER | Migration version number |
| name | VARCHAR | Migration file name |
| status | VARCHAR | Execution status |

```sql
SELECT * FROM trex_migration_run_schema('./migrations', 'my_schema', 'my_database');
```

### `trex_migration_status_schema(path, schema, database)`

Show migration status in a specific schema and database.

| Parameter | Type | Description |
|-----------|------|-------------|
| path | VARCHAR | Path to migrations directory |
| schema | VARCHAR | Target schema name |
| database | VARCHAR | Target database name |

**Returns:** TABLE

| Column | Type | Description |
|--------|------|-------------|
| version | INTEGER | Migration version number |
| name | VARCHAR | Migration file name |
| status | VARCHAR | applied, pending, or checksum_mismatch |
| applied_on | VARCHAR | Application timestamp |
| checksum | VARCHAR | File checksum |

```sql
SELECT * FROM trex_migration_status_schema('./migrations', 'my_schema', 'my_database');
```

## Migration Lifecycle

```mermaid
flowchart LR
    Discover["Discover files"] --> Verify["Verify checksums"]
    Verify --> Execute["Execute pending"]
    Execute --> Record["Record in history"]
```

## Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| No migration files found | Directory is empty or files don't match naming pattern | Add files matching `V<n>__<name>.sql` |
| Duplicate version | Two files share the same version number | Renumber one of the conflicting files |
| Checksum mismatch | A previously applied migration file was modified | Restore the original file or reset the schema history |
| SQL failure | A migration statement failed to execute | Fix the SQL error and re-run |
| Directory not found | The specified path does not exist | Verify the path passed to the function |
