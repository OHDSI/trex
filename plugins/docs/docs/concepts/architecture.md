---
sidebar_position: 1
---

# Architecture

Trex is built around three layers that share one process tree: an analytical
column-store engine (Rust), a Deno-based core management server, and a plugin
system that lets third parties contribute UIs, APIs, flows, migrations, and
data transforms.

## Process Layout

```mermaid
flowchart TD
    subgraph Clients["Clients"]
        Browser["Browser / Admin UI"]
        Psql["psql / JDBC"]
        AI["MCP Client (Claude, etc.)"]
        CLI["trex CLI"]
    end

    subgraph Frontend["Trex HTTP Surface"]
        WebUI["Web UI · /trex/"]
        GraphQL["GraphQL · /trex/graphql"]
        REST["REST · /trex/rest/v1"]
        MCP["MCP · /trex/mcp"]
        Pgwire["pgwire · :5433"]
        FunctionsAPI["Edge Functions · /trex/functions/v1/*"]
    end

    subgraph Server["Core Server (Deno + Express)"]
        Auth["Auth (GoTrue-compat)"]
        PostGraphile["PostGraphile"]
        MCPServer["MCP Server"]
        PluginSys["Plugin System"]
        FuncRuntime["Edge Function Runtime"]
    end

    subgraph Plugins["Plugin Types"]
        Functions
        UI
        Flows
        Migrations
        Transforms
    end

    subgraph Data["Data Layer"]
        PostgreSQL["PostgreSQL (metadata)"]
        Engine["Trex Engine"]
        PostgREST["@trex/postgrest (REST)"]
    end

    subgraph SqlExtensions["SQL Extensions"]
        db & tpm & hana & pgwire & chdb
        etl & fhir & migration & transform
        ai & atlas & cql2elm
    end

    subgraph InfraExtensions["Infra (C-API libraries)"]
        pool & runtime
    end

    Browser --> WebUI
    Browser --> GraphQL
    AI --> MCP
    CLI --> FunctionsAPI
    Psql --> Pgwire

    Frontend --> Server
    Server --> Plugins
    Server --> Data
    Engine --> SqlExtensions
    Engine --> InfraExtensions
    PostgREST --> PostgreSQL
```

The Rust binary (`trex`) is the process entry point. It opens a Trex catalog,
loads every `*.trex` extension out of `EXTENSION_DIR`, and starts the services
declared in `SWARM_CONFIG` — typically `trexas` (the HTTP server hosting the
core management application) and `pgwire` (the Postgres wire-protocol server).
The core server, in turn, scans plugin directories and mounts whatever each
plugin contributes.

> **Loadable-extension names vs. directory names.** A few extensions load under
> a core name that differs from their `plugins/<dir>` folder. The mapping comes
> from each plugin's `trex.core.name` in `package.json`: `runtime` → `as`,
> `atlas` → `circe`, `hana` → `hana_scan`, `devx-ext` → `devx_ext`. Most others
> (`pool`, `db`, `cache`, `hades`, `webapi`, `fhir`, …) keep their directory
> name.

## Three Layers

### 1. Analytical Engine

The column-store engine ships as a Rust library (`libtrexsql`, a fork of DuckDB
maintained at `p-hoffmann/trexsql-rs`) plus extensions. Extensions add
capabilities without touching the engine's core: federated catalogs,
domain-specific runtimes, and protocol servers. See [SQL Reference](../sql-reference/db)
for the user-facing extensions and [Concepts → Connection Pool](connection-pool)
for the infrastructure ones.

### 2. Core Server

The core server (`core/server/`, Deno + Express + PostGraphile) hosts the
application surface: auth, GraphQL, REST, MCP, edge functions, the plugin
loader, and a Supabase-CLI-compatible management API. The REST surface at
`/trex/rest/v1` is a PostgREST-compatible API served **in-process** by the
`@trex/postgrest` function plugin, which connects directly to PostgreSQL.
PostgreSQL (separate from
the Trex engine) backs auth and configuration state. See
[APIs](../apis/graphql) for endpoint references and [Concepts → Auth Model](auth-model)
for the auth narrative.

### 3. Plugins

Plugins are NPM packages with a `trex` block in `package.json`. Each plugin can
contribute a mix of UI assets, function workers, Prefect flows, schema
migrations, and dbt-like transformation projects. The bundled image already
ships a few — `web` (admin UI), `docs` (this site), `notebook`, `storage`
(Supabase Storage fork), `pg-meta` (postgres-meta fork), `studio` (Supabase
Studio wrapper), `devx` (AI code editor), and `fhir-fn`. See
[Concepts → Plugin System](plugin-system) for how plugins are discovered and
loaded; see [Plugins](../plugins/overview) for the per-type reference.

