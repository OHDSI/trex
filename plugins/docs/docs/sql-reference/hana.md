---
sidebar_position: 3
---

# hana — SAP HANA Federation

The `hana` extension reads from (and writes to) SAP HANA databases. Two
modes:

- **One-shot scan**: hand it a query + a connection URL, get a table back.
  Good for ad-hoc joins with Trex-resident data.
- **Attach**: register a HANA schema as a Trex catalog so its tables show up
  as virtual tables you can query natively. Better for repeated access — no
  re-handshake per query.

## Why HANA federation matters

In healthcare and OHDSI deployments, OMOP CDM data often lives in SAP HANA.
Pulling those tables across a network on every analytical query is slow.
With `ATTACH ... (TYPE hana)`, HANA schemas and tables become a Trex
catalog you can query and join with local Trex data in plain SQL. For
selective reads, push the filter into HANA yourself with `trex_hana_scan`.

## Connection URLs

`hana` uses the SAP HANA Cloud `hdbsqls://` URL scheme with TLS:

```
hdbsqls://USER:PASS@HOST:39015/HDB
hdbsqls://USER:PASS@HOST:39015/HDB?insecure_omit_server_certificate_check
```

The `insecure_omit_server_certificate_check` query parameter disables TLS
verification (acceptable for local Express containers; not for production).
For real HANA Cloud, configure the trust store via standard SAP HANA client
mechanisms.

:::note Non-TLS scheme
The plain `hdbsql://` scheme (no `s`, no TLS) is also accepted. It connects
without encryption and is convenient for local HANA Express containers. Use
`hdbsqls://` for anything over an untrusted network.

```
hdbsql://USER:PASS@HOST:39015/HDB
```
:::

## Typical workflow

```sql
-- One-off: pull a single result set
SELECT * FROM trex_hana_scan(
  'SELECT person_id, year_of_birth FROM CDM.PERSON WHERE gender_concept_id = 8507',
  'hdbsqls://user:pass@hana:39015/HDB?insecure_omit_server_certificate_check'
);

-- Persistent: attach HANA as a catalog, then query naturally
ATTACH 'hdbsqls://user:pass@hana:39015/HDB?insecure_omit_server_certificate_check'
  AS omop (TYPE hana, SCHEMA 'CDM');

-- Tables appear as omop.CDM.<table>, or omop.<table> for the SCHEMA option
SELECT person_id, COUNT(*) AS observation_count
  FROM omop.OBSERVATION
 GROUP BY person_id
 LIMIT 10;

-- Detach when done
DETACH omop;
```

## Attaching HANA

```sql
ATTACH '<hdbsql(s) url>' AS <name> (TYPE hana [, SCHEMA '<schema>']);
ATTACH 'hana:<hdbsql(s) url>' AS <name>;   -- the hana: prefix selects the type too
```

ATTACH connects once, so a bad URL or bad credentials fail the ATTACH
itself. The attached database is a read-only catalog:

- **Schemas** are the HANA schemas you have privileges on (`SYS.SCHEMAS`).
- **Tables** are the tables and views of each schema (`SYS.TABLES`,
  `SYS.VIEWS`). Names match case-insensitively.
- **`SCHEMA` option**: the schema that `<name>.<table>` and `USE <name>`
  resolve to. Without it, two-part names look for a `main` schema.
- Schemas and tables are listed lazily and cached until `DETACH`; detach and
  attach again to see new HANA tables.
- Each table is read through `trex_hana_scan('SELECT * FROM "S"."T"', url)`.
  Its columns are learned on first use with a `LIMIT 1` probe, so listing a
  whole schema (e.g. `SHOW ALL TABLES`) probes every table in it.
- `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `DROP` against it fail as read-only;
  use `trex_hana_execute` to change HANA.

## Functions

### `trex_hana_scan(query, url [, session_id])`

Run a SQL query against HANA and return the results as a Trex table.
Without `session_id`, connections are one-shot. Supplying one reuses that
session's HANA connection, so session-local state survives between statements:
`#temp` tables and session variables set with `SET '<VAR>' = '<value>'`.

| Parameter | Type | Description |
|-----------|------|-------------|
| query | VARCHAR | SAP HANA SQL. The remote side parses it, so use HANA syntax. |
| url | VARCHAR | `hdbsqls://...` connection URL. |
| session_id | VARCHAR | Optional named parameter identifying a pooled HANA session. |

**Returns:** TABLE (dynamic columns from the query schema).

```sql
SELECT * FROM trex_hana_scan(
  'SELECT TOP 10 * FROM PATIENTS',
  'hdbsqls://user:pass@hana:39015/HDB?insecure_omit_server_certificate_check'
);
```

