---
sidebar_position: 1
---

# Docker Deployment

Trex is published as a single multi-arch Docker image
(`ghcr.io/ohdsi/trexsql:latest`) that bundles the `trex` Rust binary, the
auto-loaded extensions, the Deno-based core management application, and the web
frontend. The default stack runs a two-node cluster plus its supporting
services. The repository ships several compose files for different scenarios.

## Compose Files

| File | Purpose |
|------|---------|
| `docker-compose.yml` | Default stack: a two-node Trex cluster (`trex-data` + `trex-server`) on Postgres 16, plus a Studio sidecar. The REST API and Realtime are served in-process on `trex-server` (`@trex/postgrest` plugin / native Realtime). Uses the published image. |
| `docker-compose.dev.yml` | Development overlay. Collapses to a single-node `trex` service and live-mounts `core/server`, `core/event`, `functions`, and the prebuilt `plugins/web/dist`, `plugins/notebook/dist`, `plugins/storage`, and `plugins/postgrest` directories so changes take effect without rebuilding. |
| `docker-compose.dx.yml` | Standalone devx stack: a single-node trex with the devx plugin and `devx_ext` extension baked into a dedicated image (`ghcr.io/ohdsi/trexsql-dx:latest`). Runs alongside the default stack (ports offset +1000 on HTTP / +20 on pg). |
| `docker-compose.pg-trex.yml` | Replaces vanilla Postgres with the `pg-trex` image (Postgres + the Trex extensions co-located in one process). Uses gossip port `7946`. |

## Secrets

The only secret operators set directly is `POSTGRES_PASSWORD`. All cryptographic
keys are generated on first boot by the one-shot `trex-init` service, which
writes `./secrets/root.env` (the `TREX_ROOT_KEY` root secret) and
`./secrets/derived.env` (all per-service subkeys derived from it). Every other
service consumes those files via `env_file:` (`required: false`) and gates on
`trex-init` completing.

Mount `./secrets` as a secret-grade volume in production and back it up — losing
`root.env` invalidates every encrypted secret in `trexdb.{secret,database_credential}`
and every issued JWT. See [Secret Rotation](../operations/secret-rotation) for
the derivation model.

## Quick Start

```bash
docker compose up -d
```

This starts:

- **trex-init** — one-shot key generator. Writes `./secrets/{root,derived}.env`
  and exits, gating every other service.
- **postgres** (`postgres:16`) — application metadata + the auth schema. Started
  with `wal_level=logical` (and bumped replication-slot / WAL-sender limits) for
  Realtime. Published on host port `65433`.
- **trex-data** — the data node. Holds the analytical pool and serves Arrow
  Flight SQL on `50051` (internal only). Runs the schema migrations.
- **trex-server** — the non-data node. Serves the web/MCP/REST/GraphQL/Realtime
  HTTP surface on `8001`, the TLS variant on `8000`, and the pgwire endpoint on
  `5433`. Opens remote sessions to `trex-data`. Realtime runs **in-process**
  here (Phoenix-channels at `/trex/realtime/v1/*`) — there is no separate
  Realtime container.
- **studio** — the Supabase Studio sidecar (internal only; Trex proxies
  `/plugins/trex/studio/**` to it).

The PostgREST-compatible REST API at `${BASE_PATH}/rest/v1/*` is served
**in-process** on `trex-server` by the `@trex/postgrest` plugin (configured via
the `PGRST_*` environment variables on the server container).

The two nodes auto-converge: gossip seeds are derived from the `nodes` map in
`SWARM_CONFIG`. `trex-data` advertises Flight under its gossip host so the server
gets a routable endpoint.

## Published Ports

| Host | Container | Service |
|------|-----------|---------|
| `8001` | `8001` | HTTP — Web UI, GraphQL, REST proxy, MCP, edge functions, auth (on `trex-server`). |
| `8000` | `8000` | HTTPS — TLS-terminated variant of the same surface. |
| `5433` | `5432` | pgwire — Postgres-compatible wire protocol into the analytical engine. |
| `65433` | `5432` | Postgres metadata DB. |

Arrow Flight SQL (`50051`) and gossip cluster membership (default `4200`) are
**not** published by the default compose file — they are cluster-internal. The
two nodes reach each other over the compose network.

## Default `docker-compose.yml`

The base file uses a shared `SWARM_CONFIG` YAML anchor (`x-swarm-config`) that
defines both nodes — `data` (Flight on `50051`, `data_node: true`) and `server`
(trexas on `8001`/`8000` + pgwire on `5432`, `data_node: false`). Each service
selects its identity with `SWARM_NODE` and loads its secrets from
`./secrets/{root,derived}.env`. The accurate excerpt:

