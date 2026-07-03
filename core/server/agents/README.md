# `agents` plugin type

A trex plugin can declare one or more agents: [Vercel eve](https://github.com/vercel/eve)-layout
directories (`instructions.md`, `tools/*.ts`, `skills/*`, `subagents/*`, ...) that trex loads and
runs as an edge-runtime worker, with a shared runtime for the model loop, tool dispatch,
durability, and the eve-compatible HTTP surface. You write instructions, tools, skills, and
subagents; trex provides the loop, the session store, and the wire protocol.

Agent directories are meant to stay portable to real eve — see [COMPAT.md](./COMPAT.md) for
exactly where trex's implementation matches eve, where it deliberately diverges, and where it
falls short of eve's documented guarantees. This README is the day-to-day authoring and
operating guide; COMPAT.md is the detailed reconciliation record.

## Declaring an agent

Add a `trex.agents` array to the plugin's `package.json`:

```json
{
  "trex": {
    "agents": [
      { "name": "toy", "dir": "agent" }
    ]
  }
}
```

- `name` — required, `[a-zA-Z0-9_-]+`. Becomes the mount point: the agent is served at
  `/<plugin-scope>/<name>/...`.
- `dir` — the agent directory relative to the plugin root. Defaults to `"agent"` if omitted.

Each entry gets its own worker, started with a generated import map that maps `eve` / `eve/tools`
/ `eve/evals` to trex's shim (see "Authoring API" below) and forwards a fixed set of environment
variables (see "Models and credentials"). Registration fails fast at plugin-load time if
`instructions.md` (or `instructions.edn`) is missing — not at first request.

## Directory layout

| Path | Required | v1 support |
|---|---|---|
| `instructions.md` | yes* | Always-on system prompt. *Or `instructions.edn` — see EDN alternatives below. |
| `agent.ts` | no | `defineAgent({ model, maxSteps })`. Defaults to `maxSteps: 25`, no model (falls back to `TREX_AGENTS_DEFAULT_MODEL`). `agent.js` also accepted. `agent.edn` accepted as a declarative alternative. |
| `tools/*.ts`, `tools/*.js`, `tools/*.mts`, `tools/*.mjs` | no | One tool per file; the filename (minus extension) is the tool name. Each file must default-export a `defineTool(...)` result. |
| `skills/<name>.md` | no | Full support. On-demand procedure; the skill's name + description are listed in the system prompt, content is loaded on demand by the built-in `skill` tool. |
| `skills/<name>/SKILL.md` | no | Full support, same semantics as the flat form (directory form for skills with adjacent assets). |
| `subagents/<name>/` | no | Full support, **one level deep only**. Each is itself an eve-layout directory (own `instructions.md`, `tools/`, `skills/`, model). Invoked via the built-in `agent` tool; a `subagents/` directory nested inside a subagent is logged and ignored. |
| `agent.edn`, `instructions.edn`, `skills/<name>.edn` | no | trex extension for CLJS-authored agents — see below. |
| `channels/`, `connections/`, `sandbox/` | — | Not implemented in v1. Logged and skipped (not an error), so a real eve project directory still loads without crashing. |

Skills are sorted by name. Subagent names come from the `subagents/` directory entry names.

### EDN alternatives (CLJS authoring)

For ClojureScript-authored agents (build-time compiled to `.js`, e.g. via shadow-cljs), the loader
also accepts EDN files as declarative alternatives to the TypeScript/Markdown forms:

- `agent.edn` — `{:model "provider/model-id" :max-steps 20}`
- `instructions.edn` — either a bare EDN string, or `{:instructions "..."}`
- `skills/<name>.edn` — `{:description "..." :content "..."}`

**The eve-native file always wins when both exist** (`instructions.md` over `instructions.edn`,
`agent.ts`/`agent.js` over `agent.edn`, `skills/<name>.md` or `skills/<name>/SKILL.md` over
`skills/<name>.edn`). This keeps directories portable: on real eve, the EDN files are simply
invisible (not read) and the `.md`/`.ts` files carry the whole agent. EDN parse failures (malformed
syntax) fail loudly at load time; a missing EDN file is fine.

EDN *data resources* consumed by tools (e.g. a RAG corpus file) need no special support from the
loader — tools read and parse arbitrary files themselves.

## Authoring examples

The toy agent under `core/server/agents/testdata/toy-agent/agent/` (also mirrored at
`plugins-dev/toy-agent/agent/` for the real `eve eval` CLI) is a minimal but complete example
covering a tool, a `clientOnly` tool, a skill, and a subagent with its own tool.

`agent.ts`:

```ts
import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5",
});
```

`instructions.md`:

```
You are a toy demo agent for trex integration testing.
When asked to echo something, use the echo tool and repeat its output verbatim.
When asked to propose a card, call the propose_card tool.
```

`tools/echo.ts` — an ordinary server-executed tool:

```ts
import { defineTool } from "eve/tools";

export default defineTool({
  description: "Echo the given text back.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  execute: (input) => Promise.resolve({ echoed: (input as { text: string }).text }),
});
```

`tools/propose_card.ts` — a `clientOnly` tool (no `execute`; the frontend renders it):

```ts
import { defineTool } from "eve/tools";

export default defineTool({
  description: "Propose a card for the user to accept or reject (rendered client-side).",
  inputSchema: {
    type: "object",
    properties: { title: { type: "string" } },
    required: ["title"],
  },
  clientOnly: true,
});
```

`skills/greeting-style.md` — description comes from frontmatter, content is the rest of the file:

```markdown
---
description: How to greet users in the toy agent's chipper style.
---

# Greeting style

Always greet with "Ahoy" and end greetings with an exclamation mark.
```

`subagents/shouter/instructions.md`:

```
You are the shouter subagent. Use the shout tool on the given text and return its output verbatim.
```

`subagents/shouter/tools/shout.ts`:

```ts
import { defineTool } from "eve/tools";

export default defineTool({
  description: "Uppercase the given text.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
  },
  execute: (input) => Promise.resolve({ shouted: (input as { text: string }).text.toUpperCase() }),
});
```

`inputSchema` accepts either a raw JSON Schema object (as above — needed for CLJS-compiled tools)
or a zod schema (eve-native). Both work identically at execution time; see COMPAT.md divergence 7
for a `GET /eve/v1/info` introspection caveat with zod schemas specifically.

## Models and credentials

`agent.ts`'s `model` (or the EDN `agent.edn`'s `:model`) is an eve/AI-Gateway-style string,
`"provider/model-id"`, e.g. `"anthropic/claude-sonnet-5"`, `"bedrock/anthropic.claude-3-5-sonnet"`,
`"openai/gpt-4o"`. If an agent declares no model, `TREX_AGENTS_DEFAULT_MODEL` is used as the
fallback; a per-agent `model` always wins over the default.