`hana_scan` and `trex_hana_query` are aliases — same function, three names.

### `trex_hana_execute(connection_string, sql_statement [, session_id])`

Execute a HANA DDL/DML statement that doesn't return a result set —
`CREATE`, `INSERT`, `UPDATE`, `DELETE`, `CALL`. For `SELECT`, use
`trex_hana_scan` instead. `session_id` is the optional positional third
argument and has the same pooling behavior as in `trex_hana_scan`.

```sql
SELECT trex_hana_execute(
  'hdbsqls://user:pass@hana:39015/HDB',
  'CREATE TABLE TEST (id INTEGER, name NVARCHAR(100))'
);
```

### Session variables

HANA session variables are set with HANA's own statement, so any variable works
— there is no fixed list:

```sql
SELECT trex_hana_execute(
  'hdbsqls://user:pass@hana:39015/HDB',
  'SET ''APPLICATION'' = ''d2e-WIZARD_cross-sectional-demographics''',
  '42'
);
```

Read them back with `SESSION_CONTEXT`:

```sql
SELECT * FROM trex_hana_scan(
  'SELECT SESSION_CONTEXT(''APPLICATION'') AS application FROM DUMMY',
  'hdbsqls://user:pass@hana:39015/HDB',
  session_id = '42'
);
```

A variable lives as long as the session's pooled HANA connection, so both
statements must pass the same `session_id`. Over pgwire the session id is
supplied automatically and `SET '<VAR>' = '<value>'` is forwarded to HANA, so a
client can issue it as an ordinary statement. Clear one with `UNSET '<VAR>'`.

A pooled connection is closed when its session ends, and as a backstop once it
has been idle longer than `HANA_SESSION_IDLE_TTL_SECS` (default 600).

### `trex_hana_materialize_cohort(connection_string, source_sql, source_params_json, results_schema, cohort_definition_id, session_vars_json)`

Materialize an OHDSI cohort directly inside HANA. Runs `source_sql` on HANA,
then batch-inserts the resulting subjects into the `COHORT` table of
`results_schema` on the same HANA server — the data never leaves HANA. Use it
to write cohorts back to a HANA results schema without round-tripping rows
through Trex.

| Parameter | Type | Description |
|-----------|------|-------------|
| connection_string | VARCHAR | HANA connection URL. |
| source_sql | VARCHAR | Query producing the cohort. Must yield `SUBJECT_ID`, `COHORT_START_DATE`, `COHORT_END_DATE` (case-insensitive). |
| source_params_json | VARCHAR | JSON array of bind parameters for `source_sql`. Empty array runs it as a plain query. |
| results_schema | VARCHAR | HANA schema containing the target `COHORT` table. Validated as a safe identifier. |
| cohort_definition_id | BIGINT | Value written to `COHORT_DEFINITION_ID` on every inserted row. |
| session_vars_json | VARCHAR | JSON object of HANA client-info session vars. `APPLICATION` and `APPLICATIONUSER` are recognized. |

**Returns:** BIGINT — the number of rows inserted.

```sql
SELECT trex_hana_materialize_cohort(
  'hdbsqls://user:pass@hana:39015/HDB',
  'SELECT person_id AS subject_id, start_date AS cohort_start_date, end_date AS cohort_end_date FROM CDM.MY_COHORT',
  '[]',
  'RESULTS',
  42,
  '{"APPLICATION": "trex"}'
);
```

Insert batching is tuned by `HANA_MATERIALIZE_BATCH_SIZE` (default 30000) and
`HANA_MATERIALIZE_FETCH_SIZE` (default 100000).

## Operational notes

- **No pushdown through ATTACH yet**: a query against an attached table
  streams the whole HANA table and filters and joins in the engine. For large
  tables, write the selective query in HANA SQL with `trex_hana_scan`.
- **HANA Express in Docker** requires `vm.max_map_count >= 262144`:
  ```bash
  sudo sysctl -w vm.max_map_count=262144
  ```
- **Credentials in URLs are visible** in `duckdb_databases()` (the ATTACH
  path) and query plans. For shared environments, use the management API's database
  registry to keep them out of SQL strings.
- **No write replication.** This extension reads/writes to HANA on demand; it
  does not replicate HANA changes into Trex. For continuous data movement,
  build a `transform` pipeline that periodically `INSERT INTO local
  SELECT FROM hana_*`.

## Next steps

- [SQL Reference → etl](etl) — for Postgres CDC; HANA equivalent is on the
  roadmap.
- [Concepts → Query Pipeline](../concepts/query-pipeline) — how the planner
  decides what to push down.
- [Quickstart: Federate a Postgres database](../quickstarts/federate-postgres)
  — same pattern, different source.
