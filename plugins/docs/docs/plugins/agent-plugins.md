---
sidebar_position: 6
---

# Agent Plugins

Agent plugins register long-running AI agents that run as isolated Deno
EdgeRuntime workers on the core-shipped agents runtime. Each declared agent
exposes an eve-compatible HTTP surface —
session creation, turns, human-in-the-loop approvals, and an SSE event stream —
plus a stateless `POST /chat` endpoint for the Vercel AI SDK UIMessage stream.
Sessions, turns, and steps are persisted so runs can be replayed and audited
from the Agent Runs dashboard.

Agents reuse the [function plugin](./function-plugins) proxy for routing, auth,
and SSE piping; the worker's `servicePath` is the shared runtime service in
`core/server/agents/service`.

## Configuration

Declare agents under `trex.agents` in `package.json`:

```json
{
  "name": "@trex/my-plugin",
  "trex": {
    "agents": [
      {
        "name": "my-agent",
        "dir": "agent",
        "env": {
          "TREX_AGENTS_DEFAULT_MODEL": "anthropic/claude-sonnet-5"
        }
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Agent name (`[a-zA-Z0-9_-]`). Mounted at `${PLUGINS_BASE_PATH}/<scope>/<name>`. |
| `dir` | string | Agent directory relative to the plugin, containing `instructions.md` and friends. Default `agent`. |
| `env` | object | Per-agent env vars (with `${VAR}` substitution, same syntax as function plugins). Overrides passthrough vars; **cannot** override reserved keys. |
| `memory` | array | Links to declared [memory plugin](./memory-plugins) brains: `[{ "name": "handbook", "mode": "read" \| "readwrite" }]`. Each link generates namespaced `<name>_search` / `<name>_recall` / `<name>_get_page` (and `<name>_capture` for `readwrite`) tools plus a usage skill at boot. |

`trex.agents` may be a single object or an array of them.

:::warning `@trex` scope required
Agent plugins must be published under the **`@trex/` scope**. The agents worker
does not authenticate callers inside the worker, so the loader relies on the
function proxy's `authContext` + `pluginAuthz` middleware, which only applies to
`@trex/...` plugins. A non-`@trex` agent plugin is **logged and skipped at
boot** rather than mounted as an unauthenticated HTTP surface.
:::

## Agent Directory Layout

The agent directory follows eve's layout (`instructions.md` is the only required
file):

```
agent/
├── instructions.md          # required — the system prompt (or instructions.edn)
├── agent.ts                 # optional — defineAgent({ model, maxSteps, hooks })
├── deno.json                # optional — extra import-map entries for tools
├── dynamic-tools.ts         # optional — defineToolProvider (per-request tools)
├── tools/
│   ├── echo.ts              # one defineTool per file; filename = tool name
│   └── ...
├── skills/
│   ├── greeting-style.md    # skills/<name>.md or skills/<name>/SKILL.md
│   └── ...
├── channels/
│   ├── discord.ts           # one defineChannel per file; filename = channel id
│   └── ...
├── connections/
│   ├── linear.ts            # one MCP/OpenAPI connection per file; filename = connection name
│   └── ...
└── subagents/
    └── shouter/             # each subagent is itself an agent directory
        ├── instructions.md
        └── tools/
```

The loader accepts EDN equivalents (`instructions.edn`, `agent.edn`,
`skills/<name>.edn`) for eve-native authoring; when both an `.md`/`.ts` twin and
an `.edn` file exist, the eve-native form wins.

## Authoring API

The runtime injects an import map exposing the `eve` authoring shim, the AI SDK
(`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`,
`@ai-sdk/amazon-bedrock`), `zod`, and `pg`. An agent's own `deno.json` imports
are merged on top, so tools can pull in extra npm dependencies.

### Defining the agent

`agent.ts` default-exports `defineAgent(...)`. It's optional — an agent with only
`instructions.md` runs on the default model.

```ts
import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5", // eve/AI-Gateway "provider/model-id"
  maxSteps: 25,
});
```

`model` is a `provider/model-id` string, where `provider` is one of `anthropic`,
`openai`, `google`, or `bedrock`. If omitted, the runtime uses
`TREX_AGENTS_DEFAULT_MODEL`.

### Defining tools

Each file in `tools/` default-exports one `defineTool(...)`. The filename is the
tool name.

```ts
import { defineTool } from "eve/tools";

