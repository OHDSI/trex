# @trex/d2esupport

A Slack-facing **support triage** agent for the data2evidence (d2e) platform.
It talks to end users in Slack, turns valid requests into a task for the dev
team (via `@trex/claw`), and delivers the team's human-approved answer back
into the original thread. It never answers d2e questions itself and never
files a task without a concrete brief — see `plugins/d2esupport/agent/instructions.md`
for the full triage script.

## Flow

1. A Slack user DMs the bot or `@mentions` it: **d2esupport triages**. If the
   report is plausibly about d2e but too vague to act on, it asks focused
   follow-up questions in the thread until it has a concrete brief (what
   happens, where in d2e, what was expected, error text if any). Off-topic
   requests get a polite one-line decline — no task is filed.
2. Once the brief is solid, d2esupport calls the `forwardToClaw` tool, which
   sends a `SUPPORT_TASK` message to a claw session (starting one on first
   contact, continuing the same session for follow-ups) and records the
   linkage (Slack channel/thread ↔ claw session) in `d2esupport.tasks`.
3. claw investigates (see `plugins/claw/agent/skills/handle-support-task.md`),
   posts a summary with a real Discord mention into `CLAW_DEV_CHANNEL_ID`, and
   opens a review thread there with a proposed reply. A human reviews/edits and
   approves it via the thread's buttons.
4. Approval triggers an `APPROVED_REPLY` turn back on the *d2esupport* session.
   d2esupport delivers that text **verbatim** into the user's Slack thread via
   the `postSlackReply` tool (see "Contracts" below for why this is an
   explicit tool rather than automatic channel delivery), and marks the task
   `answered`.

## Slack app setup

Socket Mode (gateway), not the HTTP Events API — no public Request URL needed:

- **Socket Mode: ON** (Settings → Socket Mode).
- **App-level token**: create one with the `connections:write` scope
  (Settings → Basic Information → App-Level Tokens). This is `SLACK_APP_TOKEN`.
- **Bot token scopes** (OAuth & Permissions): `app_mentions:read`,
  `im:history`, `chat:write`. Install/reinstall the app to mint the bot token
  (`SLACK_BOT_TOKEN`, starts with `xoxb-`).
- **Event Subscriptions**: subscribe to the bot events `app_mention` and
  `message.im`. No Request URL field to fill in — Socket Mode delivers events
  over the open WebSocket instead (`core/server/agents/gateway/slack.ts`).

## Env vars

Set these as host env vars before registering the plugin; the manifest
(`plugins/d2esupport/package.json` → `trex.agents[0].env`) passes them through
via `${VAR:-default}` substitution, same mechanism as claw:

| Var | Default | Purpose |
| --- | --- | --- |
| `D2ESUPPORT_MODEL_PROVIDER` | `anthropic` | Model provider for d2esupport's own turns |
| `D2ESUPPORT_MODEL_ID` | `claude-sonnet-5` | Model id for d2esupport's own turns |
| `D2ESUPPORT_API_KEY` | — (required) | API key for d2esupport's model provider |
| `D2ESUPPORT_MODEL_BASE_URL` | — (optional) | Custom model endpoint / proxy |
| `SLACK_BOT_TOKEN` | — (required) | Bot token (`xoxb-...`) |
| `SLACK_APP_TOKEN` | — (required) | App-level token (`xapp-...`, `connections:write`) for Socket Mode |
| `SLACK_SIGNING_SECRET` | — (optional) | Only needed if you also run the HTTP Events API path; unused in pure Socket Mode |
| `SLACK_GATEWAY` | — (optional) | Set to `1` to run the Slack gateway (Socket Mode) — required for this agent |
| `SLACK_ALLOWED_USERS` | — (optional) | Comma-separated Slack user-id bootstrap allow-list — lets the first operator reach Slack before any row exists in `devx.slack_allowlist` |
| `D2ESUPPORT_USER_ID` | — (recommended) | devx user id (uuid) the agent mints loopback tokens as, for calling devx's `/support/*` routes (allowlist checks) and for `forwardToClaw`'s `ctx.userId` fallback |

## Allowlist + user-map settings (devx)

