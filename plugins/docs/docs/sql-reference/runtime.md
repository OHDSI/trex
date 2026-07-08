---
sidebar_position: 16
---

# runtime — Edge Runtime & Server Management

The `runtime` extension (extension name `trexas`) hosts the Deno-based edge
runtime that serves the Trex core management application — the web UI, GraphQL,
auth, MCP, and edge functions. It starts as a service extension from
`SWARM_CONFIG` at boot, but you can also start, stop, and inspect runtime
servers directly from SQL.

Each server runs a **main service** (the core server bundle) and an optional
**event worker**, both as compiled `.eszip` bundles.

## Functions

Every function below has a short alias without the `runtime_` segment
(e.g. `trex_start_server` for `trex_runtime_start`); both names call the same
implementation.

### `trex_runtime_start(host, port, main_service_path, event_worker_path)`

Start an edge runtime server. Alias: `trex_start_server`.

| Parameter | Type | Description |
|-----------|------|-------------|
| host | VARCHAR | Bind address. |
| port | INTEGER | Listen port. |
| main_service_path | VARCHAR | Path to the main service bundle (`.eszip`). |
| event_worker_path | VARCHAR | Path to the event worker bundle (`.eszip`). |

**Returns:** VARCHAR — status message (includes the assigned server id).

```sql
SELECT trex_runtime_start(
  '0.0.0.0', 8001,
  '/usr/src/core/server/index.eszip',
  '/usr/src/core/event/index.eszip'
);
```

### `trex_runtime_start_with_config(config_json)`

Start a server from a JSON configuration (for options beyond the four
positional arguments). Alias: `trex_start_server_with_config`.

| Parameter | Type | Description |
|-----------|------|-------------|
| config_json | VARCHAR | JSON server configuration. |

**Returns:** VARCHAR — status message.

```sql
SELECT trex_runtime_start_with_config('{"host":"0.0.0.0","port":8001,"main_service_path":"/usr/src/core/server/index.eszip"}');
```

### `trex_runtime_stop(server_id)`

Stop a single running server by id. Alias: `trex_stop_server`.

| Parameter | Type | Description |
|-----------|------|-------------|
| server_id | VARCHAR | Server id (from `trex_runtime_list`). |

**Returns:** VARCHAR — status message.

```sql
SELECT trex_runtime_stop('srv-1');
```

### `trex_runtime_stop_all()`

Stop every running runtime server on this node. Alias: `trex_stop_all_servers`.

**Returns:** VARCHAR — status message.

```sql
SELECT trex_runtime_stop_all();
```

### `trex_runtime_create_bundle(entrypoint, output_path [, options])`

Compile a TypeScript/JavaScript entrypoint into an `.eszip` bundle that the
runtime can serve. Alias: `trex_create_bundle`.

| Parameter | Type | Description |
|-----------|------|-------------|
| entrypoint | VARCHAR | Path to the entry `.ts` / `.js` file. |
| output_path | VARCHAR | Path to write the `.eszip` bundle. |
| options | VARCHAR | Optional. JSON build options. |

**Returns:** VARCHAR — status message.

```sql
SELECT trex_runtime_create_bundle('./functions/hello/index.ts', './functions/hello/index.eszip');
```

### `trex_runtime_list()`

List running runtime servers on this node. Alias: `trex_list_servers`.

**Returns:** TABLE

| Column | Description |
|--------|-------------|
| server_id | Server identifier. |
| ip | Bind address. |
| port | Listen port. |
| main_service_path | Main service bundle path. |
| event_worker_path | Event worker bundle path. |
| started_at | Start timestamp. |
| policy | Worker policy. |
| status | Server status. |

```sql
SELECT * FROM trex_runtime_list();
```

### `trex_runtime_version()`

Return the runtime extension version. Alias: `trex_version`.

**Returns:** VARCHAR

```sql
SELECT trex_runtime_version();
```

## Operational notes

- **Usually started via `SWARM_CONFIG`.** In the default deployment the
  `trexas` service is launched from the node's `extensions` list, not by hand.
  These functions are for scripted control and inspection.
- **Bundles are `.eszip`.** Edge functions and the core server ship as
  precompiled `.eszip` bundles; use `trex_runtime_create_bundle` (or the
  `trex`/`tbuild` CLI) to build them.

## Next steps

- [APIs → Functions](../apis/functions) — writing and invoking edge functions.
- [Deployment → Docker](../deployment/docker) — how `trexas` is wired into the
  default stack.