export default defineTool({
  description: "Echo the given text back.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  execute: (input, ctx) =>
    Promise.resolve({ echoed: (input as { text: string }).text }),
});
```

| Field | Description |
|-------|-------------|
| `description` | Required. Shown to the model. |
| `inputSchema` | Required. A Zod schema or a JSON Schema object. |
| `execute(input, ctx)` | Required unless `clientOnly`. Runs server-side; may use `ctx.sql` / `ctx.emit`. |
| `needsApproval` | Gate execution behind a human approval (see [Approvals](#approvals)). |
| `clientOnly` | Forward the call to the frontend instead of executing server-side. |
| `idempotent` | Marks the tool safe to retry. |

The `ctx` (`ToolContext`) carries `sessionId`, `userId` (from the proxy-injected
`x-user-id` header, never client `metadata`), a pg query fn `sql`, and a
fire-and-forget `emit(name, data)` for custom progress events. All are optional —
guard with `ctx?.sql?.(...)` / `ctx?.emit?.(...)`.

### Per-request hooks

`defineAgent` accepts additive hooks called on **every** turn/chat request (never
cached at load time), each receiving a per-request `HookCtx` (`sessionId`,
`userId`, `bearerToken`, `env`, `sql`):

| Hook | Purpose |
|------|---------|
| `resolveModel(ctx)` | Return a model string or a `{ provider, modelId, apiKey, baseURL }` spec — e.g. per-tenant credentials. A throw fails the turn (no silent fallback to env credentials). |
| `buildInstructions(base, ctx)` | Return the effective system prompt, derived from the loaded `instructions.md`. A throw fails the turn. |
| `filterTools(name, def, ctx)` | Synchronous per-tool yes/no over the merged tool set (authored + dynamic + built-in). Return `false` to drop a tool. |

A `dynamic-tools.ts` default-exporting `defineToolProvider((ctx) => ...)` supplies
per-request tools (e.g. from an MCP server). Unlike the hooks above, a rejecting
provider does **not** fail the turn — the runtime logs and continues with the
static tool set.

## Environment Variables

Agent workers receive:

1. **Passthrough** host vars, forwarded only when set: `DATABASE_URL`,
   `TREX_AGENTS_DEFAULT_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
   `OPENAI_BASE_URL`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK`,
   `AWS_REGION`.
2. The agent entry's **`env`** block (with `${VAR}` substitution) — may override
   passthrough vars.
3. **Reserved** keys, injected last so they can't be overridden:
   `TREX_AGENT_DIR`, `TREX_AGENT_NAME`, `TREX_PLUGIN_NAME`, `TREX_AGENT_BASE`
   (the worker's mount path, used to strip the route prefix).

## HTTP API

Each agent mounts at `${PLUGINS_BASE_PATH}/<scope>/<name>` (default
`/plugins/trex/<name>`). The eve-compatible session protocol:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/eve/v1/session` | Create a session. Optional `{ message, metadata }` starts the first turn immediately. Returns `{ sessionId, continuationToken }`. |
| `POST` | `/eve/v1/session/:id` | Follow-up turn. Accepts `message` and/or `inputResponses` (structured HITL answers). |
| `POST` | `/eve/v1/session/:id/approval` | Resolve a tool-approval request: `{ requestId, decision }` where `decision` is `approve`, `deny`, `always`, or `never`. Owner-only. |
| `GET` | `/eve/v1/session/:id/stream` | SSE event stream. Reconnect with `?startIndex=<count>`; `?replayOnly=1` skips the live tail. |
| `GET` | `/eve/v1/info` | eve `AgentInfoResult` — tools, skills, subagents, instructions. |
| `GET` | `/eve/v1/health`, `/healthz` | Liveness. |
| `POST` | `/chat` | Stateless [AI SDK UIMessage stream](https://sdk.vercel.ai/) — no persistence; per-request turn used by `useChat` frontends. |

### Approvals

A tool with `needsApproval: true` pauses the turn and emits an approval request
over the stream. The client resolves it via the `/approval` route. `always` /
`never` decisions are sticky (persisted per user) and require an authenticated
caller; `approve` / `deny` are one-shot.

## Channels

A channel is an inbound platform entry point — a Discord slash command, a
Slack mention, a GitHub issue comment — that starts or resumes an agent
session and delivers the reply back to the platform. Drop `channels/*.ts`
files at the agent-dir root, each default-exporting a `defineChannel(...)`
result (usually via a built-in adapter factory):

```ts
// channels/discord.ts
import { discordChannel } from "eve/channels/discord";
export default discordChannel();
```

Built-in adapters: `eve` (web), `discord`, `slack`, `telegram`, `twilio`
(SMS), `github`, `linear`, `teams`, plus `custom`. Each mounts at
`…/eve/v1/<channelId>` under the agent's base path and authenticates by
**platform signature** (not the Trex JWT); credentials come from per-adapter
env vars (`DISCORD_PUBLIC_KEY`, `SLACK_SIGNING_SECRET`, …). Optional
`<PREFIX>_ALLOWED_USERS` / `<PREFIX>_ALLOWED_CHANNELS` env vars (e.g.
`DISCORD_ALLOWED_USERS`) restrict who can trigger the agent; allow-listing a
channel also covers threads spawned inside it.

**Discord gateway mode**: setting `DISCORD_GATEWAY=1` in the agent's manifest
`env` block (per-agent, deliberately no host-wide fallback) makes the server
open an *outbound* WebSocket to Discord's gateway instead of receiving signed
webhooks — no public URL needed, works behind NAT. Leave the app's
Interactions Endpoint URL unset in the developer portal; `DISCORD_PUBLIC_KEY`
is not used in this mode. `@trex/claw` documents both transports in detail.

The per-adapter env var tables, route URLs to register on each platform, and
current human-in-the-loop limitations are documented in
`core/server/agents/README.md` in the source tree.

## Connections

A connection exposes an external service's tools to the model with
credentials kept out of the prompt — a remote MCP server or an
OpenAPI-described HTTP API. Drop `connections/*.ts` files at the agent-dir
root; the file stem is the connection name and its tools are exposed as
`<name>__<tool>`:

```ts
// connections/linear.ts
import { defineMcpClientConnection } from "eve/connections";

export default defineMcpClientConnection({
  description: "Linear issue tracker (MCP).",
  url: "https://mcp.linear.app/sse",
  tools: { allow: ["create_issue", "search_issues"] },
});
```

`defineOpenApiConnection({ spec, baseUrl, tools })` generates one tool per
OpenAPI operation. `tools` takes exactly one of `allow` / `block`;
`approval: once()` gates every tool of a connection behind the standard
approval flow. When an agent has at least one connection, a built-in
`connection_search` tool helps the model discover the right `<name>__<tool>`
name. A broken or unreachable connection logs and continues — its tools are
absent that turn, never a turn failure.

Static auth uses env-var tokens or headers. For user-delegated OAuth, the
`trexConnect("<connector>")` broker resolves tokens per user at tool-call
time: registered connectors live in `agents.oauth_connectors`, tokens are
stored AES-GCM-encrypted in `agents.oauth_tokens` (gated by `TREX_ROOT_KEY`),
and a missing token emits a consent URL and parks the turn until the user
authorizes. Full connector registration and broker details:
`core/server/agents/README.md`.

## Linked Memories

The `memory` array on a `trex.agents[]` entry (see
[Configuration](#configuration)) links the agent to declared
[memory plugin](./memory-plugins) brains. The generated tools call the memory
worker's MCP endpoint over the internal inter-service path; captures land in
the agent's own `default` source and never overwrite imported knowledge.

## Skill Packs

Skills can also arrive from *other* plugins: a [skill plugin](./skill-plugins)
declares packs that name their target agents and get staged into the agent's
worker directory as `skills/<pack>--<skill>/` — even after the agent is
already running. The agent's own `skills/` directory always wins on
collision, and `GET /eve/v1/info` reports the injecting pack per skill.

## Persistence & Dashboard

Sessions, turns, and steps are written to the **`agents`** schema in the
`_config` database. The schema is created by the `agents-core` migration target,
registered once when the first agents-type plugin is loaded.

The admin GraphQL surface exposes `agentSessions(limit, offset, agent, status)`
and `agentSession(id)`, which power the **Agent Runs** pages in the web admin —
a session list plus a turn/step timeline with a live tail for running sessions.

Note: `POST /chat` is the stateless exception — it runs a per-request turn and
does **not** persist to the `agents` schema.

## Example

`@trex/devx` ships the `devx-agent` as a full reference: filesystem, bash, git,
GitHub, and browser tools, subagents (`code-explorer`, `code-reviewer`), skills
symlinked from the shared plugin skills, dynamic MCP tools, and the
`resolveModel` / `buildInstructions` / `filterTools` hooks. See
`plugins/devx/agent/` in the source tree.

`@trex/claw` is a channel-first reference: a Discord facilitator agent that
mediates between a team chat channel and the Code agent, using the `discord`
channel adapter in either webhook or gateway mode, thread-per-task sessions,
and approval buttons. See `plugins/claw/README.md`.
