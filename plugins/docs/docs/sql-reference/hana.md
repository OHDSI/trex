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
With `hana_attach`, the Trex query planner pushes filters and projections
into HANA, fetches only the needed columns, and joins them with local Trex
data — typically order-of-magnitude faster than streaming whole tables.

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

-- Persistent: attach a schema, then query naturally
SELECT * FROM trex_hana_attach(
  'hdbsqls://user:pass@hana:39015/HDB?insecure_omit_server_certificate_check',
  'omop',     -- local Trex DB name to register the virtual tables under
  'CDM'       -- HANA schema to mirror
);

-- Now CDM tables appear as omop.CDM.<table>
SELECT person_id, COUNT(*) AS observation_count
  FROM omop.CDM.OBSERVATION
 GROUP BY person_id
 LIMIT 10;

-- Detach when done
SELECT trex_hana_detach('omop', 'CDM');
```

## Functions

### `trex_hana_scan(query, url)`

Run a SQL query against HANA and return the results as a Trex table.
Connection is opened, query executed, results streamed back, connection
closed — one-shot.

| Parameter | Type | Description |
|-----------|------|-------------|
| query | VARCHAR | SAP HANA SQL. The remote side parses it, so use HANA syntax. |
| url | VARCHAR | `hdbsqls://...` connection URL. |

**Returns:** TABLE (dynamic columns from the query schema).

```sql
SELECT * FROM trex_hana_scan(
  'SELECT TOP 10 * FROM PATIENTS',
  'hdbsqls://user:pass@hana:39015/HDB?insecure_omit_server_certificate_check'
);
```

`hana_scan` and `trex_hana_query` are aliases — same function, three names.

### `trex_hana_attach(url, dbname, schema)`

Mirror every table in a HANA schema as virtual tables under a Trex catalog.
The mirror is metadata-only — no data is copied; queries against the virtual
tables are rewritten into HANA SQL and pushed down at execution time.

| Parameter | Type | Description |
|-----------|------|-------------|
| url | VARCHAR | HANA connection URL. |
| dbname | VARCHAR | Local Trex catalog name to register the virtual tables under. |
| schema | VARCHAR | HANA schema name to mirror. |

**Returns:** TABLE(table_name VARCHAR, full_name VARCHAR) — one row per table mirrored.

```sql
SELECT * FROM trex_hana_attach(
  'hdbsqls://user:pass@hana:39015/HDB',
  'hana_db',
  'CDM'
);
```

After attach:
- Trex's planner pushes `WHERE` and column projection into HANA.
- The connection persists across queries (auto-pinned to the calling
  session — see [Concepts → Connection Pool](../concepts/connection-pool)).
- Virtual tables share the same lifetime as the attach: a `detach` removes
  them.

### `trex_hana_detach(dbname, schema)`

Remove a previously attached schema and its virtual tables.

```sql
SELECT trex_hana_detach('hana_db', 'CDM');
```

### `trex_hana_tables()`

List every HANA virtual table currently attached on this node.

**Returns:** TABLE

| Column | Description |
|--------|-------------|
| table_name | Local table name. |
| schema_name | HANA schema. |
| dbname | Local Trex catalog name. |
| full_name | Fully-qualified name (`dbname.schema.table`). |

```sql
SELECT * FROM trex_hana_tables();
```

### `trex_hana_execute(connection_string, sql_statement)`

Execute a HANA DDL/DML statement that doesn't return a result set —
`CREATE`, `INSERT`, `UPDATE`, `DELETE`, `CALL`. For `SELECT`, use
`trex_hana_scan` instead.

```sql
SELECT trex_hana_execute(
  'hdbsqls://user:pass@hana:39015/HDB',
  'CREATE TABLE TEST (id INTEGER, name NVARCHAR(100))'
);
```

## Operational notes

- **Pushdown coverage**: filters (`WHERE`), projections (`SELECT cols`), and
  basic comparison operators push into HANA. Joins between HANA tables push
  down. Joins between HANA and Trex-local tables stream the HANA side and
  join in the engine.
- **HANA Express in Docker** requires `vm.max_map_count >= 262144`:
  ```bash
  sudo sysctl -w vm.max_map_count=262144
  ```
- **Credentials in URLs are visible** in `trex_hana_tables()` output and
  query plans. For shared environments, use the management API's database
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
