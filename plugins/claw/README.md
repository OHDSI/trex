# @trex/claw

A thin **facilitator** agent between a team's chat channel and the coding agent
(`devx-agent`). It reads the channel discussion, **clarifies anything unclear
with the participants**, hands the coding agent clear instructions, and mediates
the back-and-forth (posting the coder's designs / plans / results back to the
channel). It never sets a coding-agent "mode" — the coder always runs with its
full toolset (so its own superpowers skills + subagents are available) and drives
its own gated planning/implementation. See
`docs/superpowers/specs/2026-07-14-claw-agent-plugin-design.md`.

## Env contract

Set these as host env vars before registering the plugin — the manifest's
`trex.agents[0].env` block (`plugins/claw/package.json`) passes them through to
the agent worker at registration time via `${VAR:-default}` substitution
(see `core/server/plugin/agents.ts` / `function.ts#substituteEnvVarsInObject`):

| Var | Default | Purpose |
| --- | --- | --- |
| `CLAW_MODEL_PROVIDER` | `anthropic` | Model provider for claw's own turns |
| `CLAW_MODEL_ID` | `claude-sonnet-5` | Model id for claw's own turns |
| `CLAW_API_KEY` | — (required) | API key for claw's model provider |
| `CLAW_MODEL_BASE_URL` | — (optional) | Custom model endpoint / proxy for claw's own turns |
| `DISCORD_BOT_TOKEN` | — (required) | Discord bot token (REST calls, fallback delivery; gateway auth in gateway mode) |
| `DISCORD_PUBLIC_KEY` | — (webhook mode only) | Discord interactions request signature verification |
| `DISCORD_APPLICATION_ID` | — (required) | Discord application id |
| `DISCORD_ALLOWED_USERS` | — (optional) | Comma-separated user-id allow-list |
| `DISCORD_ALLOWED_CHANNELS` | — (optional) | Comma-separated channel-id allow-list |
| `DISCORD_GATEWAY` | — (optional) | Set to `1` to receive interactions over the gateway WebSocket instead of the webhook (below) |
| `DISCORD_MESSAGES` | — (optional) | Set to `1` to also receive @trex mentions and task-thread messages (gateway mode only; requires the privileged **Message Content** intent in the developer portal) |
| `CLAW_CODE_USER_ID` | — (recommended) | devx user id (uuid) the Code sessions run as — Discord sessions carry no trex user, and apps/workspaces are user-scoped, so set this to YOUR devx user id so `listApps` and the coder's workspace match the devx UI |

See `plugins/claw/agent/ACCEPTANCE.md` for the live-acceptance checklist that
exercises this contract end-to-end against a real Discord app and Code agent.

## Two coder transports

claw talks to the coder over one of two transports, chosen per-turn by the
coder account's devx provider (`plugins/claw/agent/lib/code-route.ts`'s
`chooseCoderTransport`, mirroring devx's `resolveEffectiveLoop`):

- **`claude-code` provider → legacy** (`lib/code-stream.ts`): the sidecar
  engine, driven through the `devx-api` chat endpoints
  (`POST /chats`, `POST /chats/:id/stream`). This is the only engine the eve
  runtime cannot host, which is why it keeps its own transport.
- **every other provider (including none set) → eve** (`lib/code-session.ts`):
  the ported eve/agents session API, hit directly on the `devx-agent` mount
  (`POST /eve/v1/session`, `GET .../stream`, `POST .../approval`).

**Approval gating differs sharply between the two, and switching an account's
provider changes gating behaviour with no other configuration change:**

- On the **eve** path, a `needsApproval` tool call parks the turn
  (`input.requested`) and claw renders the pending request as a real approval
  gate in the task's Discord thread (`lib/coder-approval.ts`'s
  `postApprovalGates`). A human's decision reaches the coder via the
  `resolveCoderApproval` tool, which calls `code-session.ts`'s
  `resolveCodeApproval` (`POST .../approval`) and then re-attaches the stream
  to collect the rest of the turn — nothing is auto-approved.
  `lib/code-route.ts:routeCodeTurn` even asks the pending-approval endpoint
  directly on reconnect, so a gate published while claw wasn't attached is
  never silently missed.
- On the **legacy** path, `code-stream.ts`'s `streamTurn` sends
  `remoteChannel: true` and reads the turn straight to completion — there is
  no approval gate at all; the sidecar auto-approves everything it does. An
  operator moving a coder account from `claude-code` to any other provider
  (or back) changes gating behaviour as a side effect, with nothing in
  Settings calling that out.

## Surfacing claw chats in the devx UI

**This only holds for the legacy transport.** claw's legacy path drives its
coding turns through the same `devx-api` chat endpoints the devx browser UI
uses, so each such claw task is already a real `devx.chats` row with its full
transcript in `devx.messages`. To see those chats in devx:

1. Set `CLAW_CODE_USER_ID` to the uuid of the devx user you log in as (the
   `x-user-id` / JWT `sub` devx sends for that account). This makes claw's chats
   owned by you instead of an anonymous bot user, so they pass the chat-list filter
   `WHERE user_id = <you>`.
2. Make sure that devx account has an active provider configured (Settings) —
   claw turns use the chat owner's provider settings.

