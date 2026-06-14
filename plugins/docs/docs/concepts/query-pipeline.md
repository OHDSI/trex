---
sidebar_position: 5
---

# Query Pipeline

This page traces a single query end-to-end. It's the explanation that pairs
with [Concepts → Architecture](architecture) (which covers the static
component layout) and [Concepts → Connection Pool](connection-pool) (which
covers the connection state machine).

## Three entry paths

A query can enter Trex through three doors. They converge at the engine but
have different contracts on the way in.

```mermaid
flowchart LR
    subgraph Inbound["Inbound paths"]
        Psql["psql / JDBC<br/>:5433"]
        GqlReq["GraphQL request"]
        FuncReq["Edge function code"]
    end

    Psql --> Pgwire["pgwire extension"]
    GqlReq --> PostGraphile["PostGraphile<br/>(Postgres metadata DB)"]
    FuncReq --> Runtime["runtime extension<br/>(Deno worker)"]

    Pgwire --> Pool["pool extension"]
    Runtime --> Pool
    PostGraphile --> PG["PostgreSQL<br/>metadata DB"]

    Pool --> Engine["Trex Engine"]
    Engine --> Local["Local catalog"]
    Engine --> Federated["Federated source<br/>(Postgres / HANA / S3 / ...)"]
    Engine --> FlightPeer["Flight peer<br/>(other cluster node)"]
```

The pgwire and edge-function paths terminate at the analytical engine. The
GraphQL path terminates at PostgreSQL — the management database — which is
deliberately *separate* from the engine. Trex doesn't auto-promote GraphQL
queries to the engine; if you want analytical queries via HTTP, expose them
through transform endpoints, plugin functions, or the REST proxy onto a
trexsql catalog you've configured.

## A pgwire query, step by step

```mermaid
sequenceDiagram
    participant Client as psql / JDBC
    participant Pgwire as pgwire ext
    participant Pool as pool ext
    participant Engine as Trex Engine
    participant Source as Federated source

    Client->>Pgwire: Bind + Execute<br/>SELECT ... FROM hana_table
    Pgwire->>Pool: Borrow connection
    Pool-->>Pgwire: Connection (default catalog)

    Note over Pgwire,Pool: One pool session per pgwire connection.<br/>Session-local state (ATTACH / temp / SET / USE)<br/>persists for the session; writes are serialized.

    Pgwire->>Engine: Execute query bytes
    Engine->>Engine: Parse, plan, optimize
    Engine->>Source: hana_scan() pushdown<br/>(via federated extension)
    Source-->>Engine: Arrow record batches
    Engine-->>Pgwire: Result Arrow stream
    Pgwire->>Pgwire: Encode Arrow → Postgres wire types
    Pgwire-->>Client: DataRow + DataRow + ... + ReadyForQuery
```

Three things worth pulling out:

1. **Federation is pushed into the engine, not the pgwire layer.** The wire
   server doesn't know that `hana_table` lives on SAP HANA. It hands the
   query to the engine, which dispatches the appropriate scan.
2. **Encoding happens at the boundary.** The engine speaks Arrow internally;
   the pgwire layer translates Arrow types into Postgres wire types
   (see [SQL Reference → pgwire](../sql-reference/pgwire) for the full
   mapping).
3. **Each pgwire connection leases one pool session.** Session-local state
   lives for the session and writes are serialized — the `Note` above
   summarizes the model from [Concepts → Connection Pool](connection-pool).

## A distributed query (multi-node)

When the `db` extension's distributed mode is active, the engine consults
the gossip catalog to plan cross-node execution.

```mermaid
sequenceDiagram
    participant Client
    participant Coord as Coordinator (Node 1)
    participant Worker1 as Worker (Node 2)
    participant Worker2 as Worker (Node 3)

    Client->>Coord: SELECT ... JOIN ... GROUP BY ...
    Coord->>Coord: Plan: shuffle-join, partial-aggregate
    par Push fragments
        Coord->>Worker1: Flight: scan + filter on partition X
        Coord->>Worker2: Flight: scan + filter on partition Y
    end
    par Stream results
        Worker1-->>Coord: Arrow batches
        Worker2-->>Coord: Arrow batches
    end
    Coord->>Coord: Merge / final aggregate
    Coord-->>Client: Final result
```

This is a sketch — the actual planner choices (broadcast vs. shuffle, partial
vs. global aggregate) live in the `db` extension's distributed engine
(gossip membership, shuffle registry, and Arrow Flight transport under
`plugins/db/src/`).

## A GraphQL query (PostGraphile path)

```mermaid
sequenceDiagram
    participant Client
    participant Express
    participant AuthCtx as authContext middleware
    participant PG as PostgreSQL
    participant PostGraphile

    Client->>Express: POST /trex/graphql<br/>Authorization: Bearer ...
    Express->>AuthCtx: Validate JWT, set pgSettings
    AuthCtx-->>Express: { app.user_id, app.user_role }
    Express->>PostGraphile: Forward request with pgSettings
    PostGraphile->>PG: SET LOCAL app.user_id = ...<br/>SET LOCAL app.user_role = ...
    PostGraphile->>PG: Generated SQL (joins, filters, pagination)
    PG-->>PostGraphile: Rows
    PostGraphile-->>Client: GraphQL response
```

Custom mutations (the `pluginOperationsPlugin` operations like
`installPlugin`, `transformRun`, `runPluginMigrations`) intercept this path
and dispatch to the engine, the plugin loader, or external services as
appropriate. Most of those mutations enforce `app.user_role = 'admin'` — see
[Concepts → Auth Model](auth-model) for the broader story.

## An edge function calling SQL

```mermaid
sequenceDiagram
    participant Client
    participant Express
    participant Worker as Deno worker
    participant Runtime as runtime extension
    participant Pool as pool extension
    participant Engine as Trex Engine

    Client->>Express: POST /trex/functions/v1/my-fn
    Express->>Worker: Forward request via Deno EdgeRuntime
    Worker->>Worker: User code: const conn = new Trex.TrexDB("memory")
    Worker->>Runtime: conn.execute(sql, params)
    Runtime->>Pool: Borrow connection (with auto-pin if needed)
    Pool->>Engine: Execute
    Engine-->>Pool: Result
    Pool-->>Runtime: Result
    Runtime-->>Worker: Result
    Worker-->>Express: Response
    Express-->>Client: HTTP response
```

The function's connection lives only as long as the worker invocation. If the
function uses `ATTACH` or temp tables, those persist across statements within
the same invocation (via the persistent-session path) but are torn down when
the worker exits.

## Failure modes worth knowing

- **Pool exhaustion**: if every pool connection (`TREX_POOL_SIZE`, default 64)
  is held by a long-lived session, new leases wait up to
  `TREX_POOL_LEASE_TIMEOUT_MS` (default 30s) and then error. Admission control
  (see `trex_db_query_status()`) typically bites before this matters in
  practice, but it's the next thing to investigate when concurrency stalls.
- **Federation latency**: a query against a federated source is bounded by
  that source's response time. Push as much filtering and projection into the
  scan as possible — the engine handles `WHERE` and `SELECT` pushdown for
  most federated extensions.
- **Cross-cluster Flight failures**: a worker node going dark mid-query
  surfaces as a Flight stream error in the coordinator. The coordinator does
  not retry; the client sees an error and re-issues.

## Next steps

- [Concepts → Connection Pool](connection-pool) for the borrow strategy in
  more depth.
- [SQL Reference → db](../sql-reference/db) for the distributed-query SQL
  surface.
- [Quickstart: Run a distributed cluster](../quickstarts/distributed-cluster)
  for a working two-node setup.