## Cluster Topology

A multi-node deployment uses a gossip protocol for membership and Arrow Flight
SQL for data transport. The default compose stack runs a single node — you must
opt in by extending `SWARM_CONFIG` to add the `flight` extension and additional
nodes.

```mermaid
flowchart LR
    Client["Client"] --> Coord

    subgraph Node1["Node 1 (Coordinator)"]
        Coord["Coordinator"]
        G1["Gossip"]
        F1["Flight SQL"]
        E1["Engine"]
        Coord --> E1
        Coord --> F1
    end

    subgraph Node2["Node 2"]
        G2["Gossip"]
        F2["Flight SQL"]
        E2["Engine"]
    end

    subgraph Node3["Node 3"]
        G3["Gossip"]
        F3["Flight SQL"]
        E3["Engine"]
    end

    G1 <-.->|gossip| G2
    G2 <-.->|gossip| G3
    G1 <-.->|gossip| G3

    F1 <-->|Arrow Flight| F2
    F1 <-->|Arrow Flight| F3
```

See [Quickstart: Run a distributed cluster](../quickstarts/distributed-cluster)
for a hands-on walkthrough and [Deployment → Distributed Mode](../deployment/distributed)
for production guidance.

## Extension Catalog

Extensions live in `plugins/` and ship as `*.trex` files inside the runtime
image. Some are user-facing (you call their SQL functions); others are
infrastructure (consumed by other extensions, never directly by you).

| Extension | Type | Purpose |
|-----------|------|---------|
| [db](../sql-reference/db) | SQL | Distributed clustering, gossip, Arrow Flight, query admission, partitioning. |
| [tpm](../sql-reference/tpm) | SQL | NPM-based plugin package manager. |
| [hana](../sql-reference/hana) | SQL | SAP HANA federated reads + writes. |
| [pgwire](../sql-reference/pgwire) | SQL | Postgres wire-protocol server. |
| [chdb](../sql-reference/chdb) | SQL | ClickHouse / chdb integration. |
| [etl](../sql-reference/etl) | SQL | Postgres logical-replication CDC into Trex. |
| [fhir](../sql-reference/fhir) | SQL | FHIR R4 server backed by Trex storage. |
| [migration](../sql-reference/migration) | SQL | Schema-migration runner. |
| [transform](../sql-reference/transform) | SQL | dbt-like SQL model compile / plan / run / seed / test / freshness. |
| [ai](../sql-reference/ai) | SQL | In-process LLM inference via llama.cpp (CPU / CUDA / Vulkan / Metal). |
| [atlas](../sql-reference/atlas) | SQL (`circe`) | OHDSI Atlas cohort JSON → SQL via Circe. |
| [cql2elm](../sql-reference/cql2elm) | SQL | Clinical Quality Language → ELM translator. |
| cache | SQL | Query/result caching extension. |
| hades | SQL | OHDSI HADES R-analytics support. |
| webapi | SQL | Embedded OHDSI WebAPI (`webapi_start`/`stop`/`status`) — runs the full WebAPI stack in-process against Trex/DuckDB. |
| devx-ext (`devx_ext`) | SQL | Native extension backing the `devx` AI code-editor plugin. |
| pool | infra | Shared DuckDB connection pool with a serialized write queue, consumed by `pgwire`, `runtime` (`as`), `db`, `etl`, and other extensions. |
| runtime (`as`) | infra | Trex Deno runtime — host of edge function and plugin loaders. |

## Default Service Endpoints

With the default `BASE_PATH=/trex`, a single-node deployment exposes:

| Endpoint | URL |
|----------|-----|
| Web UI | http://localhost:8001/trex/ |
| GraphQL | http://localhost:8001/trex/graphql |
| GraphiQL | http://localhost:8001/trex/graphiql (set `ENABLE_GRAPHIQL=true`) |
| REST | http://localhost:8001/trex/rest/v1 |
| MCP | http://localhost:8001/trex/mcp |
| Edge Functions | http://localhost:8001/trex/functions/v1/&lt;slug&gt; |
| Storage | http://localhost:8001/trex/storage/v1 |
| pg-meta | http://localhost:8001/trex/pg/v1 |
| TLS | https://localhost:8000/trex/ |
| pgwire | `postgresql://localhost:5433/main` |
| Postgres metadata | `postgresql://localhost:65433/testdb` |

## Next steps

- New here? Run the [5-minute deploy quickstart](../quickstarts/deploy).
- Curious how requests flow? See [Concepts → Query Pipeline](query-pipeline).
- Building a plugin? Read [Concepts → Plugin System](plugin-system) then
  [Tutorial: Build a plugin](../tutorials/build-a-plugin).
