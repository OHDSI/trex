---
sidebar_position: 1
---

# GraphQL API

Trex exposes a GraphQL API via [PostGraphile 5.0](https://postgraphile.org/), which
auto-generates a schema from the configured Postgres schemas and extends it with
custom Trex management operations.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /trex/graphql` | GraphQL query/mutation endpoint. |
| `GET /trex/graphiql` | Interactive GraphiQL IDE. Disabled by default — set `ENABLE_GRAPHIQL=true`. |

WebSocket subscriptions are mounted on the same path using the v4 simple
subscription transport (Postgres `LISTEN`/`NOTIFY`).

## Authentication

GraphQL requests share session-based auth with the rest of the server. The
`authContext` middleware extracts the access token, validates it, and sets the
following on the request, which propagate into every Postgraphile-issued query:

- a Postgres **role** — `anon` (no/invalid auth), `authenticated` (normal user),
  or `service_role` (admin user or `service_role` apikey)
- `app.user_id` — current user ID
- `app.user_role` — current user role (`admin` or `user`)
- `request.jwt.claims` — the full JWT claims

PostGraphile connects as the unprivileged `authenticator` role and issues
`SET LOCAL ROLE` to the resolved role for each request (the same model PostgREST
and Supabase use). The `trexdb` RLS policies — keyed on
`current_setting('app.user_id')` / `app.user_role` — are therefore enforced:

- `authenticated` users see only rows their RLS policies allow (e.g. their own
  `user` / `session` / `account` rows).
- `service_role` (admins, service-role apikey) has `BYPASSRLS` and sees all rows.
- `anon` has schema usage but no table privileges, so unauthenticated requests
  reach the endpoint but read no data.

Custom management operations (below) additionally assert `app.user_role = 'admin'`
at the resolver layer.

## Schema

PostGraphile derives the auto-generated schema from the comma-separated `PG_SCHEMA`
env var (default: `trexdb`). The connection-filter plugin is enabled, so every
Connection field accepts a `condition` / `filter` argument.

The `trexdb` schema includes (among others):

- `user`, `session`, `account`, `verification` — core auth tables
- `role`, `api_key`, `sso_provider` — authorization
- `setting` — server settings (omitted from GraphQL via the omit-sensitive plugin)
- `database`, `app`, `secret`, `transform_deployment` — management state

The `trexdb.setting` table is force-omitted from the schema regardless of column
comments — it stores secrets and JWTs.

## Custom Plugin Operations

In addition to the auto-generated schema, Trex registers a custom GraphQL plugin
(`pluginOperationsPlugin`) that exposes management operations. These delegate
to the analytical engine and PostgreSQL pool.

### Queries

| Operation | Returns | Description |
|-----------|---------|-------------|
| `trexClusterStatus` | `TrexClusterStatus` | Aggregate status across cluster nodes. |
| `trexNodes` | `[TrexNode!]!` | Alive cluster members. |
| `trexServices` | `[TrexService!]!` | Running service extensions. |
| `trexDatabases` | `[TrexDatabase!]!` | Attached Trex databases. |
| `trexSchemas` | `[TrexSchema!]!` | Schemas across all databases. |
| `trexTables(database, schema)` | `[TrexTable!]!` | Table inventory with row estimates / column counts. |
| `trexExtensions` | `[TrexExtension!]!` | Loaded extensions and versions. |
| `trexMigrations` | `[PluginMigrationSummary!]!` | Per-plugin migration status. |
| `etlPipelines` | `[EtlPipeline!]!` | CDC pipelines registered via the etl extension. |
| `transformProjects` | `[TransformProject!]!` | Registered transform plugins. |
| `transformCompile(pluginName)` | `[TransformCompileResult!]!` | Compile a project's models without running them. |
| `transformPlan(pluginName, destDb, destSchema, sourceDb, sourceSchema)` | `[TransformPlanResult!]!` | Show what `transformRun` would do. |
| `transformFreshness(pluginName, destDb, destSchema)` | `[TransformFreshnessResult!]!` | Per-model freshness vs `warn_after` / `error_after`. |
| `availablePlugins` | `[PluginInfo!]!` | Installed-vs-registry plugin status. |

### Mutations

| Operation | Returns | Description |
|-----------|---------|-------------|
| `installPlugin(packageSpec)` | `PluginResult!` | Install a plugin from the configured npm registry. |
| `uninstallPlugin(packageName)` | `PluginResult!` | Remove an installed plugin. |
| `runPluginMigrations(pluginName)` | `RunMigrationResult!` | Run pending migrations for one or all plugins. |
| `startService(extension, config)` | `ServiceActionResult!` | Start a service extension. |
| `stopService(extension)` | `ServiceActionResult!` | Stop a service extension. |
| `restartService(extension, config)` | `ServiceActionResult!` | Restart a service extension. |
| `testDatabaseConnection(databaseId)` | `TestConnectionResult!` | Smoke-test a federated database config. |
| `startEtlPipeline(...)` | `EtlActionResult!` | Start an ETL pipeline via the etl extension. |
| `stopEtlPipeline(name)` | `EtlActionResult!` | Stop a pipeline. |
| `transformRun(pluginName, destDb, destSchema, sourceDb, sourceSchema)` | `[TransformRunResult!]!` | Run all models. Persists deployment in `trexdb.transform_deployment` and registers HTTP endpoints. |
| `transformSeed(pluginName, destDb, destSchema)` | `[TransformSeedResult!]!` | Load CSV seeds. |
| `transformTest(pluginName, destDb, destSchema, sourceDb, sourceSchema)` | `[TransformTestResult!]!` | Run model tests. |

All mutations and most management queries assert `app.user_role = 'admin'` and
return `Forbidden` otherwise.

## Example Queries

```graphql
query {
  allUsers(first: 10) {
    nodes {
      id
      name
      email
      role
      createdAt
    }
  }
}

query {
  trexClusterStatus {
    totalNodes
    activeQueries
    queuedQueries
    memoryUtilizationPct
  }
  trexExtensions {
    extensionName
    loaded
    extensionVersion
  }
}
```

## Subscriptions

Real-time subscriptions use the v4 simple-subscription transport (Postgres
`LISTEN`/`NOTIFY`). Connect a `graphql-ws` client to `ws://…/trex/graphql`.
