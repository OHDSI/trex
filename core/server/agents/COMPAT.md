# eve compatibility notes

This documents how trex's `agents` plugin type (spec `specs/006-agents-plugin-type/`)
compares to real eve, as reconciled against `npm:eve@0.19.0` (`npm pack eve@latest`,
2026-07-03 — docs and source read from the packed tarball under
`docs/` and `dist/`). It supersedes the provisional vocabulary this
implementation started with; `core/server/agents/service/events.ts` and
`handler.ts` were updated in the same commit as this file so the wire surface
matches what's documented below, not the earlier guesses.

## What we implement

An eve-layout agent directory (`instructions.md`, `agent.ts`, `tools/*.ts`,
`skills/*.md`, `subagents/<name>/`, plus an EDN authoring alternative — see
`core/server/agents/loader.ts`) runs as a worker exposing:

- `POST /eve/v1/session` — create a session, optionally with a first message.
  Returns `{ sessionId, continuationToken }` and the `x-eve-session-id`
  header.
- `POST /eve/v1/session/:id` — send a follow-up turn (`message`) and/or answer
  a pending human-input request (`inputResponses`).
- `GET /eve/v1/session/:id/stream` — NDJSON (one JSON object per line) event
  stream, replayable from `?startIndex=<n>`.
- `GET /eve/v1/health`, `GET /eve/v1/info` — target verification routes (the
  ones eve's own `eve eval --url` / `eve dev <url>` poll before treating a URL
  as a live target).
