# Trex

A self-hosted backend platform that combines a Supabase-compatible API surface with an embedded analytical column-store, packaged as a single binary.

Trex preserves the Supabase wire contracts for Auth, REST, and Functions, so existing clients and tooling work unchanged. On top of that it embeds an analytical engine you can point at Parquet on S3, BigQuery, ClickHouse, another Postgres, and other sources — queried in the same SQL as your application data.

## Running Trex

The published image is `ghcr.io/p-hoffmann/trexsql:latest`. The easiest way to run a full stack (Trex + Postgres + PostgREST + Realtime) is via the provided compose file:

```bash
git clone https://github.com/OHDSI/trex.git
cd trex
docker compose up -d
```

Edit the `environment:` blocks in `docker-compose.yml` to set JWT secrets, S3 credentials, and any other configuration before starting in a real deployment.

Once up, Trex listens on:

- `:8001` / `:8000` (TLS): HTTP for the web UI, edge functions, GraphQL, MCP, auth
- `:5433`: Postgres wire protocol (`psql`, JDBC, `pg_dump`)

## What you get

- **Auth**: signup, sign-in, magic links, OAuth/OIDC, sessions, API keys.
- **REST** auto-generated over Postgres at `/trex/rest/v1`.
- **GraphQL** auto-generated over Postgres at `/trex/graphql`, with subscriptions over `LISTEN`/`NOTIFY`.
- **Edge functions** with an encrypted secrets store.
- **Analytical engine**: federate across Postgres, MySQL, BigQuery, ClickHouse, S3 and others in one SQL statement; read open table formats (Iceberg, Delta, Parquet); full-text, vector, and spatial search.

## Built on

Trex reuses and extends several open-source projects, including Supabase (Storage, Edge Runtime, CLI), DuckDB, Postgres, PostgREST, PostGraphile, and Apache Arrow / DataFusion. Forks are maintained as submodules and retain their upstream licenses.

## License

Apache-2.0.
