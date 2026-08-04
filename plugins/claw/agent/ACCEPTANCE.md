# claw — live acceptance (user environment)

These require a real Discord app + a running trex stack with the Code agent; they
cannot be unit-tested.

- [ ] Register a Discord application named **trex**; set the interactions
      endpoint to the claw channel route `{basePath}/eve/v1/discord`; register a
      `/trex` slash command that takes a free-text `message` option (participants
      speak to claw with `/trex <message>`); set `DISCORD_PUBLIC_KEY`,
      `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `CLAW_API_KEY`.
- [ ] `/trex <ask>` in a channel → claw reads recent messages, summarizes the
      ask, and either hands the coder clear instructions or, if the ask is
      unclear, **posts a focused clarifying question to the channel** and waits.
- [ ] Answer claw's clarifying question with another `/trex <answer>` → claw
      incorporates it and (once clear) delegates to the coding agent. Confirm it
      does NOT delegate a vague ask.
- [ ] The coding agent runs its own process (design → plan → implement → checks)
      with its **full toolset** — verify its skills/subagents are available (they
      are NOT in devx "plan" mode); claw posts its designs/plans/results back to
      the channel.
- [ ] When the coder asks a question, claw either answers it from the discussion
      or relays it to the channel and passes the human's answer back — all on the
      SAME coding-agent session (per-channel stable session; history retained).
- [ ] The coder finishes (implemented, checks passing, committed/pushed if it does
      so) → claw posts a short summary. Verify delivery still lands if a coder
      turn exceeds ~15 min (bot-token channel-message fallback).
- [ ] Two channels in parallel keep independent sessions/state.
- [ ] `/trex <ask>` in a regular channel → a public thread named after the ask
      is created, the deferred response becomes a `Started <#thread>` pointer,
      and claw's replies/questions/buttons land IN the thread.
- [ ] `/trex` inside the task thread continues the SAME session; a second
      `/trex` in the channel spawns a SECOND thread whose task proceeds in
      parallel with its own Code-agent session.
- [ ] With `DISCORD_ALLOWED_CHANNELS` set to the parent channel id, `/trex`
      inside its task threads still passes the allow-list.
- [ ] Rotate DISCORD_BOT_TOKEN / CLAW_API_KEY on the host → confirm the change
      takes effect only after the claw worker/plugin is restarted (env is baked
      in at worker creation).
- [ ] @trex mention in an allow-listed channel creates a task thread anchored
      to the mention and claw replies in it
- [ ] a plain (unmentioned) message in that thread gets a claw reply
- [ ] a message from a non-allow-listed user in the thread is silently ignored
- [ ] two parallel task threads produce two distinct coder worktrees
      (`claw/<chatId>` branches)
- [ ] with DISCORD_MESSAGES unset, /trex still works and plain messages do nothing
