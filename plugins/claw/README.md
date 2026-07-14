# @trex/claw

A thin orchestration agent: turns a chat-channel discussion into a consensus
task, drives the Code agent (`devx-agent`) through plan → approval → build
(checks + autofixes) → ship, and reports back to the channel. See
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
| `DISCORD_BOT_TOKEN` | — (required) | Discord bot token (REST calls, fallback delivery) |
| `DISCORD_PUBLIC_KEY` | — (required) | Discord interactions request signature verification |
| `DISCORD_APPLICATION_ID` | — (required) | Discord application id |

See `plugins/claw/agent/ACCEPTANCE.md` for the live-acceptance checklist that
exercises this contract end-to-end against a real Discord app and Code agent.
