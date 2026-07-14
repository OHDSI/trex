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

See `plugins/claw/agent/ACCEPTANCE.md` for the live-acceptance checklist that
exercises this contract end-to-end against a real Discord app and Code agent.

## Webhook vs. gateway mode

It's the same Discord bot either way — same application, token, permissions,
slash commands, and approval buttons. Only the transport differs:

- **Webhook mode** (default): Discord POSTs signed interactions to the public
  route `{base}/plugins/trex/claw/eve/v1/discord`. Requires setting that URL as
  the app's *Interactions Endpoint URL* in the developer portal, which means the
  deployment must be publicly reachable. `DISCORD_PUBLIC_KEY` is required.
- **Gateway mode** (`DISCORD_GATEWAY=1`): the server opens an *outbound*
  WebSocket to Discord's gateway (`core/server/agents/gateway/discord.ts`) and
  interactions arrive over it — no public URL, works behind NAT/firewalls.
  Leave the *Interactions Endpoint URL* **unset** in the portal (Discord routes
  interactions to the gateway exactly when no endpoint URL is registered).
  `DISCORD_PUBLIC_KEY` is not used: the host signs the loopback hand-off to the
  (unchanged) channel adapter with a boot-time ephemeral key, and the interaction
  ACK is delivered via the REST interaction callback instead of the HTTP response.