Supported providers and the environment variables that configure them (forwarded from the host
into the agent worker when set):

| Provider prefix | Env var(s) | Notes |
|---|---|---|
| `anthropic` | `ANTHROPIC_API_KEY` | |
| `openai` (default/fallback prefix) | `OPENAI_API_KEY`, `OPENAI_BASE_URL` | `OPENAI_BASE_URL` is optional, for OpenAI-compatible endpoints. |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | |
| `bedrock` | `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION` | Bearer-token auth path (dummy static credentials bypass SigV4, a custom `fetch` injects the `Authorization` header) if `AWS_BEARER_TOKEN_BEDROCK` is set; `AWS_REGION` defaults to `us-east-1`. Also patches a `"."` text part into tool-use-only assistant messages, which Bedrock otherwise rejects. |
| — | `TREX_AGENTS_DEFAULT_MODEL` | Fallback model string when `agent.ts`/`agent.edn` declares none. |
| — | `DATABASE_URL` | Also forwarded; used by the agent runtime's own session store, not by tools directly. |

Any provider prefix other than `anthropic`, `google`, or `bedrock` resolves through the OpenAI
provider (so OpenAI-compatible gateways work by setting `OPENAI_BASE_URL`).

Only the variables above are passed from the host environment into the worker — an agent's tools
cannot read arbitrary host env vars.

## HTTP surface

Routes are mounted under the plugin's scoped path, e.g. `/plugins/<scope>/<agent-name>/`. Auth
goes through the existing plugin authz middleware; the end-user bearer token is exposed to tools
via `ToolContext.bearerToken`.

### Eve-compatible session API

**Create a session** (optionally with a first message):

```bash
curl -s -X POST https://<trex>/plugins/<scope>/<agent>/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message": "Use the echo tool to echo the word banana."}'
# -> 200 {"sessionId": "...", "continuationToken": "..."}, header x-eve-session-id: <id>
```

`continuationToken` is always equal to `sessionId` — trex has no separate channel layer to own a
distinct handle (see COMPAT.md divergence 1).

**Send a follow-up turn, and/or answer a pending approval** — bare `POST` to the session resource,
not a `/message` sub-path:

```bash
curl -s -X POST https://<trex>/plugins/<scope>/<agent>/eve/v1/session/<id> \
  -H 'content-type: application/json' \
  -d '{"message": "Now propose a card titled Ship it."}'
# -> 202 {"accepted": true}  (fire-and-forget: the reply streams over /stream, this
#    response does NOT carry a turnId or the reply text)
```

