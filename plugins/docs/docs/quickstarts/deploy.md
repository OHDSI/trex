---
sidebar_position: 1
---

# Deploy in 5 minutes

This walkthrough takes you from zero to a running Trex stack with an admin
account, a working GraphQL endpoint, and a SQL session into the analytical
engine. It assumes you have **Docker** and **`psql`** (or any Postgres client)
installed.

## 1. Clone and start the stack

```bash
git clone https://github.com/OHDSI/trex.git
cd trex
docker compose up -d
```

The first run pulls the images and starts several services — the data node
(`trex-data`), the API/GraphQL/MCP/pgwire server (`trex-server`), Postgres 16,
PostgREST, Studio, and Realtime. After ~30 seconds the stack is healthy.

```bash
docker compose ps
```

You should see the services in `running (healthy)` state.

## 2. Log in as the admin user

Self-registration is **disabled by default**. A default admin account is
seeded on first boot:

- **Email:** `admin@trex.local`
- **Password:** `password`

Open the admin UI:

```
http://localhost:8001/trex/
```

Log in with those credentials. After login you'll land on the admin
dashboard. **Change the default password** under **Settings** right away —
the seeded credentials are well-known.

:::tip
To let other users sign up themselves, enable `auth.selfRegistration` in the
admin UI's settings (or via the auth config). It's off by default so a fresh
deployment isn't open to public registration.
:::

## 3. Try the GraphQL endpoint

Enable GraphiQL by setting `ENABLE_GRAPHIQL=true` under the `trex-server`
service's `environment:` block in `docker-compose.yml`, then recreate it:

```yaml
# docker-compose.yml
services:
  trex-server:
    environment:
      ENABLE_GRAPHIQL: 'true'
```

```bash
docker compose up -d trex-server
```

Then open:

```
http://localhost:8001/trex/graphiql
```

Try a simple query against the auto-generated schema:

```graphql
query {
  allUsers(first: 5) {
    nodes {
      id
      email
      role
      createdAt
    }
  }
}
```

You should see your admin user.

## 4. Connect to the analytical engine via psql

The pgwire endpoint is published on host port `5433`:

```bash
psql -h localhost -p 5433 -U trex -d main
```

The default password is empty. Once connected, try a federated query:

```sql
-- attach a remote Postgres (use any reachable PG)
ATTACH 'postgresql://postgres:mypass@localhost:65433/testdb' AS pg (TYPE postgres);

-- query across both Trex storage and the attached Postgres
SELECT * FROM pg.public.<some_table> LIMIT 10;
```

For a deeper federation example, see
[Quickstart: Federate a Postgres database](federate-postgres).

## 5. Issue an API key for code access

Back in the admin UI, navigate to **Settings → API Keys** and create a key.
Copy the `trex_…` value — you'll need it for MCP, the CLI, or any
server-to-server integration.

```bash
# example: hit the MCP server with the new key
curl -X POST http://localhost:8001/trex/mcp \
  -H "Authorization: Bearer trex_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

## What just happened

The compose file started several services: Postgres (auth + plugin metadata),
the `trex-data` node (the analytical engine + Arrow Flight transport), the
`trex-server` node (everything else — GraphQL, auth, MCP, pgwire, the
edge-function runtime, and the plugin loader), PostgREST (auto-REST over the
Postgres metadata DB), plus Studio and Realtime. Inside the Trex nodes, the
Rust binary loaded every SQL extension out of `EXTENSION_DIR`, then the
`trexas` HTTP server brought up the Deno-based core management application. See
[Concepts → Architecture](../concepts/architecture) for the full picture.

## Next steps

- **Explore data**: [Quickstart: Federate a Postgres database](federate-postgres).
- **Build something**: [Tutorial: Build a plugin](../tutorials/build-a-plugin).
- **Use the CLI**: [Quickstart: Connect with the CLI](connect-with-cli).
- **Scale out**: [Quickstart: Run a distributed cluster](distributed-cluster).
- **Production deploy**: [Deployment → Docker Compose](../deployment/docker)
  and [Deployment → Environment](../deployment/environment).
