---
sidebar_position: 4
---

# pgwire — PostgreSQL Wire Protocol

The `pgwire` extension starts a PostgreSQL-compatible wire protocol server, allowing any PostgreSQL client (psql, JDBC, etc.) to connect and query trexsql.

## Functions

### `trex_pgwire_start(host, port, password, db_credentials)`

Start the PostgreSQL wire protocol server.

| Parameter | Type | Description |
|-----------|------|-------------|
| host | VARCHAR | Bind address |
| port | INTEGER | Server port |
| password | VARCHAR | Default connection password |
| db_credentials | VARCHAR | JSON credentials for external databases |

**Returns:** VARCHAR

```sql
SELECT trex_pgwire_start('0.0.0.0', 5432, 'mypassword', '{}');
```

:::note
`start_pgwire_server` is a deprecated alias for this function.
:::

### `trex_pgwire_stop(host, port)`

Stop the PostgreSQL wire protocol server.

| Parameter | Type | Description |
|-----------|------|-------------|
| host | VARCHAR | Server host |
| port | INTEGER | Server port |

**Returns:** VARCHAR

```sql
SELECT trex_pgwire_stop('0.0.0.0', 5432);
```

### `trex_pgwire_set_credentials(credentials)`

Update database credentials for the pgwire server at runtime.

| Parameter | Type | Description |
|-----------|------|-------------|
| credentials | VARCHAR | JSON credentials object |

**Returns:** VARCHAR

```sql
SELECT trex_pgwire_set_credentials('{"default": {"password": "newpass"}}');
```

:::note
`update_db_credentials` is a deprecated alias for this function.
:::

### `trex_pgwire_version()`

Return the pgwire extension version.

**Returns:** VARCHAR

```sql
SELECT trex_pgwire_version();
```

### `trex_pgwire_status()`

Show status of all running pgwire servers.

**Returns:** TABLE

| Column | Type | Description |
|--------|------|-------------|
| hostname | VARCHAR | Server hostname |
| port | VARCHAR | Server port |
| uptime_seconds | VARCHAR | Server uptime |
| has_credentials | VARCHAR | Whether credentials are configured |

```sql
SELECT * FROM trex_pgwire_status();
```

## Connecting with psql

Once the pgwire server is running, connect with any PostgreSQL client:

```bash
psql -h localhost -p 5432 -U trex -d memory
```

The default catalog is `memory`, so `-d memory` connects you to it. The
username (`-U trex`) is accepted but not validated — `SimpleAuthSource` checks
only the password.

## Connection Pool & Session Pinning

The pgwire server backs every client connection with a session from the shared
[pool extension](#). Three behaviors are worth knowing:

- **Default database.** Sessions inherit the pgwire process's default catalog at
  pool initialization time. With the default compose stack that catalog is
  `memory`. You can switch with `SET search_path` / `USE <db>` mid-session, or
  set `DATABASE_PATH` on the Trex binary to start with an on-disk catalog.
- **Auto-pinning.** When a client issues a write or a parameterized prepared
  statement, the pool transparently *pins* the underlying engine connection to
  that pgwire session for the duration of the open transaction. Reads remain
  unpinned and may be served by any pool connection.
- **Persistent sessions.** `ATTACH`, temporary tables, and other connection-local
  state require a persistent session. The pool detects these statements and
  upgrades the pgwire session in place — the client does not need to opt in.

These mechanics are transparent — `psql` and JDBC drivers see a normal Postgres
session. They matter if you're benchmarking pool sizing or debugging "lost"
session-local state across statements.

## Supported Data Types

The pgwire server encodes Arrow result columns into PostgreSQL wire types as
follows. Types not explicitly mapped are pre-cast to `TEXT` before encoding.

| Arrow / Trex type | Postgres wire type | Notes |
|-------------------|--------------------|-------|
| `BOOLEAN` | `bool` | |
| `INT8` / `INT16` / `INT32` / `INT64` | `int2` / `int2` / `int4` / `int8` | |
| `UINT8` / `UINT16` / `UINT32` / `UINT64` | `int2` / `int4` / `int8` / `int8` | |
| `FLOAT32` / `FLOAT64` | `float4` / `float8` | |
| `DECIMAL128(p,s)` | `numeric` | Bare NUMERIC — precision/scale are discarded in the wire type. |
| `UTF8` / `LARGE_UTF8` | `text` | |
| `BINARY` / `LARGE_BINARY` | `bytea` | |
| `DATE32` / `DATE64` | `date` | |
| `TIME32` / `TIME64` | `time` | |
| `TIMESTAMP` (any unit, no tz) | `timestamp` | Formatted as `YYYY-MM-DD HH:MM:SS.mmm` (millisecond precision). |
| `TIMESTAMP` (any unit, UTC) | `timestamptz` | |
| `DECIMAL256` | `numeric` | Values are text-encoded, but the wire OID stays NUMERIC. |
| `INTERVAL` | `text` | No interval branch — falls through to TEXT. |
| `LIST` / `LARGE_LIST` | `text` | Falls through to TEXT. |
| `STRUCT` / `MAP` | `text` | Generic cast to a Utf8 string; not guaranteed to be JSON. |
| `FIXED_SIZE_BINARY`, dictionary types | `text` | Pre-cast for compatibility. |

NULLs are encoded with the standard `-1` length sentinel.
