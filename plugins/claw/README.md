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
| `DISCORD_BOT_TOKEN` | — (required) | Discord bot token (REST calls, fallback delivery) |
| `DISCORD_PUBLIC_KEY` | — (required) | Discord interactions request signature verification |
| `DISCORD_APPLICATION_ID` | — (required) | Discord application id |

See `plugins/claw/agent/ACCEPTANCE.md` for the live-acceptance checklist that
exercises this contract end-to-end against a real Discord app and Code agent.
