# Channels — live-acceptance checklist

The channels feature is fully unit-tested (layer + per-adapter, with mock
platform HTTP and known signature vectors — see `channels/*.test.ts` and
`channels/adapters/*.test.ts`). What those tests **cannot** cover is a real
end-to-end round trip against a live platform, because that needs real platform
credentials and a publicly reachable trex host. This file is the manual
checklist to run once such an environment is available (the deferred
"live acceptance" step from spec §8/§10).

Do it with **Discord** — it is the reference adapter (cleanest vendor split,
all pure helpers vendored) and gives the fastest signature-verify + slash +
button loop.

## Prerequisites

- A trex host reachable from the public internet at
  `<trex-host>/plugins/<scope>/<agent>/…` (Discord posts webhooks to it). A
  tunnel (e.g. ngrok/cloudflared) to a local stack is fine.
- An agent directory with `channels/discord.ts`:
  ```ts
  import { discordChannel } from "eve/channels/discord";
  export default discordChannel();
  ```
- A Discord application (Developer Portal) with a bot, and these env vars set
  on the agent worker (host env or the per-agent manifest `env`):
  `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DISCORD_BOT_TOKEN`.
- A model credential wired for the agent (`ANTHROPIC_API_KEY` etc., or
  `TREX_AGENTS_DEFAULT_MODEL`), so a turn can actually run.

## Steps

1. **Register the interactions URL.** In the Developer Portal, set the app's
   **Interactions Endpoint URL** to
   `<trex-host>/plugins/<scope>/<agent>/eve/v1/discord`. Discord immediately
   sends a signed PING — the save **succeeds only if the adapter's Ed25519
   verify passes and it replies with the PONG**. A failed save = a signature or
   routing problem (check the route is exempt from `pluginAuthz` and the public
   key matches).
   - _Verifies:_ platform-signature route auth (COMPAT "Channels" divergence 2),
     WebCrypto Ed25519 verify.

2. **Register + invoke a command / mention.** Register a slash command (or DM
   the bot / @-mention it in a channel the bot can see). Send it a prompt that
   makes the agent use a tool, e.g. "use the echo tool to echo the word banana".
   - _Expect:_ Discord shows the deferred "thinking" ACK within ~3s, then the
     real reply arrives a moment later (background `waitUntil` delivery).
   - _Verifies:_ inbound prompt extraction, session create via `send()`, a turn
     actually running, and server-initiated background delivery with no HTTP
     client attached.

3. **Confirm the turn ran + reply delivered.** The reply text should contain
   the tool's output ("banana"). Optionally check the DB: an `agents.sessions`
   row with the Discord principal on `principal_id`/`authenticator`, an
   `agents.channel_sessions` row mapping `(discord, <token>)` → that session,
   and `agents.turns`/`agents.steps` rows for the turn.
   - _Verifies:_ continuation-token addressing + principal storage (COMPAT
     divergence 4), reply formatting / 2000-char split.

4. **Surface a HITL button.** Give the agent a `needsApproval: true` tool and
   prompt it to call that tool. The adapter should render a Discord **approval
   button/component** on the message.
   - _Verifies:_ `input.requested` → platform-widget encode (vendored HITL).

5. **HITL resume — EXPECTED TO NOT CLOSE by default.** Click the approval
   button. With the **default `opts.resume` (a loud no-op)** the click is
   acknowledged but the parked turn is **not** resumed — you should see the
   adapter's warning log ("HITL resume received but no opts.resume provided …")
   and the turn stays parked. This is the documented v1 limitation (COMPAT
   "Channels — known v1 limitations" (a)), not a bug in this run.
   - To exercise a full HITL close, re-run with a `resume` wired:
     `discordChannel({ resume: myResumeFn })`, where `myResumeFn` calls the
     native approval route
     (`POST …/eve/v1/session/:id/approval` with the `requestId` + `decision`)
     for the parked session. Then the click should resume the turn and the final
     reply should be delivered.

## Pass criteria

- Steps 1–4 pass (URL saves, command runs a turn, reply delivered, HITL button
  renders).
- Step 5 behaves as documented: **no-op resume by default** (warning logged,
  turn parked); **full close only with a wired `opts.resume`**.

Record the outcome (and any field/shape surprises — especially for adapters
mock-tested only, e.g. Linear's `commentCreate`) back into
`channels/vendor/VENDOR.md` or COMPAT.md so the next re-sync inherits it.
