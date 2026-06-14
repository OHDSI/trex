---
sidebar_position: 2
---

# Multi-Source Analytics

This tutorial federates three different data sources, joins them in a
single SQL query, materialises a daily rollup with the `transform`
extension, and serves the result over HTTP. The point: in a single Trex
container, you can do "modern data stack" work — federate, model, serve —
without standing up Fivetran + dbt + a serving layer.

By the end you'll have:

- A Postgres OLTP source attached as a federated catalog.
- Parquet logs in S3 read in place via httpfs.
- An SAP HANA reference table attached.
- A daily-rollup transform model joining all three.
- A JSON / CSV HTTP endpoint that downstream clients consume.

```mermaid
flowchart LR
    PG["Postgres<br/>(orders)"]
    S3["S3 / MinIO<br/>(parquet logs)"]
    HANA["SAP HANA<br/>(reference data)"]

    PG -->|ATTACH| Trex
    S3 -->|read_parquet| Trex
    HANA -->|trex_hana_attach| Trex

    Trex --> Transform["transform plugin<br/>(daily rollup)"]
    Transform --> Endpoint["GET /plugins/transform/...<br/>JSON / CSV"]
```

Prerequisites:

- [Quickstart: Deploy](../quickstarts/deploy) running.
- A Postgres database reachable from the Trex container (the metadata
  Postgres at `:65433` in the default compose works as a stand-in).
- An S3 bucket (or local MinIO) with one or more Parquet files. For the
  walkthrough, we generate sample data locally.
- *(Optional)* A SAP HANA Express container if you want to exercise the
  HANA path. Skip section 3 otherwise — the rest of the tutorial still
  works with two sources.

## 1. Set up the Postgres source (5 min)

In the metadata Postgres, create a small `orders` table:

```bash
psql -h localhost -p 65433 -U postgres -d testdb
```

```sql
CREATE TABLE public.orders (
  order_id    INT PRIMARY KEY,
  customer_id INT NOT NULL,
  region_code TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL,
  placed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.orders
SELECT
  i,
  (i % 1000)::int,
  (ARRAY['EMEA','APAC','NAM'])[(i % 3) + 1],
  (random() * 500)::NUMERIC(10,2),
  NOW() - (i || ' minutes')::interval
FROM generate_series(1, 50000) AS t(i);
```

## 2. Generate Parquet logs in S3 (5 min)

For a self-contained walkthrough, write Parquet directly from Trex onto a
local MinIO instance. Add a MinIO container alongside Trex:

```yaml
# docker-compose.yml
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
```

:::note Networking precondition
The `ENDPOINT 'minio:9000'` value below only resolves from inside the Trex
container if both containers share a docker network where `minio` is the
hostname. Two ways to get there:

- **Same compose project (easiest):** put the `minio` service in the same
  `docker-compose.yml` as Trex. Compose's default network puts both
  containers on it, with the service name `minio` resolving to the
  container. (To exec into the Trex node, use the service name, e.g.
  `docker compose exec trex-server …` — container names vary by project.)
- **Separate compose projects:** create a shared user-defined network
  (`docker network create trex-shared`) and add `networks: [trex-shared]`
  to both the Trex and MinIO services in their respective compose files.

If MinIO is running on the Docker host instead of in a container, replace
`minio:9000` with `host.docker.internal:9000` (Linux requires
`extra_hosts: ["host.docker.internal:host-gateway"]` on the Trex service).
:::

Then from `psql -h localhost -p 5433 -U trex -d main`:

```sql
-- Configure S3 credentials for Trex
INSTALL httpfs;
LOAD httpfs;

CREATE OR REPLACE SECRET s3_secret (
  TYPE S3,
  KEY_ID 'minioadmin',
  SECRET 'minioadmin',
  ENDPOINT 'minio:9000',
  URL_STYLE 'path',
  USE_SSL false
);

-- Generate sample log events and write as Parquet
COPY (
  SELECT
    i AS event_id,
    (i % 1000)::int AS user_id,
    'click_' || (i % 5)::text AS event_type,
    NOW() - (i || ' seconds')::interval AS ts
  FROM range(1, 1000000) t(i)
)
TO 's3://logs/2026-05-07/events.parquet' (FORMAT PARQUET);
```

