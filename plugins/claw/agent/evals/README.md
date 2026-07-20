# claw eval suite

Behavioral evals for the **claw facilitator** agent, in the shape of the devx
suite (`plugins/devx/agent/evals`). They run against a **live stack** via
`eve eval` and assert claw's tool-call decisions.

## Run

```
EVE_TARGET_URL=http://localhost:41100/plugins/trex/claw \
EVE_EVAL_AUTH_TOKEN=<token> \
npm run eval
```

(Auth token: mint a devx-user JWT the same way `lib/code-stream.ts` does, or
reuse the devx suite's `mint-eval-token.sh`.)

## What's here

- `smoke/responds.eval.ts` — liveness: claw completes a turn.
- `modes/clarify-before-delegate.eval.ts` — the key gate: a vague ask is NOT
  delegated to the coder (`notCalledTool("askCodeAgent")`) before clarification.
- `modes/plans-clear-ask.eval.ts` — a clear ask (scope + acceptance) reaches the
  coder to plan (`calledTool("askCodeAgent")`).
- `modes/thread-native-no-refetch.eval.ts` — thread-native conversations (#159):
  an injected `<thread_messages>` block IS the discussion, so claw does NOT
  `fetchChannelHistory` before delegating.
- `modes/mention-context-is-background.eval.ts` — @mentions (#159): the mention
  text is the task and the `<channel_messages>` block is background context (not
  re-fetched); a clear mention is acted on.
- `modes/acknowledge-before-delegate.eval.ts` — acknowledge-before-act (#161):
  claw `postUpdate`s a status line before the `askCodeAgent` hand-off
  (`toolOrder(["postUpdate", "askCodeAgent"])`).
- `modes/grounds-and-surfaces-options.eval.ts` — Gate 1: claw grounds the ask in
  an app (`listApps`) and surfaces the coder's brainstorm options as a dropdown
  (`toolOrder(["askCodeAgent", "postChoice"])`) rather than picking itself.
- `modes/mockups-before-choice.eval.ts` — the `present-mockups` skill: a visual
  design decision goes to the team as posted mockup screenshots BEFORE the
  choice (`toolOrder(["postScreenshots", "postChoice"])`); the askCodeAgent
  stub's mockup branch supplies the canned screenshot paths.
- `modes/mockups-only-stops.eval.ts` — mockups-only mode: "just mock up some
  ideas" ends with posted screenshots and no plan gate
  (`notCalledTool("awaitApproval")` — the overrun a build-task misread would
  produce in-turn, since the stubbed postChoice never parks).

> The four `#159`/`#161`-era evals above were added after the agent changes that
> introduced those behaviors; they are single-turn and reuse the existing stub
> layer (no new metadata/stub). They have not yet been run against a live stack
> in this worktree (`node_modules` not installed here) — run the suite per below
> to confirm before relying on them.

## Why the suite is deliberately small

claw's tools have **real side effects** — `fetchChannelHistory` hits the Discord
API, `askCodeAgent` spawns a live coder turn, `postChoice`/`awaitApproval`/
`postScreenshots` post to a channel — unlike the devx agent's file/sql tools that
run against a seeded workspace. So the evals here focus on decisions that are
safe and channel-independent (chiefly "did claw refrain from delegating?"), with
the discussion supplied inline in the prompt.

Richer behavioral evals (the coder is engaged only after both plan gates; a
report triggers the apply-fixes gate; screenshots posted on visual work) need
**eval-safe tool stubs** — a mode where claw's Discord/coder tools return canned
data instead of calling out. That stubbing layer is the natural next step for
this suite.

## Unit tests

Pure-logic coverage for the tools/lib lives next to the code as `*.test.ts`
(run with `deno test`): `lib/discord-rest.test.ts` (message/attachment payloads),
`lib/workspace.test.ts` (path safety + workspace resolution),
`lib/code-session.test.ts`, `lib/state.test.ts`, `tools/askCodeAgent.test.ts`, etc.