To answer a pending `needsApproval` request instead of (or in addition to) sending a message, pass
structured `inputResponses`:

```bash
curl -s -X POST https://<trex>/plugins/<scope>/<agent>/eve/v1/session/<id> \
  -H 'content-type: application/json' \
  -d '{"inputResponses": [{"requestId": "<request-id>", "optionId": "approve"}]}'
```

`optionId` must be `"approve"` or `"deny"` — trex only implements approval-style human input, not
eve's `ask_question`; anything else is a 400.

**Stream events** (NDJSON, one JSON object per line, resumable):

```bash
curl -sN https://<trex>/plugins/<scope>/<agent>/eve/v1/session/<id>/stream
# reconnect from where you left off:
curl -sN "https://<trex>/plugins/<scope>/<agent>/eve/v1/session/<id>/stream?startIndex=12"
# replay only, no live tail (trex extension, useful for tests/tooling):
curl -sN "https://<trex>/plugins/<scope>/<agent>/eve/v1/session/<id>/stream?replayOnly=1"
```

**Health / info** — the routes a real eve target-check (`eve eval --url`, `eve dev <url>`) polls
before treating a URL as a live target:

```bash
curl -s https://<trex>/plugins/<scope>/<agent>/eve/v1/health   # -> {"status": "ok"}
curl -s https://<trex>/plugins/<scope>/<agent>/eve/v1/info     # -> full AgentInfoResultSchema (see below)
```

`GET /eve/v1/info` reports `model`, `instructions`, `tools` (with their `clientOnly`/
`needsApproval` flags), `skills`, and `subagents` faithfully; `channels`, `schedules`,
`connections`, `hooks`, `sandbox`, and `workflow` are always empty/`null` because those authored
slots aren't implemented (see "What we ignore" in COMPAT.md).

**Additive approval convenience route** (not part of eve's documented surface — resolves one
approval directly instead of routing it through `inputResponses`):

```bash
curl -s -X POST https://<trex>/plugins/<scope>/<agent>/eve/v1/session/<id>/approval \
  -H 'content-type: application/json' \
  -d '{"requestId": "<request-id>", "decision": "approve"}'
```

Stream event vocabulary: `turn.started`, `message.appended`, `message.completed`,
`actions.requested`, `action.result`, `input.requested`, `turn.completed`, `turn.failed`,
`session.waiting`, `session.failed`. A client should end its per-turn read on
`session.waiting`/`session.failed` (mirroring eve's own client), not on
`turn.completed`/`turn.failed` — see COMPAT.md for why, and for which of these events are and
aren't replayable after a reconnect.

### Chat endpoint (non-eve, AI SDK convenience)

`POST .../chat` returns an AI-SDK `toUIMessageStreamResponse()` stream, for `useChat`-based
frontends (no eve client involved):

```bash
curl -s -X POST https://<trex>/plugins/<scope>/<agent>/chat \
  -H 'content-type: application/json' \
  -d '{"messages": [{"role": "user", "parts": [{"type": "text", "text": "hello"}]}]}'
```

This is stateless from the caller's point of view (history comes from `messages[]` on each
request, not from a session id), though a session/turn is still persisted for observability. A
`needsApproval` tool called through `/chat` cannot pause a workflow the way it can on the session
API — it answers with `{"error": "approval required — use the session API"}` instead of hanging
a stateless request.

## Tool extensions and eve portability

`defineTool` accepts eve's real fields (`description`, `inputSchema`, `execute`, `needsApproval`)
plus three trex extensions, each meant to be a no-op or trivially strippable on real eve:

- **`clientOnly: true`** — no `execute`. The tool call is emitted on the stream
  (`actions.requested`, carrying a `clientOnly` flag) for a frontend to render (e.g. a proposal
  card) instead of running server-side; the turn ends with `finishReason: "tool-calls"`, and the
  client's response comes back as context on the next message. Not part of eve's documented event
  shape — a strict eve client would still see the tool call, just without knowing it was
  client-rendered.
- **`needsApproval: true`** — eve-native, honored for real. The turn pauses at the tool call, an
  `input.requested` event goes to the stream with an approval request, and the tool's `execute`
  only runs after `POST .../session/:id` (with `inputResponses`) or `POST .../approval` resolves
  it `"approve"`. A `"deny"` or a timeout (default 5 minutes) makes the tool call return an error
  result instead of running. The wait is polled in-process inside the live request — see the
  durability note below for what happens if the worker restarts mid-wait.
