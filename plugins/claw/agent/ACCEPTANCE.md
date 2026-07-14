# claw — live acceptance (user environment)

These require a real Discord app + a running trex stack with the Code agent; they
cannot be unit-tested.

- [ ] Register a Discord application named **trex**; set the interactions
      endpoint to the claw channel route `{basePath}/eve/v1/discord`; register a
      `/trex` slash command with subcommands `build`, `approve`, and `adjust`
      (`adjust` takes a free-text `notes` option); set `DISCORD_PUBLIC_KEY`,
      `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, `CLAW_API_KEY`.
- [ ] `/trex build <ask>` in a channel → claw fetches history and posts a plan as
      a message, inviting `/trex approve` or `/trex adjust <notes>`. (Plan
      approval uses follow-up slash commands, not buttons — the framework's
      in-turn approval button has a ~5-min timeout, too short for plan
      deliberation; only the binary ship gate uses a button.)
- [ ] `/trex adjust <notes>` → plan is revised on the SAME Code session and the
      SAME claw session (history/state retained; per-channel stable session).
- [ ] `/trex approve` → claw runs a `build` turn; the Code agent implements, runs
      checks, autofixes, and claw posts the diff summary (verify delivery still
      lands if the build exceeds ~15 min — bot-token channel-message fallback).
- [ ] Ship gate button → approve → Code commits/pushes; claw posts the result.
- [ ] Deny the ship gate → claw reports shipping declined; nothing is pushed.
- [ ] Two channels in parallel keep independent sessions/state.
- [ ] Rotate DISCORD_BOT_TOKEN / CLAW_API_KEY on the host → confirm the change takes effect only after the claw worker/plugin is restarted (env is baked in at worker creation).
