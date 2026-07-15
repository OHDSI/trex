---
sidebar_position: 7
---

# Memory Plugins

Memory plugins declare **knowledge brains**: named, schema-isolated
[gbrain](https://github.com/p-hoffmann/gbrain) instances filled from git
repositories or content shipped inside the plugin package. Each declared
memory maps 1:1 to a Postgres schema (`memory_<name>`) in the same database
as the rest of Trex, and is served by a single shared in-runtime Deno worker.
Agents link to a memory by name and get generated search/recall/capture tools
— see [Linking a memory to an agent](#linking-a-memory-to-an-agent).

## Configuration

Declare memories under `trex.memory` in `package.json` (a single object or an
array):

```json
{
  "name": "@trex/my-knowledge",
  "trex": {
    "memory": [
      {
        "name": "research",
        "sources": [
          {
            "name": "clinical-notes",
            "repo": "https://github.com/org/notes",
            "ref": "main",
            "dir": "pages/"
          },
          { "name": "handbook", "dir": "memory/handbook" }
        ]
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Memory name, `^[a-z0-9][a-z0-9_]*$` — **no hyphens**. Becomes the Postgres schema `memory_<name>`, so it must be a valid unquoted schema identifier. |
| `sources` | array | At least one source. Source names allow hyphens (`^[a-z0-9][a-z0-9_-]*$`) — a source is a namespace within the memory, not a schema identifier. |
| `sources[].repo` | string | Git source: repository URL to clone. |
| `sources[].ref` | string | Git ref for a `repo` source. Default `main`. |
| `sources[].dir` | string | Subdirectory within the repo (git source), or a path inside the plugin package (inline source — no `repo`). Sanitized against `..` traversal. |

Two or more plugins may contribute sources to the **same** memory name — the
declarations are aggregated across every installed plugin before the worker
mounts, and each inline source resolves against its own declaring plugin's
directory.

:::warning Trusted scope required
Like agent plugins, `trex.memory` is honored only for trusted-scope packages
(`@trex/`, `@ohdsi/`). Declarations from other scopes are skipped.
:::

## Routing and isolation

The memory worker mounts once, post-scan, as the synthetic first-party plugin
`@trex/memory` under `${PLUGINS_BASE_PATH}/trex/memory`. Inside the worker,
`/memory/<name>` serves the brain and `/memory/<name>/mcp` is its MCP JSON-RPC
endpoint. Every request path is checked against an allow-list derived from
the declared memory names (`GBRAIN_MEMORY_ALLOWLIST`, auto-set at mount time)
— an undeclared name 404s, and there is no request-driven schema creation.

Two auth layers apply:

- The **public Express route** is guarded by the standard `authContext` +
  `pluginAuthz` middleware (a valid Trex session is required), on top of the
  worker's own check.
- The worker itself requires an internal shared-secret bearer token
  (`GBRAIN_MEMORY_TOKEN`) on every request — this is what gates
  worker-to-worker calls (e.g. agent memory tools) that arrive over the
  internal inter-service path and bypass Express middleware.

Sources are imported at boot (each staged source is self-imported once when
the worker starts). There is no polling or webhook refresh yet — content
updates on the next server restart.

## Linking a memory to an agent

An [agent plugin](./agent-plugins) links to a declared memory by name via a
`memory` array on its `trex.agents[]` entry:

```json
{
  "trex": {
    "agents": [
      {
        "name": "librarian",
        "dir": "agent",
        "memory": [{ "name": "handbook", "mode": "readwrite" }]
      }
    ]
  }
}
```

- `mode` is `"read"` (default) or `"readwrite"`. Links are validated at boot
  against the declared-memory allow-list; a link to an undeclared name is
  dropped with a warning, not a boot failure.
- For each link, boot generates and stages namespaced tools into the agent's
  directory: `<name>_search`, `<name>_recall`, and `<name>_get_page` for all
  modes, plus `<name>_capture` for `readwrite` links — along with a
  `<name>-memory` skill telling the model when to use them. Generation
  refuses to overwrite a hand-authored tool or skill of the same name.
- Captures always land under the calling agent's own `default` source inside
  the memory — an agent can add knowledge but never overwrite imported
  content.

## Examples

- `plugins/memory-example/` — declares the `handbook` memory from an inline
  package directory.
- `plugins/memory-example2/` — contributes an extra source to a memory from a
  second plugin.
- `plugins/agent-memory-example/` — a minimal agent linked to the `handbook`
  memory.

## Operations

Environment variables, the boot import pipeline, and the remaining
pre-production verification gaps are documented in the operator guide at
`plugins/memory/docs/OPERATIONS.md` in the source tree.