Verify the read path:

```sql
SELECT COUNT(*) FROM read_parquet('s3://logs/*/events.parquet');
```

## 3. Attach SAP HANA reference data (5 min — optional)

If you have HANA Express running, populate a small `region_meta` table:

```sql
-- On HANA, in schema CDM:
CREATE TABLE CDM.REGION_META (
  region_code NVARCHAR(8) PRIMARY KEY,
  region_name NVARCHAR(64),
  population  BIGINT
);
INSERT INTO CDM.REGION_META VALUES
  ('EMEA', 'Europe / Middle East / Africa', 2700000000),
  ('APAC', 'Asia Pacific',                  4400000000),
  ('NAM',  'North America',                 580000000);
```

In Trex:

```sql
SELECT * FROM trex_hana_attach(
  'hdbsqls://user:pass@hana:39015/HDB?insecure_omit_server_certificate_check',
  'hana_db',
  'CDM'
);
-- Now hana_db.CDM.REGION_META is queryable
```

If you skip HANA, hand-create the equivalent in Trex:

```sql
CREATE TABLE memory.main.region_meta (
  region_code TEXT PRIMARY KEY,
  region_name TEXT,
  population  BIGINT
);
INSERT INTO memory.main.region_meta VALUES
  ('EMEA', 'Europe / Middle East / Africa', 2700000000),
  ('APAC', 'Asia Pacific',                  4400000000),
  ('NAM',  'North America',                 580000000);
```

## 4. Federate them in one query (5 min)

Attach Postgres so `orders` is queryable:

```sql
ATTACH 'postgresql://postgres:mypass@postgres:5432/testdb'
  AS pg (TYPE postgres);
```

Now write a query that touches all three. Materialise the TIMESTAMPTZ
cast in a CTE first (see the caution below):

```sql
WITH orders_local AS (
  SELECT order_id, customer_id, region_code, amount, placed_at::TIMESTAMP AS placed_at
    FROM pg.public.orders
   WHERE placed_at::TIMESTAMP >= (NOW() - INTERVAL '24 hours')::TIMESTAMP
)
SELECT
  r.region_name,
  DATE_TRUNC('hour', o.placed_at) AS hour,
  COUNT(DISTINCT l.user_id)         AS active_users,
  COUNT(DISTINCT o.order_id)        AS orders,
  SUM(o.amount)                     AS revenue
FROM orders_local o
JOIN hana_db.CDM.REGION_META r           -- or memory.main.region_meta
  ON r.region_code = o.region_code
JOIN read_parquet('s3://logs/*/events.parquet') l
  ON l.user_id = o.customer_id
 AND l.ts BETWEEN o.placed_at - INTERVAL '1 hour' AND o.placed_at
GROUP BY r.region_name, hour
ORDER BY hour DESC, revenue DESC;
```

:::caution pg-scanner TIMESTAMPTZ caveat
Cast TIMESTAMPTZ from federated Postgres into a local CTE before applying
`DATE_TRUNC` or other temporal functions. A bare cast in the SELECT
projection still crashes the engine in the current image; materialising
the cast in a CTE works around the bug. The same applies to interval
arithmetic: `NOW() - INTERVAL '24 hours'` against a federated TIMESTAMPTZ
fails the binder (`No function matches '-(TIMESTAMP WITH TIME ZONE,
INTERVAL)'`), so cast both sides to TIMESTAMP as shown.
:::

Three sources, one query, planner pushes filters and projections into each.
This is the "consolidated stack" demo: no Fivetran, no dbt-in-process, no
ETL plumbing — just SQL.

## 5. Materialise as a transform model (10 min)

Ad-hoc federated queries are flexible but pay the federation cost on every
read. For repeated reads, materialise into a daily rollup with the
`transform` extension.

