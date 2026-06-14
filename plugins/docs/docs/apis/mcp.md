---
sidebar_position: 3
---

# MCP Server

Trex ships a [Model Context Protocol](https://modelcontextprotocol.io/) server that
exposes the management surface (users, roles, plugins, databases, the analytical
catalog, etc.) as 50 typed tools. AI assistants connect with a Bearer API key.

## Endpoint

| Method | Path | Description |
|--------|------|-------------|
| POST | `/trex/mcp` | Create a session or send a request. |
| GET | `/trex/mcp` | Retrieve a response for an existing session. |
| DELETE | `/trex/mcp` | Close a session. |

## Authentication

Every request requires a Bearer token API key:

```
Authorization: Bearer trex_<48-hex-characters>
```

API keys are scoped to admin users. Issue them via:

- Web UI → Settings → API Keys
- The `api-key-create` MCP tool (with an existing key)
- `POST ${BASE_PATH}/api/api-keys` (browser session)

The `sbp_…` prefix is also accepted (issued by the CLI login flow) and validates
against the same `trexdb.api_key` table.

## Session Management

- Sessions are tracked via the `mcp-session-id` request header.
- Maximum 100 concurrent sessions.
- Sessions expire after 30 minutes of inactivity.

## Tools

### Users (5)

| Tool | Description |
|------|-------------|
| `user-list` | Paginate users with optional filters. |
| `user-get` | Look up a user by ID. |
| `user-create` | Create a user with a role and password. |
| `user-update-role` | Change a user's role. |
| `user-ban` | Soft-delete / ban a user. |

### Sessions (2)

| Tool | Description |
|------|-------------|
| `session-list` | List active refresh-token sessions for a user. |
| `session-revoke` | Revoke a session by ID. |

### Roles (6)

| Tool | Description |
|------|-------------|
| `role-list` | List all roles and their scopes. |
| `role-create` | Create a role. |
| `role-update` | Edit a role's scopes / description. |
| `role-delete` | Delete a role (fails if assigned). |
| `user-role-assign` | Assign a role to a user. |
| `user-role-remove` | Unassign a role. |

### API Keys (3)

| Tool | Description |
|------|-------------|
| `api-key-list` | List the caller's keys (or all keys for admins). |
| `api-key-create` | Issue a new key. |
| `api-key-revoke` | Revoke a key. |

### SSO (3)

| Tool | Description |
|------|-------------|
| `sso-list` | List configured SSO providers. |
| `sso-save` | Upsert a provider (Google / GitHub / Microsoft / Apple). |
| `sso-delete` | Remove a provider. |

### Apps (4)

| Tool | Description |
|------|-------------|
| `app-list` | List registered apps. |
| `app-create` | Register an app. |
| `app-update` | Update an app's config. |
| `app-delete` | Remove an app. |

### Databases (7)

| Tool | Description |
|------|-------------|
| `database-list` | List federated database configs. |
| `database-create` | Add a federated database. |
| `database-update` | Change connection metadata. |
| `database-delete` | Remove a federated database. |
| `database-test-connection` | Smoke-test the connection. |
| `database-credential-save` | Store / rotate credentials. |
| `database-credential-delete` | Delete stored credentials. |

### Cluster (5)

| Tool | Description |
|------|-------------|
| `cluster-list-nodes` | List gossip members. |
| `cluster-list-services` | List running service extensions. |
| `cluster-get-status` | Aggregate cluster health. |
| `cluster-start-service` | Start a service extension on a node. |
| `cluster-stop-service` | Stop a service extension. |

### Trex Catalog (5)

| Tool | Description |
|------|-------------|
| `trexdb-list-databases` | List attached Trex databases. |
| `trexdb-list-schemas` | List schemas across databases. |
| `trexdb-list-tables` | List tables with row estimates. |
| `trexdb-list-extensions` | List loaded SQL extensions. |
| `trexdb-execute-sql` | Run an arbitrary SQL statement. |

### ETL (3)

| Tool | Description |
|------|-------------|
| `etl-list-pipelines` | List CDC pipelines. |
| `etl-start-pipeline` | Start a pipeline. |
| `etl-stop-pipeline` | Stop a pipeline. |

### Migrations (2)

| Tool | Description |
|------|-------------|
| `migration-list` | Per-plugin migration status. |
| `migration-run` | Run pending migrations for one or all plugins. |

### Plugins (5)

| Tool | Description |
|------|-------------|
| `plugin-list` | Installed and available plugins. |
| `plugin-install` | Install a plugin from the configured npm registry. |
| `plugin-uninstall` | Remove an installed plugin. |
| `plugin-get-info` | Read a plugin's `package.json` / `trex` config. |
| `plugin-function-invoke` | Invoke a plugin-registered function over the inter-service bus. |

## Resources

| URI | Description |
|-----|-------------|
| `trex://plugin-development-guide` | Plugin development guide (Markdown). |

## Client Configuration

### Claude Desktop

```json
{
  "mcpServers": {
    "trexsql": {
      "url": "http://localhost:8001/trex/mcp",
      "headers": {
        "Authorization": "Bearer trex_your_api_key_here"
      }
    }
  }
}
```

### Generic SSE Client

```bash
curl -N -X POST http://localhost:8001/trex/mcp \
  -H "Authorization: Bearer trex_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```
