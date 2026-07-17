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