- `POST /chat` — not an eve route; an AI-SDK `toUIMessageStreamResponse()`
  convenience endpoint for `useChat` frontends (Pythia's Vue panel). Kept
  because the underlying loop is `streamText` either way.

Stream event vocabulary (subset of eve's documented set — see
`docs/concepts/sessions-runs-and-streaming.md` in the packed eve tarball):
`turn.started`, `message.appended`, `message.completed`, `actions.requested`,
`action.result`, `input.requested`, `turn.completed`, `turn.failed`,
`session.waiting`, `session.failed`. `session.waiting`/`session.failed`
matter more than they look: eve's own client (`eve/client`'s
`MessageResponse.result()`) ends its per-turn read on
`session.waiting`/`session.completed`/`session.failed`, NOT on
`turn.completed`/`turn.failed` — without one of those three a real eve
client (including `eve eval`) would hang forever after every turn. We emit
`session.waiting` right after a successful `turn.completed` and
`session.failed` right after `turn.failed`; we never emit `session.completed`
(no concept of a session reaching a non-resumable terminal end) or
`session.started` (no distinct session-creation event beyond the
`POST /eve/v1/session` response itself). `message.completed` is likewise
load-bearing, not cosmetic — see divergence 4 below and the eve-eval section:
it is what eve's client actually reads the final reply text off, and its
absence was caught live by a real `eve eval --url` run (first attempt at
this reconciliation shipped without it and failed `includes(banana)` with a
`null` reply despite the text having streamed correctly). Names and the
fields we do carry (`toolCallId`, `toolName`, `input`/`output`,
`messageDelta`/`message`, `usage`, `finishReason`) match eve's; replayed
history (from `agents.steps`) is mapped through the same vocabulary as the
live tail (`handler.ts`'s `stepToEvent`), so a client can't tell replay from
live-tail by event shape.

## Deliberate divergences (HTTP/event level)

1. **`continuationToken` == `sessionId`.** eve treats these as two handles
   owned by different layers (`continuationToken` by the channel,
   `sessionId`/`runId` by the runtime). We have no channel layer, so there is
   only one identity to hand back.
2. **One `actions.requested`/`action.result` event per tool call**, emitted as
   the AI SDK's `fullStream` yields them. eve's docs describe
   `actions.requested` as carrying "one or more actions" — i.e. it can batch
   simultaneous tool calls into one event. We never batch.
3. **No step-level granularity.** eve splits `step.started`/`step.completed`/
   `step.failed` (one model step) from `turn.completed`/`turn.failed` (the
   whole turn). We only emit at the turn boundary — `runTurn`'s per-step loop
   is internal.
4. **`message.completed` is implemented; `reasoning.completed` is not.**
   `message.completed` (final assistant text + `finishReason`, emitted once,
   right before `turn.completed`, only when the turn produced trailing text —
   a pure tool-call turn with no final text emits none) was added mid-way
   through this reconciliation after a real `eve eval --url` run against a
   live target proved eve's own client needs it: `#client/session-utils.js`'s
   `extractCompletedMessage` (which backs `t.reply` and the eval framework's
   `includes()`/`messageIncludes` assertion) only reads the final reply off a
   `message.completed` event whose `finishReason !== "tool-calls"`; it never
   falls back to `message.appended`'s `messageSoFar`. Confirmed: an eval run
   before this fix passed `succeeded`/`calledTool(echo)` but failed
   `includes(banana)` with `t.reply === null`, even though `banana` was
   plainly present in the streamed `message.appended` deltas
   (`.eve/evals/2026-07-03T05-51-26/evals/echo.events.ndjson` in
   `plugins-dev/toy-agent`, kept as evidence — untracked dev fixture output,
   not part of this commit). After adding `message.completed`, the identical
   eval passes (`2026-07-03T06-07-46`) — see "eve-eval verdict" below. We
   still do not implement `reasoning.*`/`reasoning.completed` at all (no
   model-reasoning surface wired) or eve's per-*step* `message.completed`
   semantics (we emit it once per turn, at the true final text, not once per
   model step — see divergence 3's step-granularity note).
5. **HITL is approval-only, `approve`/`deny` only.** `ask_question` (the
   built-in framework tool eve ships for free) is not implemented. In
   `inputResponses`, `optionId` must be `"approve"` or `"deny"`; anything else
   is a 400. Free-text follow-up messages that happen to read "approve" or
   "deny" are **not** auto-resolved against a pending request the way eve's
   docs describe (`docs/tools/human-in-the-loop.md`: "a follow-up whose text
   matches an option ID... resolves automatically") — a client must send
   structured `inputResponses`.
6. **`?replayOnly=1`** is our own addition to the stream route (skip the live
   tail after replay — used by tests and useful for a future eval-runner
   fallback). `?startIndex=<n>` is eve's documented reconnect cursor and
   behaves the same way here (event-count offset into the persisted log).
7. **`GET /eve/v1/info`** is a best-effort reconstruction: `model`,
   `instructions`, `tools` (with `clientOnly`/`needsApproval` flags),
   `skills`, `subagents` are real; `channels`, `schedules`, `connections`,
   `hooks`, `sandbox`, `workflow` are always empty/`null` because we don't
   implement those authored slots (see "What we ignore" below). Within
   `tools`, a zod-authored `inputSchema` is reported as `{}` — eve's
   `AgentInfoResultSchema` requires the key to be present, and we don't
   JSON-serialize zod schemas in v1 (no zod→JSON-Schema conversion wired;
   `handler.ts`'s `toolInfo` falls back to `{}` for anything with a
   `safeParse`). Tools authored with a raw JSON Schema object — which is
   what the CLJS/Pythia authoring path uses (spec §8) — are reported
   faithfully. Introspection-only divergence: execution-side input
   validation uses the real schema either way (`toolset.ts`'s
   `authoredTool`).
8. **`clientOnly` is additive**, carried on `actions.requested` so a frontend
   can tell a client-rendered tool call (e.g. a `propose_card`-style UI
   action, never executed server-side) from one the server actually ran. Not
   part of eve's documented event shape.
9. **`GET /healthz`** is a pre-existing, non-eve alias kept for backward
   compatibility with earlier tests/tooling; `GET /eve/v1/health` is the
   eve-documented route and is what a real eve target-check hits.

## What we ignore entirely

- **`channels/`** — no channel layer (Slack/Discord/Teams/Telegram/Twilio/
  GitHub/Linear/custom/eve's own web channel). Every session is driven
  directly over the HTTP session API; `loader.ts` logs and skips a
  `channels/` directory if present.
- **`connections/`** (MCP, OpenAPI) — not loaded; skipped the same way.
- **`sandbox/`** — not loaded; no seeded `/workspace`, no sandboxed tool
  execution.
- **`schedules/`** — not implemented; no cron-driven turns, no
  `dispatchSchedule`.
- **`hooks/`** — not implemented.
- **`authorization.required`/`authorization.completed`** (connection OAuth
  challenges) — unreachable since we don't implement `connections/`.
- **`compaction.requested`/`compaction.completed`** — no context-window
  compaction; a long session relies on the model's own context window with no
  summarization.
- **`subagent.called`/`subagent.completed`** as *stream* events. Subagents do
  run (`toolset.ts`'s `agent` tool), but as an in-process nested `streamText`
  call folded into the parent's `actions.requested`/`action.result` pair —
  there is no child session, no `childSessionId`, nothing to attach to
  separately. Nested activity is invisible to a stream consumer until the
  subagent call resolves.
- **`result.completed`** / `outputSchema` — no structured per-turn output.
- **`session.started`**, **`message.received`**, **`session.completed`** — not
  emitted. Session creation is signaled by the `POST /eve/v1/session`
  response itself rather than a stream event; there is no ack-style event for
  an inbound message landing; and a session never reaches a declared
  non-resumable terminal state (see `session.waiting`/`session.failed` above,
  which we do emit).
- **Per-input approval policies** (`always()`/`once()`/`never()`, or a custom
  function receiving `{ toolName, toolInput, approvedTools }`) — `needsApproval`
  is a plain boolean on the tool definition (`eve-shim/types.ts`).
- **`agent.ts` fields beyond `model` and `max-steps`**: `reasoning`,
  `modelOptions`, `compaction`, `limits`, `experimental.workflow`,
  `outputSchema`, `build` are all real `defineAgent` fields
  (`docs/agent-config.md`) the loader does not read.
- **zod-only `inputSchema`.** eve's documented tool API is zod-first; our
  `defineTool` also accepts a raw JSON Schema object (needed for the CLJS
  authoring path, spec §8). Additive, not a break — zod schemas still work.

## Durability

Per `specs/006-agents-plugin-type/spec.md` §5, full Workflow-DevKit durability
(one turn = one workflow run, replay-safe steps, park/resume surviving a
process restart) was explicitly a load-bearing risk with a sanctioned
fallback to turn-level durability, gated on a go/no-go spike (plan.md Task 1).
That spike's verdict (`specs/006-agents-plugin-type/spike-workflow.md`) is
**NO-GO** — architectural blockers (no compiler pass available at runtime for
dynamically-loaded agent dirs, no persistent worker process in trex's model),
not something a docker run would have flipped. Per the spec's own fallback
rule, Task 10 (Workflow DevKit integration) is skipped and v1 ships
turn-level durability only — which matches what's actually in this codebase
today: there is no `durable.ts`, no `@workflow/*` dependency, and
`agents.turns.workflow_run_id` is a reserved-but-unused nullable column. As
implemented today:

- Every step (`model`/`text`/`tool-call`/`tool-result`/`client-tool-call`/
  `error`/`finish`) is persisted to `agents.steps` as it happens, so a client
  that reconnects mid-turn gets replay of everything already persisted, plus
  the live tail once it resubscribes.
- **There is no mid-turn resume.** If the worker process dies mid-turn (mid
  model call or mid tool execution), the turn is left in `running` status
  forever — nothing resumes it. eve's durable sessions can pause for HITL "for
  as long as it takes — seconds or days" and resume exactly where they left
  off, including surviving a process restart (`docs/tools/human-in-the-loop.md`).
  Ours cannot: the `needsApproval` wait (`toolset.ts`'s polling `while` loop
  inside `authoredTool`'s `execute`) lives entirely in-memory inside the one
  live request handling that turn. `agents.approvals` rows do survive a
  restart (the decision itself is durable), but nothing is left running to
  observe a late decision — a restart during a pending approval strands that
  turn.
- Session/turn/step rows are the only durability primitive; there is no
  workflow-run id wiring despite the schema's nullable `workflow_run_id`
  column reserved for it (spec §5's "designed once, for both outcomes").
- **Not every wire event is replayable — only the ones with a matching
  `agents.steps` row are.** `turn.started`, `input.requested`,
  `session.waiting`, and `session.failed` are `publish()`-only (live pub/sub,
  see `stream.ts`; `input.requested` is emitted from `toolset.ts`'s approval
  wait and never persisted as a step — the pending `agents.approvals` row is
  durable but has no replay mapping); they
  are never written via `store.addStep`, so `handler.ts`'s replay path
  (`stepToEvent`, driven by `store.listEvents`) can never reconstruct them.
  A client that reconnects with `?startIndex=<n>` after missing one of these
  four live will never see it — not "replayed late," genuinely gone. This
  contradicts eve's stated guarantee ("every event is recorded before a step
  completes, so the whole stream is replayable" —
  `docs/concepts/sessions-runs-and-streaming.md`) and is a real gap, not a
  cosmetic one: `session.waiting` is exactly the event a client needs to know
  a turn ended (see above), so a client that subscribes to the stream a beat
  too late after `POST /eve/v1/session` can end up waiting forever even
  though the turn already finished successfully. Persisting these as
  steps would need a new `agents.steps.kind` value, which the migration's
  `CHECK` constraint doesn't allow without a new migration file — treated as
  out of scope for this reconciliation pass (see "do not rewrite the whole
  streaming layer" in the task brief); flagged here as a concrete follow-up.
  Related replay quirk in the other direction: a turn that failed after
  streaming partial text persists that text via `runner.ts`'s `finally`
  fallback, so replaying it synthesizes a `message.completed` event that
  never occurred live (a failed turn never reaches the "finish" branch that
  emits it).
- **`GET .../stream` subscribes to the live tail before running the replay
  query** (`handler.ts`), buffering anything published in between and
  flushing it right after the replay snapshot, specifically so an event
  published during that window is never silently dropped (the gap the
  previous ordering — replay then subscribe — had); the cost is that such an
  event can, rarely, be delivered twice (once buffered live, once again if
  it also landed in `agents.steps` before the replay query ran) — an
  at-least-once, not exactly-once, guarantee at this reconnect boundary.

## AI SDK version skew

`eve@0.19.0` declares a peer dependency on `ai@^7.0.0` (`npm install` in
`plugins-dev/toy-agent/` failed with `ERESOLVE` against `ai@^6` until bumped).
trex's `agents` worker runs `ai@^6` (`core/server/deno.json`,
`core/server/plugin/agents.ts`'s generated import map). These are independent
module resolution universes — the npm sandbox `eve eval` runs in (Node, this
repo's `plugins-dev/toy-agent/node_modules`) never shares a module graph with
the Deno worker `eve eval --url` targets over HTTP — so there is no runtime
conflict; only the local `eve eval` toolchain needs `ai@^7` to install at all.
Flagged because it means eve's stream/tool-call shapes were authored and
tested against AI SDK v7's `LanguageModelV2`/`fullStream` shapes, while our
`runner.ts`/`toolset.ts` are written against `ai@^6`'s `LanguageModelV3`. The
HTTP-level session/stream contract this file documents comes from eve's
*docs* (version-agnostic prose), not from diffing v6-vs-v7 `ai` internals, so
this is a plausible source of subtle drift I did not independently verify.

## Migration schema creation

`trex_migration_run_schema` (the DuckDB table function backing plugin
migrations, `plugins/migration/src/lib.rs`'s `setup_schema_context`) issues
`CREATE SCHEMA IF NOT EXISTS "<schema>"` itself before running any migration
file, for both the Postgres-attached-catalog path and the DuckDB-native-catalog
path. `core/server/agents/migrations/V1__agents_init.sql` does not need (and
does not have) its own `CREATE SCHEMA` statement — this matches
`plugins/devx/migrations/V1__initial_schema.sql`, which also has no
`CREATE SCHEMA devx` statement despite `devx`'s schema working today. **Not
independently re-verified against the full `docker-compose.dev.yml` stack in
this pass** (see "End-to-end verification status" below — the full stack was
not brought up); this remains a read-the-source verification, not a fix and
not a live boot-log confirmation. No code change was made here.

## eve-eval verdict

**PASS**, against a real, live target, using the real `eve@0.19.0` CLI
(`npx eve eval --url`) — not a dry read of the docs.

`plugins-dev/toy-agent/evals/evals.config.ts` + `evals/echo.eval.ts` are
written per eve's actual layout (confirmed against the packed `eve@0.19.0`
tarball's docs: "Every `evals/` directory needs exactly one
`evals.config.ts` at its root" — the brief's sketch of a bare
`plugins-dev/toy-agent/evals.config.ts` at the plugin root doesn't match this
and was corrected). `plugins-dev/toy-agent/package.json` pins `eve@^0.19.0`,
`ai@^7` (eve's own peer requirement, not `ai@^6` as the brief sketched — see
"AI SDK version skew" above), `zod@^4`.

Target: instead of the full `docker-compose.dev.yml` stack (not brought up —
see below), a standalone probe wired the *real* `handler.ts`/`store.ts`/
`loader.ts` (unmodified, imported directly, not reimplemented) to a
throwaway Postgres (`toy-agent-pg`, `localhost:15544`, migrated with
`core/server/agents/migrations/V1__agents_init.sql`) and a deterministic
mock model (`ai/test`'s `MockLanguageModelV3`, scripted to call `echo` with
`{text: "banana"}` then reply `"Echoed it: banana banana"` — no real model
credential was available, see "Model credential availability" in the task
report), served on `:8123` at the real `/plugins/trex/toy` base path. This
exercises the actual reconciled HTTP/event surface end-to-end through a real
eve client, without needing model credentials or the full docker image pull.
(The probe's `AGENT_DIR` must point at a directory Deno resolves under the
`core` workspace member — e.g. `core/server/agents/testdata/toy-agent/agent`
— for `eve/tools` to resolve to our shim instead of the real npm `eve`
package that `plugins-dev/toy-agent/node_modules` also has installed; this
is a standalone-probe/Deno-workspace-scoping wrinkle, not a production one —
production spawns each agent worker with a purpose-built `--importMapPath`
generated by `plugin/agents.ts`'s `buildAgentWorkerConfig`, which maps
`eve`/`eve/tools`/`eve/evals` to the shim unconditionally regardless of the
plugin's directory, confirmed by reading that function.)

Two real runs, both against the live probe:

1. **Before `message.completed` was added**: `succeeded` ✓, `calledTool(echo)`
   ✓, `includes(banana)` ✗ (`t.reply` was `null` — see divergence 4).
   `.eve/evals/2026-07-03T05-51-26/` in `plugins-dev/toy-agent` (untracked,
   kept as evidence, not part of this commit).
2. **After**: all 3 gates pass —
   ```
   EVALS 1
   target http://localhost:8123/plugins/trex/toy

   ✓  echo  gates 3/3

   Results: 1 passed (1 total)
   Gates: 3 passed
   ```
   `.eve/evals/2026-07-03T06-07-46/summary.json`: `"passed": 1, "failed": 0`,
   all three assertions (`succeeded`, `calledTool(echo)`,
   `includes(banana)`) scored 1.

No fallback-runner decision needed: the real `eve eval --url` CLI works
against our target as-is once `message.completed` is emitted; nothing about
its behavior required a Deno-native fallback (`eval-runner.ts`).

## End-to-end verification status

**Verified live, via the probe above (real handler/store/loader code, real
Postgres, real eve CLI, mock model):** session create → tool call → stream →
turn completion → `session.waiting` → replay via `?replayOnly=1` → the full
`eve eval` gate set. `agents.sessions`/`turns`/`steps` rows were written and
read back through the real store code (not stubbed) — confirmed via
`\dt agents.*` against `toy-agent-pg` and the eval's own successful replay
of tool-call/action-result/message.completed/turn.completed.

**PROVISIONAL — full `docker-compose.dev.yml` stack was not brought up in
this pass.** Reasons, concretely:
- No model-provider credential is available in this environment (checked
  compose files, `secrets/root.env`, `secrets/derived.env`, shell env — see
  the task report's "Model credential availability" section); a real-model
  conversation turn cannot be exercised regardless of whether the stack
  boots.
- The predecessor run in this task already found the stack's image pull
  slow/flaky in this sandbox and contended with other work; re-attempting it
  would not change the model-credential blocker above, and this session's
  own `docker ps` shows an unrelated, already-running `alp-*` Docker Compose
  project (a different repo's stack, `com.docker.compose.project=alp`) that
  must not be disturbed — reducing the value of a partial, credential-less
  boot relative to the risk/time of running two heavy stacks side by side.
- The probe above exercises the identical `handler.ts`/`store.ts`/
  `runner.ts`/`loader.ts` code the real worker runs, over the same HTTP
  surface, against a real Postgres and a real eve client — the only things
  it does NOT exercise are (a) the control-server's plugin-registration path
  (`plugin/agents.ts`'s `addAgentsPlugin`/`buildAgentWorkerConfig`, covered
  separately by `plugin/agents.test.ts`, 5/5 green) and (b) an actual model
  provider call.

Not exercised, and why: real-model conversation turn (no credential, see
above); `Plugin agents-core: N migration(s) applied to schema "agents"` boot
log line and `information_schema.schemata` check (stack not booted; the
throwaway probe Postgres was migrated by hand-applying
`V1__agents_init.sql`, not through `trex_migration_run_schema`, so it cannot
confirm that specific code path); `POST /chat` against a live docker
network. `POST /chat`'s UIMessage-stream contract IS covered by
`handler.test.ts`'s existing test (mock model, in-process).