```yaml
x-swarm-config: &swarm-config
  SWARM_CONFIG: >-
    {"cluster_id":"local","nodes":{
      "data":{
        "gossip_addr":"trex-data:4200","data_node":true,
        "extensions":[
          {"name":"flight","config":{"host":"0.0.0.0","port":50051}}
        ]},
      "server":{
        "gossip_addr":"trex-server:4200","data_node":false,
        "extensions":[
          {"name":"trexas","config":{"host":"0.0.0.0","port":8001,"main_service_path":"/usr/src/core/server/index.eszip","event_worker_path":"/usr/src/core/event/index.eszip","tls_port":8000,"tls_cert_path":"/usr/src/server.crt","tls_key_path":"/usr/src/server.key"}},
          {"name":"pgwire","config":{"host":"0.0.0.0","port":5432}}
        ]}
    }}

services:
  postgres:
    image: postgres:16
    ports:
      - 65433:5432
    command:
      - postgres
      - -c
      - wal_level=logical
      - -c
      - max_replication_slots=10
      - -c
      - max_wal_senders=10
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-mypass}

  trex-server:
    image: ghcr.io/ohdsi/trexsql:latest
    ports:
      - 8000:8000
      - 8001:8001
      - 5433:5432
    env_file:
      - path: ./secrets/root.env
        required: false
      - path: ./secrets/derived.env
        required: false
    environment:
      <<: *swarm-config
      SWARM_NODE: server
      DATABASE_URL: postgres://postgres:${POSTGRES_PASSWORD:-mypass}@postgres:5432/testdb
      # Consumed by the in-process @trex/postgrest plugin;
      # PGRST_JWT_SECRET comes from derived.env.
      PGRST_DB_URI: postgres://authenticator:authenticator_pass@postgres:5432/testdb
      PGRST_DB_SCHEMAS: public
      PGRST_DB_ANON_ROLE: anon
```

There is **no** standalone `trex` service in the base file — that exists only in
`docker-compose.dev.yml`. `PGRST_JWT_SECRET` is not a literal; it is sourced from
`./secrets/derived.env`. See the real
[`docker-compose.yml`](https://github.com/OHDSI/trex/blob/main/docker-compose.yml)
for the full definition.

## Development Overlay

For live source mounts during plugin / server development:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

The overlay defines a single-node `trex` service and bind-mounts `./core/server`,
`./core/event`, `./functions`, and the prebuilt `./plugins/web/dist`,
`./plugins/notebook/dist`, `./plugins/storage`, and `./plugins/postgrest` into
the container so edits on the host take effect without rebuilding.

## Services Started by Default

The Rust `trex` binary boots the engine, loads every `*.trex` /
`*.duckdb_extension` in `EXTENSION_DIR` (default `/usr/lib/trexsql/extensions`),
then iterates the `extensions` array for its `SWARM_NODE` in `SWARM_CONFIG` to
start service extensions:

- **flight** (on `trex-data`) — the Arrow Flight SQL service on `:50051`. The
  data node holds the analytical pool.
- **trexas** (on `trex-server`) — the core HTTP server (Express + Deno). Mounts
  the web UI, GraphQL, GraphiQL, MCP, edge functions, REST proxy, and auth on
  `:8001` (HTTP) and `:8000` (HTTPS).
- **pgwire** (on `trex-server`) — Postgres wire protocol on `:5432` (published as
  host `:5433`).

## Dockerfile

The image is built in multiple stages:

1. **builder** (`debian:trixie-slim`) — Installs Rust 1.88, downloads the pinned
   `libtrexsql.so` from `github.com/p-hoffmann/trexsql-rs` (and `libchdb.so`),
   then builds the `trex` binary with cached dependency layers.
2. **web-builder** (`node:22-trixie-slim`) — Builds the admin web UI (`plugins/web`).
3. **notebook-builder** (`node:22-trixie-slim`) — Builds the React notebook bundle
   (`plugins/notebook`).
4. **docs-builder** (`node:22-trixie-slim`) — Builds the Docusaurus docs site.
5. **pg-meta-builder** (`node:22-trixie-slim`) — Builds `postgres-meta` (TypeScript → `dist/`).
6. **studio-builder** (`node:22-trixie-slim`) — Builds the Studio Next.js static export.
7. **runtime** (`node:22-trixie-slim`) — Installs Deno and the runtime
   dependencies, copies the artefacts from the previous stages, fetches the
   npm-distributed and official DuckDB extensions into the extensions dir,
   pre-bundles the core Deno workers into eszips, and sets `trex` as the entry
   point.

The `TREXSQL_VERSION` (`v1.4.4-trex`) and `CHDB_VERSION` (`v3.6.0`) build args
pin the upstream native libraries.

## Accessing Services

| Service | URL |
|---------|-----|
| Web UI | http://localhost:8001/trex/ |
| GraphiQL | http://localhost:8001/trex/graphiql (set `ENABLE_GRAPHIQL=true`) |
| Documentation | http://localhost:8001/trex/docs/ |
| MCP | http://localhost:8001/trex/mcp |
| REST (PostgREST-compatible, served by `@trex/postgrest`) | http://localhost:8001/trex/rest/v1 |
| Postgres metadata | `postgresql://postgres:mypass@localhost:65433/testdb` |
| pgwire (analytical engine) | `postgresql://localhost:5433/main` |
| HTTPS (self-signed) | https://localhost:8000/trex/ |

For cloud-managed deployments, see [`deploy/`](https://github.com/OHDSI/trex/tree/main/deploy)
which uses Pulumi to provision Trex on AWS ECS Fargate or Azure Container Apps.