Two instance-global tables, deliberately not user-scoped, managed from the
devx Settings → Support screen (`plugins/devx/src/components/settings/SupportSection.tsx`,
`plugins/devx/src/hooks/useSupportSettings.ts`) via `plugins/devx/functions/routes/support_routes.ts`:

- **Slack allowlist** (`devx.slack_allowlist`): which Slack user ids may file
  support tasks at all. Checked in the channel adapter's `allow` callback
  (`plugins/d2esupport/agent/channels/slack.ts` → `isAllowedSlackUser`,
  `plugins/d2esupport/agent/lib/allowlist.ts`) *before* any message reaches the
  model — a denied user gets no response and no session, only a log line.
  `SLACK_ALLOWED_USERS` is checked first as a bootstrap fallback; the DB check
  result is cached 60s per user and fails closed on any error.
- **User map** (`devx.user_map`): GitHub login → Discord user id + display
  name, used by claw's `lookupDiscordIds` tool to `@mention` the right people
  when posting the dev-channel summary.

Routes: `GET/POST /support/user-map`, `PATCH/DELETE /support/user-map/:id`,
`GET /support/discord-ids?logins=a,b`, `GET/POST /support/slack-allowlist`,
`GET /support/slack-allowlist/check?user=...`, `DELETE /support/slack-allowlist/:id`.
Schema: `plugins/devx/migrations/V13__support_settings.sql`.

## Contracts

- **`SUPPORT_TASK`** (d2esupport → claw, via `forwardToClaw`): a plain-text
  message of the form `SUPPORT_TASK\nsupport_session: <id>\nkind: <bug|feature|data-issue>\nslack_user: <id>\nbrief:\n<text>`,
  sent as a new or continued turn on the linked claw session
  (`plugins/d2esupport/agent/tools/forwardToClaw.ts`,
  `plugins/d2esupport/agent/lib/claw-session.ts`). claw's
  `handle-support-task` skill parses it, investigates, and files the task in
  `claw.support_tasks`.
- **`APPROVED_REPLY`** (claw → d2esupport): once a human approves a proposed
  reply in the Discord review thread, claw starts a turn on the *d2esupport*
  session with `APPROVED_REPLY\n<verbatim text>`. d2esupport's instructions
  require it to deliver everything after the marker unmodified via
  `postSlackReply` — it must never edit or summarize the approved text.
  `postSlackReply` is an explicit tool (not automatic channel delivery)
  because API-triggered turns like this one have no originating channel turn
  to ride delivery on — see the comment atop
  `plugins/d2esupport/agent/tools/postSlackReply.ts`.

State tables: `d2esupport.tasks` (Slack channel/thread ↔ claw session ↔
status: `forwarded`/`answered`) and `claw.support_tasks` (claw's own record,
status progresses to `sent` once `replyToSupport` runs). See
`plugins/d2esupport/migrations/V1__initial_schema.sql` and
`plugins/claw/migrations/V3__support_tasks.sql`.

## Live verification

The following checklist is **not automated** — it requires a live dev-stack
boot with real Slack/Discord credentials and is run manually. Boot notes:
`docker-compose.dev.yml` (secrets perms, `env_file` timing, apply
`core/schema/V*.sql` manually for the DEK) — see the dev-stack-local-boot
gotcha in project memory.

1. Boot the dev stack with claw + d2esupport + devx registered; set the
   Slack/Discord env vars.
2. Slack: `@d2e support` from a non-allowlisted user → silent/no task (check
   logs for the deny).
3. devx Settings → Support: add your Slack user; add a GitHub→Discord mapping
   for yourself.
4. Slack: report a vague d2e bug → agent asks a follow-up; answer → agent
   files the task (thread ack).
5. Discord dev channel: summary appears with a real mention + review thread
   with the proposed reply.
6. Thread: ask for a wording change → new draft posted; approve via the
   buttons.
7. Slack thread: approved reply arrives verbatim;
   `d2esupport.tasks.status = 'answered'`, `claw.support_tasks.status = 'sent'`.
8. Off-topic Slack request → polite decline, no task filed.

Known risk areas to watch while running this: eve session-surface auth for
cross-plugin loopback calls (minted token + `x-user-id`),
`assistant.threads.setStatus` failures are swallowed, and `startIndex=0`
re-streams history on long sessions (acceptable — reply extraction takes the
LAST `message.completed` before the terminal event).