- **`idempotent: true`** — an eve-native hint intended for a workflow retry policy. It is accepted
  and typed but currently a no-op: v1 has no Workflow DevKit integration and therefore no retry
  policy that reads it (see "Durability" below).

`inputSchema` also accepts a raw JSON Schema object in addition to eve-native zod — additive, not
a break; needed for the ClojureScript authoring path where tools are compiled ahead of time to
plain JSON Schema.

## Sandboxing

Tools run **in-process** in the agent's Deno worker — there is no microVM or other sandbox
isolation (eve's `sandbox/` directory, and any seeded `/workspace`, is not implemented; it's
detected and ignored the same way `channels/`/`connections/` are). A tool has the same
filesystem/network access as the worker process itself. This is an intentional, documented
out-of-scope decision (spec §1) rather than an oversight: trex's self-hosted trust model assumes
the operator running the stack trusts the plugins they install, the same way a `functions` plugin
already runs arbitrary server-side code. Don't load an agent directory (or its tools) from an
untrusted source.

## Durability

Every step of a turn (`model`, `text`, `tool-call`, `tool-result`, `client-tool-call`, `error`,
`finish`) is persisted to Postgres as it happens, in a dedicated `agents` schema:
`agents.sessions` → `agents.turns` → `agents.steps`, plus `agents.approvals` for pending
`needsApproval` decisions. A client that reconnects to `.../stream` gets replay of everything
already persisted, followed by the live tail.

This is **turn-level durability**, not full workflow durability. The design considered adopting
the open-source Workflow DevKit (one turn = one workflow run, replay-safe steps, park/resume
surviving a process restart) and reserved a nullable `agents.turns.workflow_run_id` column for it,
but a go/no-go spike found architectural blockers in this codebase (no compiler pass available at
runtime for dynamically-loaded agent directories, no persistent worker process in trex's model) —
verdict **NO-GO**. Per the spec's own fallback rule, that integration was skipped for v1. Concrete
consequences:

- If the worker process dies mid-turn (mid model call or mid tool execution), the turn is left in
  `running` status forever — nothing resumes it automatically.
- A `needsApproval` wait lives entirely in-memory inside the one live request handling that turn.
  The `agents.approvals` row itself survives a restart (the decision is durable once made), but if
  the worker restarts while a decision is still pending, nothing is left running to observe it —
  that turn is stranded.
- Not every wire event is replayable: `turn.started`, `session.waiting`, and `session.failed` are
  published live only (no matching `agents.steps` row), so a client that reconnects with
  `?startIndex=<n>` after missing one of those three will never see it.

See COMPAT.md's "Durability" section for the full detail and the spike writeup at
`specs/006-agents-plugin-type/spike-workflow.md`.

## Evals

Eve's evals convention is adopted unchanged: an `evals/` directory with one `evals.config.ts` at
its root plus `evals/**/*.eval.ts` files (one file per eval, path = eval id), authored with
`defineEval({ description, judge?, async test(t) {...} })`.

`plugins-dev/toy-agent/evals/evals.config.ts`:

```ts
import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({});
```

`plugins-dev/toy-agent/evals/echo.eval.ts`:

```ts
import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

export default defineEval({
  description: "toy agent echoes via the echo tool",
  async test(t) {
    await t.send("Use the echo tool to echo the word banana, then repeat it.");
    t.succeeded();
    t.calledTool("echo");
    t.check(t.reply, includes("banana"));
  },
});
```

The primary way to run evals is the real `eve` CLI, against a live trex-hosted agent:

```bash
cd plugins-dev/toy-agent
npx eve eval --url https://<trex>/plugins/<scope>/<agent>
```

This has been verified end-to-end: against a live target running trex's actual
`handler.ts`/`store.ts`/`runner.ts`/`loader.ts` code, the real `eve@0.19.0` CLI passes all three
gates (`succeeded`, `calledTool(echo)`, `includes(banana)`) — `3/3` — with no fallback runner
needed. `core/server/agents/eve-shim/evals.ts` only exists to make `.eval.ts` files loadable by a
possible trex-side fallback runner in the future; it is not required for the `eve eval --url` path
above to work. See COMPAT.md's "eve-eval verdict" section for the full run log.

## Further reading

[COMPAT.md](./COMPAT.md) has the full reconciliation against real eve: every deliberate divergence
in the HTTP/event surface, everything the loader ignores entirely (`channels/`, `connections/`,
`sandbox/`, `schedules/`, `hooks/`, and several stream events eve documents that we don't emit),
the AI SDK version skew between eve's tooling and trex's runtime, and the verified-vs-provisional
breakdown of what was actually exercised end-to-end.