The chats are titled "Discord (claw)" and, when the task targets an app, carry that
app's `app_id`, so they appear under that app's chat list (same scoping as user chats
created within an app) rather than the top-level sidebar. A claw chat created without
an app (`app_id` null) appears in the top-level chat list instead. Opening one shows
the full transcript and tool calls, and it updates live while open (see the
poll-while-viewing behaviour in `plugins/devx/src/hooks/useMessages.ts`).

Note: `CLAW_CODE_USER_ID` is deployment-wide, so every claw chat (from any Discord
user) is owned by this single account. This suits a single-operator setup.

**On the eve transport, this visibility does NOT carry over — a coder session
is not visible in the devx UI at all.** `lib/code-session.ts` calls the
`devx-agent`'s `eve/v1/session` API directly and never touches `devx-api`'s
`/chats` or `/messages` endpoints, so no `devx.chats` row is ever created or
updated for that task; the chat list (`plugins/devx/functions/index.ts`'s
`GET /chats`) reads only `devx.chats` and so has nothing to show. Inside the
devx UI's own agent-chat page, the equivalent live view
(`plugins/devx/src/hooks/useAgentsChat.ts`) *also* opens an eve session under
the hood, but that hook additionally calls `api.createMessage(chatId, …)` for
both the user and assistant turns to mirror them into `devx.messages` against
an already-existing `devx.chats` row — that mirroring is browser-side glue
the hook performs on top of the session API, not something the eve session
itself does, and claw's backend transport never performs it. `core/server/agents`
has no notion of `devx.chats` at all. Net effect: PR #176's live-visibility
feature, built and verified against the legacy transport, silently does not
apply once a coder account is moved to the eve transport. This is a real gap,
not yet fixed — flagged here rather than fixed, per this task's scope.

## Thread per task

A `/trex` in a regular channel creates a **public thread** for the task and the
whole conversation (claw's replies, clarifying questions, approval buttons)
happens there; the command's response in the channel is a pointer to the
thread. Each thread is its own session, so tasks run **in parallel** — one per
thread. A `/trex` inside a thread continues that thread's session. Falls back
to the in-channel session when thread creation fails (missing permission, DMs).

Bot permissions needed: View Channels, Send Messages, Read Message History,
**Create Public Threads**, **Send Messages in Threads**. Allow-listing a
channel in `DISCORD_ALLOWED_CHANNELS` covers the task threads inside it.

With `DISCORD_MESSAGES=1` (gateway mode only) two more entry points open up:
an `@trex <task>` mention in a channel behaves exactly like `/trex` (the task
thread is anchored to the mention message), and **any** message a teammate
posts inside a claw task thread continues that thread's session — no mention
or slash command needed. Discord never delivers regular messages to webhook
endpoints, so both require gateway mode, plus the privileged *Message
Content* intent (Bot → Privileged Gateway Intents) — without it the gateway
connection is refused (close code 4014).

## Webhook vs. gateway mode

It's the same Discord bot either way — same application, token, permissions,
slash commands, and approval buttons. Only the transport differs:

- **Webhook mode** (default): Discord POSTs signed interactions to the public
  route `{base}/plugins/trex/claw/eve/v1/discord`. Requires setting that URL as
  the app's *Interactions Endpoint URL* in the developer portal, which means the
  deployment must be publicly reachable. `DISCORD_PUBLIC_KEY` is required.
- **Gateway mode** (`DISCORD_GATEWAY=1`): opt-in **per agent** — the switch only
  takes effect through the agent's own manifest env block (this plugin passes it
  through; a host-wide env var alone enables nothing). The server opens an *outbound*
  WebSocket to Discord's gateway (`core/server/agents/gateway/discord.ts`) and
  interactions arrive over it — no public URL, works behind NAT/firewalls.
  Leave the *Interactions Endpoint URL* **unset** in the portal (Discord routes
  interactions to the gateway exactly when no endpoint URL is registered).
  `DISCORD_PUBLIC_KEY` is not used: the host signs the loopback hand-off to the
  (unchanged) channel adapter with a boot-time ephemeral key, and the interaction
  ACK is delivered via the REST interaction callback instead of the HTTP response.

## Support tasks

claw also handles support tasks handed off from `@trex/d2esupport` (the Slack
triage agent): it investigates the report, posts a summary with a real
Discord `@mention` plus a proposed-reply review thread into
`CLAW_DEV_CHANNEL_ID`, and — once a human approves via the thread's buttons —
delivers the approved text back to d2esupport for posting into the original
Slack thread. See `plugins/claw/agent/skills/handle-support-task.md` for the
full skill and `plugins/d2esupport/README.md` for the other half of the flow
(Slack setup, the `SUPPORT_TASK`/`APPROVED_REPLY` contracts, and the
allowlist/user-map settings). Set `CLAW_DEV_CHANNEL_ID` to the Discord channel
id support summaries and review threads should post into — `postDevSummary`
throws without it.

## Coder-voice contract

The coder must see claw as one person — its own summary of what's needed, in
its own words, never a relayed transcript, never told a team is behind it (see
`agent/instructions.md`'s "Talking to the coder" and `askCodeAgent`'s tool/
`message` descriptions). The real behavioural check is
`agent/evals/evals/modes/coder-gets-summary-not-transcript.eval.ts`, but the
`evals/` suite needs a live stack and no CI workflow runs it, so nothing
enforces this automatically today. `agent/tools/askCodeAgent.test.ts` adds a
plain `deno test` guard on the prompt TEXT only (catches a description edited
back toward "relay the participants") — it cannot verify claw's actual
behaviour, only that the words asking for it are still there.