Create a minimal transform plugin under `plugins-dev/`:

```bash
mkdir -p plugins-dev/@trex/sales-mart/project/models
```

`plugins-dev/@trex/sales-mart/package.json`:

```json
{
  "name": "@trex/sales-mart",
  "version": "0.1.0",
  "trex": {
    "transform": {}
  }
}
```

:::tip Transform-only plugins skip the Deno workspace
A transform-only plugin (no `trex.functions` block) loads cleanly without a
`deno.json` — the Deno workspace-membership regression that affects
function workers does not affect transform-only plugins.
:::

Add a `project.yml` so the transform engine can discover the project. Without
it, `trex_transform_run` errors with `project.yml not found`:

```bash
cat > plugins-dev/@trex/sales-mart/project/project.yml <<'EOF'
name: sales_mart
models_path: models
EOF
```

`plugins-dev/@trex/sales-mart/project/models/daily_revenue_by_region.sql`:

```sql
WITH orders_local AS (
  SELECT order_id, customer_id, region_code, amount, placed_at::TIMESTAMP AS placed_at
    FROM pg.public.orders
)
SELECT
  r.region_name,
  DATE_TRUNC('day', o.placed_at) AS day,
  COUNT(DISTINCT l.user_id)       AS active_users,
  COUNT(DISTINCT o.order_id)      AS orders,
  SUM(o.amount)                   AS revenue
FROM orders_local o
JOIN memory.main.region_meta r
  ON r.region_code = o.region_code
JOIN read_parquet('s3://logs/*/events.parquet') l
  ON l.user_id = o.customer_id
 AND l.ts BETWEEN o.placed_at - INTERVAL '1 hour' AND o.placed_at
GROUP BY r.region_name, day
```

Model config goes in a sidecar `<model>.yml` next to the `.sql` — SQL-comment
configs (Jinja-style `{{ config(...) }}`) are not parsed by the transform
engine and are silently ignored.

`plugins-dev/@trex/sales-mart/project/models/daily_revenue_by_region.yml`:

```yaml
materialized: table
endpoint:
  path: /daily-revenue
  roles: [admin]
  formats: [json, csv]
```

Plugins under `plugins-dev/` are only bind-mounted when the dev compose
overlay is enabled. Bring the stack up with the overlay, then restart the
Trex service so the plugin is picked up — the `-f` flags must be repeated on
every `docker compose` call:

```bash
# enable the dev overlay (exposes plugins-dev/ as a bind mount)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# reload the plugin
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart trex
```

Then run the model. **Use the GraphQL `transformRun` mutation** — it
materialises the table *and* registers the HTTP endpoint by writing a row to
`trexdb.transform_deployment` and calling `registerTransformEndpoints`:

```bash
TOKEN=trex_...
curl -X POST http://localhost:8001/trex/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { transformRun(pluginName: \"sales-mart\", destDb: \"memory\", destSchema: \"analytics\", sourceDb: \"memory\", sourceSchema: \"main\") { name action durationMs } }"}'
```

:::caution GraphQL vs SQL — they are not equivalent
The SQL function `trex_transform_run` only materialises the table. It does
**not** register the HTTP endpoint, because endpoint registration lives in
the GraphQL resolver path (`transform_deployment` + `registerTransformEndpoints`).
Use the SQL form only as a lower-level alternative for ad-hoc materialisation
when you don't need the HTTP endpoint:

```sql
SELECT * FROM trex_transform_run(
  '/usr/src/plugins-dev/@trex/sales-mart/project',
  'analytics',                  -- destination schema
  source_schema := 'main'       -- source schema for source() refs (named)
);
```

The third argument **must** be passed as a named argument
(`source_schema := ...`); positional won't bind. If you only run the SQL
function, Step 6 below (Serve as JSON) will 404 — run the GraphQL mutation
first.
:::

## 6. Serve it as JSON (3 min)

Because the model declared `endpoint_path='/daily-revenue'`, the transform
plugin loader auto-mounted it as an HTTP endpoint:

