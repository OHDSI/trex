---
sidebar_position: 5
---

# Run a distributed cluster

This walkthrough turns the single-node default deployment into a two-node
cluster. The nodes form a gossip cluster for membership, expose Arrow Flight
SQL endpoints for data transport, and execute cross-node joins through the
distributed query planner.

:::caution
Distributed mode is opt-in and the integration-test tiers (`test_tier1` →
`test_tier8`) are still maturing. Treat this as a development walkthrough —
production guidance lives in [Deployment → Distributed Mode](../deployment/distributed).
:::

## 1. Plan the topology

Two Trex nodes plus one Postgres metadata DB:

```
node-1: trexas, pgwire, flight, gossip seed
node-2: trexas, pgwire, flight, gossip member
postgres: shared metadata DB
```

Both nodes share `DATABASE_URL` (so they see the same plugin config and auth
state) but have separate Trex catalogs.

## 2. Compose file

Create `docker-compose.cluster.yml`:

```yaml
volumes:
  cluster-pgdata:

services:
  postgres:
    image: postgres:16
    ports:
      - 65433:5432
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: mypass
      POSTGRES_DB: testdb
    volumes:
      - cluster-pgdata:/var/lib/postgresql/data
      - ./core/seed.sql:/docker-entrypoint-initdb.d/seed.sql
      - ./core/schema:/docker-entrypoint-initdb.d/schema
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s

  node-1:
    image: ghcr.io/ohdsi/trexsql:latest
    ports:
      - 8001:8001
      - 5433:5432
      - 8815:8815
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://postgres:mypass@postgres:5432/testdb
      TREX_ROOT_KEY: dev-root-key-at-least-32-characters-long!!
      BASE_PATH: /trex
      SCHEMA_DIR: /usr/src/core/schema
      SWARM_NODE: node-1
      SWARM_CONFIG: |
        {"cluster_id":"trex-cluster","nodes":{
          "node-1":{
            "gossip_addr":"0.0.0.0:4200",
            "extensions":[
              {"name":"trexas","config":{"host":"0.0.0.0","port":8001,"main_service_path":"/usr/src/core/server","event_worker_path":"/usr/src/core/event"}},
              {"name":"pgwire","config":{"host":"0.0.0.0","port":5432}},
              {"name":"flight","config":{"host":"0.0.0.0","port":8815}}
            ]
          },
          "node-2":{
            "gossip_addr":"0.0.0.0:4200",
            "seeds":["node-1:4200"],
            "extensions":[
              {"name":"trexas","config":{"host":"0.0.0.0","port":8001,"main_service_path":"/usr/src/core/server","event_worker_path":"/usr/src/core/event"}},
              {"name":"pgwire","config":{"host":"0.0.0.0","port":5432}},
              {"name":"flight","config":{"host":"0.0.0.0","port":8815}}
            ]
          }
        }}

  node-2:
    image: ghcr.io/ohdsi/trexsql:latest
    ports:
      - 8002:8001
      - 5434:5432
      - 8816:8815
    depends_on:
      node-1:
        condition: service_started
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://postgres:mypass@postgres:5432/testdb
      TREX_ROOT_KEY: dev-root-key-at-least-32-characters-long!!
      BASE_PATH: /trex
      SCHEMA_DIR: /usr/src/core/schema
      SWARM_NODE: node-2
      SWARM_CONFIG: <same JSON as node-1>
```

Two Trex services point at the same `SWARM_CONFIG` and pick their identity
via `SWARM_NODE`. `node-2` references `node-1:4200` as a gossip seed.

## 3. Start the cluster

```bash
docker compose -f docker-compose.cluster.yml up -d
docker compose -f docker-compose.cluster.yml ps
```

Wait until both `node-1` and `node-2` are healthy. Tail node-1's logs to
confirm gossip discovery:

```bash
docker compose -f docker-compose.cluster.yml logs -f node-1 | grep gossip
```

You should see `node-2` join the membership list.

## 4. Verify the cluster

Connect to either node's pgwire endpoint and inspect the cluster:

```bash
psql -h localhost -p 5433 -U trex -d main -c "SELECT * FROM trex_db_nodes();"
```

Expected output (something like):

```
 node_id | node_name | gossip_addr      | data_node | status
---------+-----------+------------------+-----------+--------
 abc...  | node-1    | 0.0.0.0:4200     | true      | alive
 def...  | node-2    | 0.0.0.0:4200     | true      | alive
```

## 5. Enable distributed mode

Distributed mode is off by default — turn it on:

```sql
SELECT trex_db_set_distributed(true);
```

Now create a partitioned table:

```sql
CREATE TABLE memory.main.events (
  event_id BIGINT,
  user_id  BIGINT,
  ts       TIMESTAMP,
  payload  JSON
);

SELECT trex_db_partition_table(
  'memory.main.events',
  '{"strategy":"hash","column":"user_id","partitions":4}'
);
```

The `db` extension distributes the four partitions across the two nodes.
Verify:

```sql
SELECT * FROM trex_db_partitions();
```

## 6. Run a distributed query

Insert some data on node-1's pgwire connection:

```sql
INSERT INTO memory.main.events
SELECT i, i % 100, NOW(), '{"sample":true}'::JSON
  FROM range(0, 100000) t(i);
```

Then run a query that aggregates across partitions:

```sql
SELECT user_id, COUNT(*) AS n
  FROM memory.main.events
 GROUP BY user_id
 ORDER BY n DESC
 LIMIT 10;
```

Internally, the coordinator issues partial-aggregate fragments to each node
via Arrow Flight, then merges. See
[Concepts → Query Pipeline → A distributed query](../concepts/query-pipeline)
for the sequence diagram.

## 7. Tear down

```bash
docker compose -f docker-compose.cluster.yml down -v
```

## What just happened

`SWARM_CONFIG` told each node which extensions to start and which gossip seed
to contact. Once gossip converged, the `db` extension's distributed planner
became aware of both data nodes and could plan cross-node joins / aggregates
through Arrow Flight. The shared Postgres metadata DB ensured both nodes saw
the same plugin config and auth state.

## Next steps

- [SQL Reference → db](../sql-reference/db) for every distributed-query SQL
  function (partitioning, query admission, monitoring).
- [Concepts → Query Pipeline](../concepts/query-pipeline) for the planner /
  execution model.
- [Deployment → Distributed Mode](../deployment/distributed) for production
  guidance: TLS for Flight, persistent catalogs per node, multi-AZ
  considerations.
- See `specs/003-ballista-duckdb-distributed/spec.md` in the repo for the
  in-progress technical spec.