```bash
curl "http://localhost:8001/plugins/transform/sales-mart/daily-revenue?format=json" \
  -H "Authorization: Bearer $TOKEN"
```

Switch to CSV by changing `?format=csv` (for spreadsheet exports).

| Format | Best for                            |
| ------ | ----------------------------------- |
| json   | Web clients, scripts.               |
| csv    | Spreadsheets, batch export.         |

Arrow output is not currently registered (`?format=arrow` returns
`400 Unsupported format`). JSON and CSV are supported.

## 7. Visualise it (5 min)

Any external tool that can hit a JSON / CSV URL works. A two-line Grafana
setup with the [Infinity datasource](https://grafana.com/grafana/plugins/yesoreyeram-infinity-datasource/):

1. Add a datasource of type "Infinity".
2. Add a panel with query type **JSON URL**, URL set to the endpoint above,
   include the `Authorization` header.

Metabase, Hex, Superset, Observable, etc. all work the same way — the
endpoint is plain authenticated HTTP.

For a self-contained one-off, a 30-line static HTML page using
[Chart.js](https://www.chartjs.org/):

```html
<!doctype html>
<canvas id="chart" width="800" height="400"></canvas>
<script type="module">
  import Chart from "https://cdn.jsdelivr.net/npm/chart.js@4/+esm";

  const TOKEN = "trex_...";
  const res = await fetch(
    "http://localhost:8001/plugins/transform/sales-mart/daily-revenue?format=json",
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  const rows = await res.json();

  const datasets = {};
  for (const r of rows) {
    if (!datasets[r.region_name]) {
      datasets[r.region_name] = { label: r.region_name, data: [] };
    }
    datasets[r.region_name].data.push({ x: r.day, y: r.revenue });
  }

  new Chart(document.getElementById("chart"), {
    type: "line",
    data: { datasets: Object.values(datasets) },
    options: { scales: { x: { type: "time" } } },
  });
</script>
```

## 8. Schedule freshness checks (2 min)

For production, you want to know when the rollup goes stale. The
`transform_freshness` query reports per-source lag against thresholds
declared in `sources.yml`. Inline `warn_after` / `error_after` /
`loaded_at_field` in SQL comments are ignored — freshness config lives in
a top-level `sources.yml` next to `project.yml`:

```yaml
# plugins-dev/@trex/sales-mart/project/sources.yml
sources:
  - name: daily_revenue_by_region
    loaded_at_field: day
    warn_after: { count: 1, period: day }
    error_after: { count: 2, period: day }
```

Then poll periodically. `transformFreshness` takes the destination
catalog/schema (it returns one row per source declared for that plugin):

```graphql
query {
  transformFreshness(
    pluginName: "sales-mart"
    destDb: "memory"
    destSchema: "analytics"
  ) {
    name
    status
    ageHours
    maxLoadedAt
  }
}
```

```bash
curl -X POST http://localhost:8001/trex/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { transformFreshness(pluginName: \"sales-mart\", destDb: \"memory\", destSchema: \"analytics\") { name status ageHours maxLoadedAt } }"}'
```

Pipe the `error` rows into your alerting system.

## What you built

A federated analytical pipeline:

- Three independent sources (Postgres, S3, HANA) attached without copying.
- An ad-hoc cross-source query for exploration.
- A version-controlled transform model materialising the daily rollup.
- A JSON / CSV HTTP endpoint backing a dashboard.
- Freshness monitoring closing the loop.

The whole thing is one Trex container. No Airflow, no Fivetran, no
separate semantic layer.

## Next steps

- [Tutorial: Incremental Data Warehouse](incremental-data-warehouse) for
  CDC-driven incremental refresh instead of periodic re-runs.
- [SQL Reference → transform](../sql-reference/transform) for the model
  config syntax (`incremental`, `unique_key`, etc.).
- [Concepts → Query Pipeline](../concepts/query-pipeline) for what gets
  pushed down to each source vs. streamed to the engine.
