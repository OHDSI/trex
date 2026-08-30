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
`session.waiting`, `session.failed`, plus additive trex extensions not in
eve's vocabulary at all: `tool.event` (see divergence 10 below),
`message.queued`, `turn.reaped`, `context.compacted` (divergence 18), and
`model.retrying` — published when a model call is refused with a 429/5xx or a
connection error and will be retried after a backoff (`service/retry.ts`), so
a client can say "rate limited, retrying in 10s" instead of appearing hung
through a wait that reaches 60s. Carries `phase` (`"turn"` for the turn's own
`streamText`, `"compaction"` for the pre-turn summarizer) plus `attempt`,
`maxAttempts`, `delayMs` and `reason`; `turnId` is absent for the compaction
phase, which runs before the turn exists. Live-only, like `message.queued`,
`turn.reaped` and `context.compacted` — never persisted, never replayed.
`session.waiting`/`session.failed`
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
5. **HITL is approval-only.** `ask_question` (the built-in framework tool eve
   ships for free) is not implemented. In `inputResponses`, `optionId` must
   be `"approve"`, `"deny"`, or (trex-only, H4 — see divergence 13)
   `"always"`/`"never"`; anything else is a 400. Free-text follow-up messages
   that happen to read "approve" or "deny" are **not** auto-resolved against
   a pending request the way eve's docs describe
   (`docs/tools/human-in-the-loop.md`: "a follow-up whose text matches an
   option ID... resolves automatically") — a client must send structured
   `inputResponses`.
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
10. **`tool.event` (H3) is a trex-only extension, entirely additive** — not
    in eve's documented vocabulary at all (eve has no equivalent
    author-a-custom-event tool primitive). `eve-shim/types.ts`'s
    `ToolContext.emit?: (name, data) => void` is handed to every authored
    tool's `execute()`; calling it is fire-and-forget and a safe no-op on an
    endpoint that hasn't wired a channel (`ctx?.emit?.(...)`). Two
    independent wirings, both built on the SAME `ToolBuildCtx.toolEmit`
    plumbing (`toolset.ts`):
    - **Session API** (`runner.ts`'s `toolEmit`): publishes
      `{ type: "tool.event", data: { name, payload } }` on the live stream
      (the same channel every other event uses) AND persists an
      `agents.steps` row with `kind: 'custom'`, sharing the turn's single
      `stepSeq` counter with every other step — `migrations/V2__custom_steps.sql`
      widens the `steps.kind` CHECK constraint to allow it. Replay
      (`handler.ts`'s `stepToEvent`) maps a `custom` step straight back to
      `tool.event`, so — unlike `turn.started`/`input.requested`/
      `session.waiting`/`session.failed` (see "Durability" below) — this one
      IS reconstructable from a reconnect. Not ordering-guaranteed relative
      to its own tool's `tool-call`/`tool-result` steps: the AI SDK invokes
      `tool.execute()` as part of its own internal step processing, which
      can complete (and call `emit`) before this loop's own
      `persist("tool-call", ...)` for the triggering call — seq numbers are
      still unique/monotonic (real call order), just not "nested between"
      in the way you'd read the stream part order (see `runner.ts`'s
      `toolEmit` comment).
    - **`/chat`** (`handler.ts`): writes an interleaved `data-${name}`
      UIMessage part into the SAME stream `useChat` consumes — AI SDK v6's
      documented convention for custom data parts
      (`UIMessageChunk`'s `{ type: \`data-${string}\`, data, id?, transient? }`
      variant, confirmed against the installed `ai@6.0.219` package's
      `dist/index.d.ts`). This required switching `/chat` from the bare
      `result.toUIMessageStreamResponse()` shortcut to
      `createUIMessageStream({ execute: async ({ writer }) => { ...;
      writer.merge(result.toUIMessageStream()); } })` +
      `createUIMessageStreamResponse({ stream })` — a plain `streamText`
      UIMessage-stream response has no way to interleave extra parts into
      itself; a writer-driven `createUIMessageStream` does. No
      `agents.steps` write on this path: `/chat` is the stateless
      per-request endpoint (history comes from the client, not replay) and
      has never persisted `tool-call`/`tool-result` steps either — only the
      final `text` step, in `onFinish`. Setup-phase failures on `/chat`
      (model/instructions resolution, tool building — including a throwing
      `filterTools` hook) still return HTTP errors as they did pre-H3
      (`buildSdkTools` runs before the UIMessage stream is created, with
      the writer late-bound into `toolEmit`); failures after streaming
      begins surface as in-stream error frames, inherent to SSE.
    - **Subagents** (depth 1) inherit the parent's `toolEmit` unchanged: a
      subagent now runs as its own child SESSION (divergence 19), publishing
      on its own session stream, and `toolset.ts`'s `runAsChild` relays those
      events onto the PARENT's `toolEmit` for the duration of a blocking
      `agent` call. So a subagent's tool events still land on the SAME
      channel (session stream or chat writer) as its parent's, not a distinct
      one; there is no per-subagent tagging of a `tool.event`'s origin. (The
      in-process nested loop this used to describe, `runSubagent`, is gone —
      it was a second, divergent delegation implementation.)
11. **`resolveModel`/`buildInstructions` request hooks (H1)** are additive
    `AgentConfig` fields real eve's `defineAgent` doesn't define — eve
    silently ignores unknown fields, so an agent directory that uses them
    still loads on real eve, just without per-request model/instructions
    resolution (it falls back to eve's own `model`/`instructions.md`
    handling). Called fresh per turn/chat request from `HookCtx`, never
    cached at agent-load time; a thrown/rejected hook fails the request
    rather than silently falling back to env-configured credentials (see
    `model.ts`'s `resolveModelForTurn`, `toolset.ts`'s `resolveInstructions`)
    — the opposite failure posture from divergence 12's `dynamic-tools.ts`
    provider, deliberately: a broken model/instructions hook is a
    trust-boundary risk (wrong tenant's credentials/prompt), a broken tool
    provider is an operational one.
12. **`filterTools` hook + `dynamic-tools.ts` provider (H2)** are also
    additive/ignored on real eve. `filterTools` runs synchronously over the
    FULLY merged tool set (authored + dynamic + the built-in `skill`/`agent`
    tools) — a thrown filter propagates uncaught, same fail-loud posture as
    divergence 11. `dynamic-tools.ts` is an agent-dir-ROOT file (a sibling of
    `instructions.md`, never inside `tools/`) default-exporting
    `defineToolProvider(...)`; real eve never scans for it (only
    `tools/*.ts`), so it's a harmless unused file there, not a broken one. A
    throwing/rejecting provider is logged (`console.error` as of this pass —
    matches the file's other error-path logging) and the turn continues with
    the static tool set only — never fails the turn, unlike 11.
13. **Sticky `always`/`never` tool-consent decisions (H4)** are a trex-only,
    session-API-level extension: resolving a `needsApproval` request with
    `"always"`/`"never"` (via `inputResponses[].optionId` or
    `POST .../approval`'s `decision`) both resolves that one request (as
    `approve`/`deny` — the `agents.approvals.decision` CHECK constraint never
    sees the sticky verbs) AND upserts a durable
    `(user_id, plugin, agent, tool)` row in `agents.tool_consents`
    (`V3__tool_consents.sql`), so future calls to that tool by that user skip
    the one-shot approval flow entirely (`toolset.ts`'s `authoredTool`
    consults `getToolConsent` before creating a new approval request).
    Requires an `x-user-id`-authenticated caller (400 without one — there's
    no identity to key the consent on); this is NOT eve's own per-input
    approval-policy mechanism (`always()`/`once()`/`never()` functions
    configured on the tool itself, see "What we ignore" below) — a real-eve
    port needs to re-express the same intent as an eve approval-policy
    function, there's no automatic equivalent.
14. **Approval resolution requires session ownership (H5 ride-along)**. Both
    approval-resolution routes (`inputResponses` and `POST .../approval`)
    reject with `403 {"error": "approval can only be resolved by the session
    owner"}` when the session has a known owner (`agents.sessions.created_by`,
    set from `x-user-id` at creation) that doesn't match the resolving
    caller's own `x-user-id`. Closes a gap that predated H4 but was sharpened
    by it: `resolveApprovalDecision` previously verified only
    `(requestId, sessionId)`, so anyone who learned those two ids (e.g. a
    leaked stream URL) could resolve someone else's approval — and, once
    sticky decisions (divergence 13) existed, durably plant an `always`/
    `never` consent under the resolver's OWN identity by supplying it as
    `createdBy`, not the actual session owner's. Anonymous sessions
    (`created_by IS NULL`) keep the pre-existing behavior: anyone who has the
    ids can resolve. This has no eve equivalent to diverge from — eve
    documents no approval-resolution authorization model at all.
15. **`onToolCall`/`onToolResult` tool-call interception hooks (Task 2)** are
    also additive `AgentConfig` fields real eve's `defineAgent` doesn't
    define — eve silently ignores unknown fields, so an agent directory using
    them still loads on real eve, just without interception (every tool call
    executes and every result passes through unmodified). Read fresh from
    `ctx.agent.config` on every call (no agent-load-time caching, same as
    divergences 11/12), so a subagent turn runs the SUBAGENT's own hooks —
    same posture as divergence 12's `filterTools` at depth 1. Invoked by
    `toolset.ts`'s `authoredTool`, INSIDE `execute`, and — load-bearing —
    AFTER the existing `needsApproval` gate: a hook that ran before the gate
    could approve a tool call on the user's behalf, so an approval-required
    call that has no pending decision short-circuits before `onToolCall` ever
    runs (pinned by a dedicated ordering test in `hooks.test.ts`). Unlike
    divergence 16's `ToolContext.sql` below (withheld from provider-sourced
    dynamic-tools.ts/MCP/connection tools because it GRANTS power to a less
    trusted tool), both hooks apply to every tool routed through
    `authoredTool` — static, dynamic-tools.ts provider output, and MCP —
    regardless of origin, since these INTERCEPT rather than grant, so
    withholding them from the least-trusted tools would invert the intent.
    **Not intercepted (know this before relying on a hook as a control):**
    the `skill`, `agent` and `connection_search` built-ins
    (`skillTool`/`agentTool`/`connectionSearchTool`) are constructed directly
    and never pass through `authoredTool`, so no hook sees them — notably
    `agent`, so a policy hook cannot police subagent delegation, and `skill`,
    so it cannot police which procedure a turn loads. And because the hooks
    are read from `ctx.agent.config`, a depth-1 subagent runs with the
    SUBAGENT's config, not the caller's: devx's `.edn` subagents carry no TS
    config at all, so a subagent turn runs with NO hooks. Concretely, a devx
    user whose legacy PreToolUse matcher was `Agent|Skill` loses that
    enforcement entirely at the eve cutover. `onToolCall` may deny the
    call (`{allow: false, reason?}` → the tool returns `{error: reason}`) or
    rewrite its input (`{allow: true, input}`) before `def.execute` runs;
    `onToolResult` may rewrite the tool's return value after it runs. **CORE
    fails closed**: a throwing/rejecting hook denies THAT CALL (`{error:
    "on{ToolCall,ToolResult} hook failed: <message>"}`) and the turn
    continues — the opposite of devx's legacy loop, which caught hook errors
    and proceeded; a hook whose job is to stop something must not be
    defeated by its own bug.

    **That core guarantee does NOT make the whole chain fail-closed**, and
    this must not be read as though it did. It covers only the hook
    FUNCTION throwing. devx's `plugins/devx/functions/skills/hooks.ts` — the
    implementation behind devx's `onToolCall` — denies only on **exit code
    2** (the Claude Code blocking convention) or an explicit stdout deny;
    every other internal failure still returns "approve", i.e. FAILS OPEN:
    `executeHook` throwing (`hooks.ts:61`), a hook command whose executable
    is not on the allowlist (`:166`), and the Trex/DuckDB runtime being
    unavailable so the command cannot run at all (`:216`). Those three sites
    are byte-identical on both devx loops, so the eve cutover regresses
    nobody — but a devx user whose hook exits non-zero for a reason other
    than 2, or whose runtime hiccups, gets the tool call APPROVED. Making
    those deny would mean a DuckDB blip denies every tool call on both
    loops; that is a product trade, not a core one, and has deliberately not
    been made. A hook configured with no `ctx.hookCtx`
    available throws (`"agents: on{ToolCall,ToolResult} hook configured but
    no request context (hookCtx) available"`) rather than silently skipping
    — that gap is a caller wiring bug, not a hook failure, and fail-open
    would defeat a control whose entire purpose is to deny; same posture as
    divergence 11's `buildInstructions`. This is also the opposite failure
    posture from divergence 12's `dynamic-tools.ts` provider
    (log-and-continue): these hooks are a trust-boundary control on tool
    calls, not an operational integration.
16. **`ToolContext.sql` is additive/trex-only** (`eve-shim/types.ts`) — real
    eve's `ToolContext` has no `sql` field at all. It's the worker's pg pool
    query fn, threaded straight from `HookCtx.sql` (`toolset.ts`'s
    `authoredTool`) so a tool's `execute()` can run SQL without reaching for
    a separate ambient pool; a tool must guard with `ctx?.sql?.(...)`, same
    posture as `emit`/`userId`. **devx consumer note**: `plugins/devx/agent/
    lib/context.ts`'s `toDevxCtx` adapter both (a) requires `ToolContext.sql`
    non-negotiably (throws if unwired) to run its chat-ownership check before
    letting client-supplied `metadata.chatId` reach any ported tool, and (b)
    relies on it being the SAME pool `resolveModel`'s `HookCtx.sql` used —
    which is where the parity gap lives: `agent.ts`'s `resolveModel` only
    implements bearer-token bedrock auth (unpacks `{bearerToken}` from a
    `devx.provider_configs`/`devx.settings` row's JSON `api_key`); IAM-shaped
    credentials (`{accessKeyId, secretAccessKey}`) throw rather than silently
    losing auth, unlike the legacy AI-SDK loop's `createModel`, which
    supports both. devx's GET `/provider-configs` and `/settings` responses
    mask `api_key`, so the shape cannot be detected client-side — the server
    derives a non-secret `auth_shape` hint from the unmasked key
    (`plugins/devx/functions/auth_shape.ts`) and `useEffectiveLoop.ts` forces
    `bedrock` + `auth_shape === "iam"` users onto the legacy loop before
    `/chat` is ever called; the `resolveModel` throw is the backstop.
17. **`onTurnEnd`/`buildUserMessage` turn-lifecycle hooks (Task 3)** are also
    additive `AgentConfig` fields real eve's `defineAgent` doesn't define —
    eve silently ignores unknown fields, so an agent directory using them
    still loads on real eve, just without the hook running. `onTurnEnd`
    fires once per turn, called from `runner.ts` AFTER `persistText()` has
    run and OUTSIDE the stream's `try/finally`, immediately before `runTurn`
    returns — a failed turn (the `"error"` stream case, which throws) never
    reaches it, matching devx legacy's posture of running Stop hooks only
    after a successful turn. Its errors are logged and swallowed, never
    rethrown: the turn already succeeded, and a Stop-hook bug must not
    retro-fail completed work — the opposite failure posture from
    `buildInstructions`/`resolveModel`/`onToolCall`/`onToolResult` above,
    which all fail the turn on throw. A configured `onTurnEnd` with no
    `ctx.hookCtx` available is neither thrown (retro-failing a completed
    turn) nor silently skipped (a caller wiring bug worth surfacing) — it's
    a third posture unique to this hook: `console.warn`s that the hook was
    configured but couldn't run for lack of a request context, then skips
    it. `buildUserMessage` is the per-turn counterpart to `buildInstructions`,
    resolved by `toolset.ts`'s `resolveUserMessage` (mirroring
    `resolveInstructions`) and applied to the USER message before it's added
    to `messages`, deliberately NOT to the system prompt: the system prompt
    is cache-pointed (`withSystemCachePoint`) on the strength of being
    stable across turns and across requests for the same agent+metadata, so
    folding per-turn content (e.g. attachment paths) into it would
    invalidate that cache on every request. Same never-fall-back-silently
    posture as `buildInstructions`/`resolveModel`/`onToolCall`/
    `onToolResult`: a configured `buildUserMessage` with no `hookCtx`
    available throws rather than silently sending the unmodified base
    message.
18. **Context management (Tasks 4/8-16) is additive/trex-only** — real eve
    leaves conversation-context management to the caller entirely; it does
    not truncate, summarize, or withhold anything itself. This runtime
    performs four things eve does not, all in `service/context/`:
    - **History includes tool calls and results.** `agents.steps` rows of
      kind `tool-call`/`tool-result` are folded back into the model's
      message list (`history.ts`'s `assembleHistory`), not just the final
      `text` step — fixing a real defect where turn 2 had no idea what turn
      1's tools actually did. Every tool call is guaranteed a matching
      result — a synthetic one (`SYNTHETIC_RESULT_TEXT`) is inserted when a
      turn was interrupted mid-call — because providers reject an orphan
      `tool_use` block outright.
    - **Two-tier tool-output truncation.** A tool's raw result is capped at
      execution time (`toolset.ts`'s `wrapToolWithCap`, Step 5, covering
      every authored/dynamic/built-in tool and subagents alike); once
      folded into history, results in the most recent `freshTurns` keep
      `freshToolOutputChars`, older ones are cut to the smaller
      `staleToolOutputChars` (`truncate.ts`'s `truncateMiddle`).
    - **Token-budget compaction.** At `compactAtFraction` of the resolved
      model's context window — or at the optional absolute `compactAtTokens`
      ceiling, whichever is lower (the ceiling bounds cost, not correctness:
      on a 1M-token window the fraction alone would not fire until ~750k
      input tokens; `devx` sets it, `claw`/`d2esupport` leave it unset and
      are unaffected) — measured from the provider's own last-turn usage
      when available, and otherwise estimated as the assembled messages plus
      `estimatePrefixTokens` for the system prompt and shipped tool schemas
      (a floor: anything behind an await stays uncounted, since widening
      `startTurn`'s check-then-act window to sharpen an estimate is the worse
      trade). Older turns
      are replaced by a model-generated checkpoint summary, persisted as an
      `agents.steps` row of kind `compaction` — a trex-only step kind added
      by migration V7. Pre-turn only (`handler.ts`'s `startTurn`, never
      mid-stream: a mid-turn summary would have to be injected above the
      last user message or the model misreads it); a summarization failure
      degrades to dropping the oldest turns outright rather than failing
      the turn (`compact.ts`'s `maybeCompact`). That degradation publishes a
      second additive trex-only event, `context.compacted`, carrying `via`
      and — on the drop path — the reason summarization could not run. Like
      `tool.event` (divergence 10) it is absent from eve's vocabulary
      entirely; unlike it, it is turn-agnostic and live-only, since
      compaction happens before the turn exists.
      The summarizer is sent a flattened plain-text transcript of only the
      turns being replaced. Both halves of that are load-bearing: the
      summarization call declares no `tools`, so structured
      tool-call/tool-result parts would be rejected by the provider (and the
      rejection swallowed into the drop fallback, meaning the summarizer
      would never run at all), and summarizing turns that also survive
      verbatim would hand the model the same content twice.
    - **Deferred tool loading.** Tools named in `deferredTools` are withheld
      from the request entirely — absent from the tool list, not
      present-but-disabled — until `ToolSearch` activates them for that
      session (`store.ts`'s `activateTools`/`getActivatedTools`,
      persisted on `agents.sessions.activated_tools`, also added by V7),
      and are appended AFTER the prompt-cache breakpoint
      (`model.ts`'s `withToolCachePoint`) so activating one never
      invalidates the cached TOOLS+SYSTEM prefix the core tools sit in
      (`toolsplit.ts`'s `partitionTools`). `ToolContext.activateTools` is
      itself additive/trex-only, same posture as divergence 16's
      `ToolContext.sql` — bound to the calling session only
      (`toolset.ts`'s `authoredTool`: `(names) =>
      ctx.store.activateTools(ctx.sessionId, names)`), never the raw
      `AgentStore`, so a tool gets exactly one write capability and cannot
      touch another session's state.

      **Deferred tools are unreachable on `POST /chat`.** That endpoint is
      the stateless one — history comes from the client and it creates a
      fresh session per request purely for observability — so an
      activated-tools read there can only ever return `[]`, and one is no
      longer made. `ToolSearch` still writes `activated_tools`, to a session
      nothing will read again. Activation deliberately takes effect only
      from the NEXT request (`toolset.ts`'s cache-breakpoint ordering), so
      reaching a deferred tool on `/chat` needs a caller-supplied session id
      that the caller then reuses — i.e. giving up the statelessness that
      defines the endpoint, plus an ownership check on that id. Deferred as
      a product decision, not an oversight: the only in-repo `/chat` client
      (devx's `AGENTS_CHAT_URL`) moved to the session API and is now
      unreferenced, so there is no caller to thread an id through today.
      The session API (`/eve/v1/session`) is unaffected — it is where
      deferred tools work.

    All four are configured per agent through the `context` block on
    `defineAgent` (`context?: Partial<ContextConfig>` — `AgentConfig`,
    `eve-shim/types.ts`) and default to eve-comparable behaviour
    (`DEFAULT_CONTEXT_CONFIG`): unbounded-in-practice truncation caps, no
    compaction until a very large window fraction, and `deferredTools: []`
    (nothing withheld — `claw`/`d2esupport` run this way, unconfigured).
    devx is the only agent that sets `deferredTools` (`agent.ts`, ~25 of
    its 68 tools — the KB, cron, Figma, browser-automation, and DB/image/
    web-crawl families; the always-on set, including `ToolSearch` itself,
    is never eligible). devx's `buildInstructions` also appends a fixed
    note pointing the model at `ToolSearch` for its withheld tools — the
    ONE place this loop's system prompt deliberately diverges from the
    legacy AI-SDK loop's (see `lib/prompt_parity.test.ts`'s own exception
    for it): legacy has no deferred-tool concept at all, so its prompt
    never carries an equivalent suffix, and never can.
19. **Subagents are nested sessions (2026-08-27 orchestration) — a trex
    extension over eve's `Agent` framework tool.** Upstream eve runs a
    subagent as an in-process nested loop that returns a string. trex runs
    one as a real `agents.sessions` row with `parent_session_id` /
    `parent_turn_id` (`migrations/V9__orchestration.sql`), so a child
    inherits the machinery a top-level turn already has: heartbeat liveness
    and stale-turn reaping, tool-history assembly and the
    tool-call/tool-result pairing invariant (divergence 18), two-tier
    truncation of the history it is given, and approvals.
    - **What a child does NOT inherit: compaction.** Compaction is strictly
      PRE-turn (`context/compact.ts`'s `maybeCompact`, called from
      `startTurn` before `addTurn`), and it short-circuits when the session
      has no prior turns. A child session has exactly one turn — its first
      and only (`runner.ts`'s `makePrepareStep`; `startTurn`'s
      drain-and-chain tail is gated on `depth === 0` precisely so a child
      never gains a second) — so the compaction check on a child is always
      the no-op case. A child therefore CANNOT compact, structurally, and
      no amount of context growth inside its single turn will trigger it.
      In practice a child starts near-empty (its forked slice is capped at a
      quarter of the conservative fallback window — `spawn.ts`'s
      `FORK_TOKEN_BUDGET`) and is bounded by the same per-tool-output cap
      and two-tier truncation every turn gets, so the exposure is a single
      very long tool-heavy child turn overrunning its window. Closing it
      needs MID-turn compaction, which this runtime does not have and which
      is its own change (a mid-turn summary has to be injected above the
      last user message or the model misreads it — see `compact.ts`).
    - **Seven tools instead of one.** `agent` keeps its blocking contract and
      return shape (`{text}`, or `{error}`) — `agent_spawn` / `agent_wait` /
      `agent_result` / `agent_list` / `agent_send` / `agent_stop` are new
      (`service/toolset.ts`, `service/spawn.ts`). `agent_wait` returns each
      finished child's OUTPUT alongside its status, and `agent_result` reads
      one back on demand: a detached child's result is otherwise only
      delivered as a queued followup on a LATER parent turn, and a parent
      sitting inside `agent_wait` always has a turn running — so without
      these it could learn WHICH child finished but never WHAT it produced
      inside its own turn.
    - **`agent_stop` interrupts in-process, and abandons otherwise.** It always
      marks the child's turn failed with the `STOPPED_BY_PARENT_ERROR` marker,
      so the parent stops waiting and the child's result is discarded on
      arrival — that database marking happens FIRST and is what owns the
      outcome. It then aborts the child's in-flight `streamText` via an
      `AbortSignal` threaded through `runTurn`, so the child stops calling
      tools and stops billing rather than running to completion for nothing.
      That abort reaches only a child running on the SAME WORKER: the registry
      of live child controllers (`service/aborts.ts`) is per isolate, and a
      parent woken on another worker — routine, since child turns are started
      fire-and-forget and a reap can deliver from anywhere — finds no
      controller and gets the marking alone, which is exactly what `agent_stop`
      did before. Making it cross-process needs a notification channel the
      store does not have (the same gap that makes `agent_wait` a poll rather
      than a push), and is deliberately not half-built here. The tool
      description says the same thing, so a model does not treat it as a
      guaranteed kill switch.
    - **All seven are depth-0 only** (`ToolBuildCtx.depth`, derived per turn
      from durable state — `store.isChildSession` — never threaded from spawn
      time, so a child cannot spawn a grandchild even if a worker restarts
      mid-turn), and
      none is deferrable by default: `deferredTools` activation only takes
      effect from the NEXT request (divergence 18), and a model mid-fan-out
      needs these tools now, not next turn.
    - **`fork_turns`** on `agent` and `agent_spawn` lets a child inherit the
      last N of the PARENT's own turns (`"none"` default, matching prior
      behaviour; `"all"`, or a positive integer — `context/fork.ts`'s
      `parseForkTurns`). Slicing is whole-turn only, trimmed from the oldest
      end to fit a fixed token budget: a partial turn would separate a tool
      call from its result and the provider would reject the child's very
      first request. Depends on divergence 18's history-includes-tool-calls
      work — a forked slice is only worth inheriting once history carries
      real tool call/result content, not just final text.
    - **Detached children deliver and wake.** A detached child's completion
      (success or failure) queues a `turn_followups` row on the parent and
      starts a parent turn if none is already running
      (`handler.ts`'s `deliverChildResult`); a BLOCKING child (`agent`,
      `detached: false`) returns through the tool call that started it
      instead and never queues anything. Bounded by `MAX_CONSECUTIVE_WAKES`
      TURNS in a row that this session ran because a child completed rather
      than because anyone asked — otherwise a session that spawns a child on
      every wake would chain forever, one real model call per link, billed to
      the caller.
      - **The unit is turns, not results.** The counter is charged once in
        `startTurn`, at the single point a child-caused turn is created,
        covering BOTH a wake and the turn a parent chains for results that
        were queued while it was busy. N children draining into one chained
        turn are one turn, one model call, one unit; a result that
        `makePrepareStep` injects into an already-running turn between steps
        costs no turn and therefore no budget. Charging per delivered result
        instead would let a canonical eight-way `dispatching-parallel-agents`
        fan-out consume 80% of the budget inside a single human-requested
        turn.
      - **How a chained turn knows.** Every delivery records the originating
        child on the followup ROW it queues
        (`agents.turn_followups.origin_child_session_id`,
        `V10__followup_origin.sql`), in the same `INSERT` as the text. A
        chained turn asks only what it actually drained: any row with an
        origin makes that turn child-caused, so it charges itself and skips
        the reset; a chain that drained nothing but human or channel messages
        is an ordinary turn and resets. Draining a row takes its origin with
        it, so nothing has to be retired later and a fan-out's N deliveries
        record N origins rather than competing for one slot.
      - **Superseded: the session-level stamp.** V9 answered the same
        question with one slot per session
        (`agents.sessions.pending_wake_child_id`), written before each
        followup row and retired only by an external turn that STARTED a turn
        of its own. Under sustained mid-turn traffic no such turn ever comes —
        every message folds into a chain instead — so each chain saw the
        standing stamp and skipped the reset, deferring a legitimate reset for
        an unbounded number of turns. Per-row origins remove that deferral
        outright. The column is left in the schema (dropping one mid rolling
        deploy breaks whichever side has not swapped yet) but is neither read
        nor written.
      - **At the cap** the turn is refused rather than the result dropped:
        `startTurn` requeues the text it had already drained and logs, and
        everything rides the next message that is genuinely someone asking.
      A wake racing another parent message is resolved by
      `idx_agents_turns_one_running_per_session` (a partial unique index,
      PER session — it does not serialize siblings spawned under the same
      parent): the loser degrades to queueing its followup for the
      already-running turn to drain, rather than two turns ever coexisting.
    - **`agent_wait` polls.** The store exposes a plain query function with
      no notification channel; `LISTEN`/`NOTIFY` is a separate change.
    - **Depth stays capped at 1.** A child receives no `agent*` tools at
      all, so it structurally cannot spawn a grandchild regardless of what
      it's told.
    - **Per-subagent role config (`reasoningEffort`/`skills`).** Only
      `skills` is REDUCING ONLY, ported from codex's `role.rs`: a
      subagent's `skills` (`AgentConfig.skills`, resolved by `loader.ts`'s
      `resolveAgentRole`/`resolveChildSkills`) is the INTERSECTION of its
      own declared list and the delegating session's own skill names, never
      their union — a caller can narrow what it delegates but never grant a
      child more than it already has itself (`toolset.ts`'s
      `restrictChildSkills`, applied at delegation time in
      `handler.ts`'s `buildSpawnCapabilities`). **Tools are intersected the
      same way** (`toolset.ts`'s `restrictChildTools`, applied at the same
      point): a subagent directory declaring `tools/` entries its parent does
      not have gets them dropped, so a child's tool set can only ever narrow
      its parent's. A child also runs its parent's `filterTools` hook under
      the PARENT's own `metadata` — its turn is started with the spawning
      turn's metadata, bearer token and user id — so a mode-restricted
      session (devx's `ask`) cannot delegate its way out of that restriction.

      **What `skills` actually caps today is the child's advertised
      system-prompt text, not a live privilege**: `buildSdkTools` gates the
      built-in `skill` tool behind
      `depth === 0`, and every child runs at depth 1 (this divergence's own
      depth cap, above), so no child can invoke a skill at all regardless of
      this field. The reduction exists for when that changes — a future
      grant of skill-invoking access to children must route through
      `resolveChildSkills`, not assume this field already enforced it.
      `reasoningEffort` is NOT reduced against anything — it is just the
      child's own declared value, applied to its own resolved model as a
      `providerOptions` override (openai only for now; a one-time `console.warn`
      names the agent and the resolved provider when it's set on a
      non-openai model, since it would otherwise silently do nothing — see
      `model.ts`'s `reasoningEffortProviderOptions`). Both keys are read
      from either camelCase (`agent.ts`) or EDN kebab-case
      (`:reasoning-effort`, `agent.edn`) via the same explicit-allowlist
      pattern divergence 18's `ContextConfig` fields use — a key missing
      from that allowlist is exactly what silently dropped two
      `ContextConfig` fields in an earlier cycle of this runtime.
20. **`UserPromptSubmit`, `onCompact`, and `hook.failed` (2026-08-29 hooks)
    are also additive, and also NOT a trust boundary — the opposite failure
    posture from every gated tool call.** `HookEvent` — devx's OWN
    authoring-facing hook-event union (`functions/skills/types.ts`,
    `src/lib/types.ts`; core itself has no `HookEvent` type, only named
    fields on `AgentConfig`) — gained `UserPromptSubmit`, `PreCompact` and
    `PostCompact`. `UserPromptSubmit` fires from `buildUserMessage` (H4,
    divergence 17's per-turn counterpart to `buildInstructions`), routed
    through `hooks.ts`'s `runContextHook` — the SAME allowlisted devx-ext
    bridge (`trex_devx_run_command`) PreToolUse/PostToolUse/Stop use, so its
    command gets the child-process environment allowlist above and the same
    `ALLOWED_EXECUTABLES` gate; a direct `Deno.Command` from the worker would
    bypass both. The actual pre/post-compaction hook is a **separate,
    core-level mechanism**: `AgentConfig.onCompact` (a plain field, not
    routed through devx's hook-row system by itself), called from
    `context/compact.ts`'s `maybeCompact` — `pre` before the summary input is
    assembled, `post` after it (or after the drop fallback) lands. devx's
    `agent.ts` now implements `onCompact` (H5) and bridges the two worlds: it
    loads that turn's `devx.hooks` rows for the `PreCompact`/`PostCompact`
    events (via the same `turnHooks` per-turn cache H2-H4 use) and runs each
    through `runContextHook`, so a user-authored `PreCompact`/`PostCompact`
    row now gets the identical allowlisted-bridge/env-filter treatment as
    every other devx hook event — no direct spawn. `pre`'s combined,
    `capHookOutput`-capped output, if any, is returned as the string
    `onCompact` hands back to `maybeCompact`, which splices it verbatim onto
    the end of the summarizer's transcript (appended, not prepended, so the
    transcript's own chronology stays intact) — the hook's whole point is
    preserving something the summarizer would otherwise drop. `post` runs its
    rows for side effects only and always returns nothing — compaction has
    already happened by the time it fires, so there is nothing left for it to
    influence. Same posture as this divergence's other hooks: a missing
    `hookCtx` warns and skips rather than throwing (compaction must not be
    blocked by a wiring bug), and a throwing or failing hook is caught,
    reported via `hook.failed`, and treated as "nothing preserved" — never
    aborts compaction, which exists to relieve context pressure and cannot
    itself become blockable.

    **The injected-context cap** (`context/hook-output.ts`'s `capHookOutput`,
    `DEFAULT_MAX_HOOK_OUTPUT_TOKENS = 2500`) exists because an unbounded hook
    injection can undo the very compaction that just ran to make room, or
    blow a normal turn's budget outright. Measured with the SAME
    `estimateTokens` the compaction trigger itself measures against (one
    estimator, so the cap and the budget it protects can't disagree). Text
    under the cap passes through unchanged. Over it: if the caller supplies a
    `spillPath` (a directory), the full text is written to a file there and
    the injection is replaced by a one-line pointer naming it; with no
    `spillPath`, it truncates inline instead — a pointer is only honest when
    its reader can open the file, and a spill failure (bad permissions, path
    is a file not a directory) falls back to the same truncation rather than
    throwing. The two current callers pick deliberately: `UserPromptSubmit`
    passes a workspace-scoped `spillPath`
    (`<workspace>/.devx/hook-spill`, dot-prefixed so it doesn't litter the
    project root a coding model browses) when a workspace exists, because the
    coding model's own `Read` tool can reach it — together with `spillRoot`
    (the workspace), which is what makes the POINTER workspace-relative
    (`.devx/hook-spill/<file>`) while the file still lands at the absolute
    path. That is not cosmetic: the reader is the coding model, and its
    `Read` goes through `path_safety.ts`'s `safeJoin`, which THROWS on any
    absolute path — an absolute pointer names a file its only reader cannot
    open. `onCompact`'s `pre` hook
    passes none, because the summarizer has no file access at all and a
    pointer would be inert to it — so an over-cap compaction-preserved note
    is always truncated, never spilled.

    **`hook.failed`** is not a core-emitted wire event — it's devx's own use
    of a new, generic capability: `HookCtx.emit?: (name, data) => void`
    (`eve-shim/types.ts`), wired by `handler.ts`'s `buildHookCtx` onto the
    same `tool.event`/`publish()` channel `toolEmit` already uses (divergence
    10). devx's `agent.ts` calls `ctx.emit?.("hook.failed", info)` from every
    lifecycle hook implementation (`onToolCall`, `onToolResult`, `onTurnEnd`,
    `runUserPromptSubmitHooks`) whenever `functions/skills/hooks.ts` reports a
    hook that crashed, named a disallowed executable, or carried an unknown
    `hook_type` — additive visibility, not a new verdict.

    **State plainly: a crashed or misconfigured hook is non-blocking.** It
    reports via `hook.failed` (and a `console.error`) and the turn continues
    — a DuckDB hiccup, timeout, connection reset, or a hook row with a typo'd
    `hook_type` must not itself deny (PreToolUse) or corrupt (PostToolUse,
    Stop, UserPromptSubmit) the work it happened to guard. Only an explicit
    verdict denies a tool call: **exit code 2**, or `{"action":"deny"}` in the
    hook's stdout — the two paths `executeCommandHook` already treated as a
    deliberate block, unchanged by this pass. Every other non-zero exit,
    disallowed executable, unknown `hook_type`, or thrown error still resolves
    to `{ action: "approve" }` (or, for the advisory Post/Stop/UserPromptSubmit
    hooks, to "leave the content/message alone"). This is deliberate, not an
    oversight rediscovered mid-implementation (an earlier commit on this same
    branch briefly made the disallowed-executable/crash/unknown-`hook_type`
    paths deny, then reverted): **the escalate/approval system documented
    below is the trust boundary for tool calls; a user-configured advisory
    hook is not**, and a transient hook failure must not deny work that the
    escalate floor and sticky consents were never asked to gate. This does
    not change divergence 15's own CORE-level guarantee — a throwing
    `AgentConfig.onToolCall`/`onToolResult` (the hook function itself, not a
    hook ROW inside devx's own implementation of it) still denies that call —
    it describes devx's internal handling of its OWN hook rows, exactly as
    divergence 15 already documented, now additionally reported via
    `hook.failed`.

## Unattended sessions and the escalate floor

trex-only (eve has no equivalent). Both pieces exist to answer one question a
bot-driven turn cannot: **who clicks "approve"?**

### The `unattended` session flag

`agents.sessions.unattended` (migration V11) marks a session that has no human
watching it. It is **create-time only** — set by whichever route creates the
session and never mutated afterwards, so a later request cannot disarm a gate on
a turn that is already running. Three creation sites write it:

| site | source |
| --- | --- |
| `POST /eve/v1/session` | request body `unattended` |
| `POST /chat` | request body `unattended` |
| the spawn path (`spawnChild` → `store.createChildSession`) | inherited from the parent, read back from durable state |

Both HTTP routes require a **strict `=== true`**: `"true"`, `1`, and any other
truthy value persist as `false`. A truthy string arriving in a request body must
never widen an approval gate (`functions/autonomy.ts` states the same rule for
the loop this replaces).

A child of an unattended parent inherits the flag rather than defaulting to
`false` — it has no approver either. Inheritance reads
`isUnattended(parent) || isChannelBound(parent)` at spawn time rather than
threading a parameter down, for the same reason `depth` is derived from
`parent_session_id`: durable state cannot be forgotten by a future call site.
Both reads are needed — a channel session never writes the `unattended` column,
so the durable flag alone would leave a delegated child gating on its own event
stream, which no channel adapter subscribes to.

`approver_reachable` is deliberately **not** inherited: `createChildSession`
omits it, so a child falls to V13's `false` and a hard-tier call in a child
denies immediately where the parent would gate. That is the better failure, not
an oversight — a relay watches the PARENT's stream (claw's `postApprovalGates`
subscribes to the session it started), so a child's gate has nobody to reach
and would park for the full 30 minutes before denying anyway. Fail-safe, and
faster to say so.

**Channel binding implies unattended.** A session with a row in
`agents.channel_sessions` has no browser consent UI to answer a gate, so
`handler.ts` resolves `unattended = channelBound || isUnattended(sessionId)`.
A third flag, `approverReachable` (`agents.sessions.approver_reachable`), is
resolved beside them and answers a different question — see "Two tiers" below.
All three are resolved **once per turn**, alongside `depth` — `buildSdkTools`
spreads its `ToolBuildCtx` into every authored tool, so resolving them per tool
call would cost one round trip per gated call.

### `AGENTS_ESCALATE_TOOLS`

The deployment's floor: tools that require a human every time, no matter what
the session or a stored consent says. The env var is read **once, at module
load, in `handler.ts` only** — but the *effective* per-turn list can still
differ per agent (see "Per-agent override" below). `toolset.ts` and
`approvals.ts` never read the env var themselves; they take whichever parsed
list the caller passes and fall back to the same built-in default
(`DEFAULT_ESCALATE_LIST`) when nobody passes one.

Grammar: a comma-separated list of `Tool`, `!Tool`, `Tool:scope|scope|…`, or
`!Tool:scope|scope|…`. A bare tool name matches every invocation; scopes match
against the invocation's derived scope key (`scope-key.ts`: the Bash
executable **set**, the normalized path, or the normalized `[source,
destination]` pair), case-insensitively.

#### Two tiers: hard and soft

A leading `!` marks an entry **hard**; its absence marks it **soft**
(`approval-policy.ts`'s `parseEntries`). Both tiers refuse a sticky `always`
grant (see "Precedence" below) — under a shared bot identity, neither can be
bought off with one click. They differ in what an **unattended** session (no
human watching, see above) gets on a match: hard still denies outright (or
gates, if an approver is reachable — no exception either way); soft
**allows** it. Concretely, this is what lets an unattended coding agent run
`rm -rf node_modules` or `curl` with nobody watching, while `sudo`, `ssh`,
`GitPush` and `ExecuteSQL` are refused outright when nobody can be asked,
attended or not.

**What the hard tier asks is "can anyone be shown this gate", not "is this
attended"**: a soft match gates an attended session (a human can approve), but
a hard match gates only when an approver is reachable and otherwise **denies**
outright, with no approve button at all. `resolveApproval`'s hard branch reads
`approverReachable`, never `unattended`; `channelBound` implies it, and it
defaults to **false**, so a session that never declares one is denied on a hard
match whether it is attended or not. A session declares it at creation
(`approverReachable: true` on `POST /eve/v1/session` or `POST /chat` — both
session-creating routes, same strict `=== true` as `unattended` — stored in
`agents.sessions.approver_reachable` by V13) — which is how a *relayed*
session says so: claw's coder session is neither channel-bound nor unattended,
but claw watches it and carries its gates to the channel and the answers back.
The signal only ever turns a `deny` into a `gate`; it can never produce
`allow`, so a caller that claims an approver it does not have gets a turn that
parks and then denies on the gate's timeout.

This matters because of this phase's Bash scopes below, and it affects
**both** execution paths, not only the new sidecar engine: before them, a
session running `git push`/`psql`/`crontab` through the model loop's own
`Bash` tool matched no hard entry and fell through to `gate`. Now that they
sit in the hard tier, the same call is denied unless the session declares an
approver.

Default (`DEFAULT_ESCALATE`):

```
!GitPush,!ExecuteSQL,!CronCreate,!CronDelete,!RestartApp,!Bash:sudo|dd|ssh|scp|psql|crontab|git:push|git:subtree,DeleteFile,Bash:rm|curl|wget|chmod|chown
```

i.e. hard: `GitPush`, `ExecuteSQL`, `CronCreate`, `CronDelete`, `RestartApp`,
`Bash:sudo|dd|ssh|scp|psql|crontab|git:push|git:subtree`; soft: `DeleteFile`,
`Bash:rm|curl|wget|chmod|chown`. `git:subtree` is escalated as a whole
subcommand (not split further into `subtree push` vs. `subtree add/split/
pull`) because `git subtree push` is itself a push and the extra precision
isn't worth it for a subcommand an unattended coder essentially never runs —
see `approval-policy.ts`'s own comment for the full reasoning. The Bash
additions beyond `sudo|dd|ssh|scp` (`psql`/`crontab`/`git:push`/`git:subtree`)
exist to give the `claude-code` sidecar's
`Bash`-only tool surface the same hard floor the model loop's `ExecuteSQL`/
`CronCreate`/`CronDelete`/`GitPush` tool names already had — see "External
engines" below for why a tool-name-based floor needed them, and note above
for the attended-session consequence of adding them.

Unset uses that default. An **explicitly empty string** is a deliberate opt-out
(no floor at all). A value that parses to nothing (every entry malformed, or a
lone `!` with no tool name) is treated as a typo: it warns and keeps the
default, rather than silently removing the floor.

### Per-agent override (`AgentConfig.escalate`)

`AgentConfig.escalate` (`eve-shim/types.ts`) replaces the deployment escalate
list for **that one agent only** — same string grammar as
`AGENTS_ESCALATE_TOOLS`, including the `!` tier prefix. It is
**deployment-authored code**, a field on the `defineAgent(...)` object an
operator ships, never something a request or a tool can set — a
request-supplied override would let a caller disarm its own floor, so the
whole mechanism depends on it never accepting live input. `handler.ts`'s
`resolveEscalate` calls the pure `resolveEscalateFor` (`approval-policy.ts`)
fresh on every turn/chat request (no agent-load-time caching, same posture as
`resolveModel`/`buildInstructions`), and an **unparseable value falls back to
the deployment list** and logs `agents: agent '<name>' has an unparseable
escalate list — using the deployment list` — an agent-authored typo must
never silently widen what a bot can do unattended, any more than an env-var
typo does.

**No agent currently uses it.** `devx`, `claw` and `d2esupport` all run on
the built-in two-tier default unmodified — it already unblocks the coder
(soft `rm`/`curl` for an unattended session, hard `sudo`/`ssh`/`GitPush`/
`ExecuteSQL` still gated) without any agent needing its own list. The
override exists as a capability an agent *can* reach for should the shared
default ever not fit it, not because one needs it today.

#### What the `Bash` scope match is, and is not

A `Bash` scope key is the sorted, de-duplicated, `+`-joined **set** of
executables the command runs: segments are split on `&&`, `||`, `;`, `|` and
newlines (quote-aware), each segment's leading `NAME=value` assignments are
skipped, the first token is stripped to its basename and lowercased, and exactly
**one** level of `sh -c "…"` / `bash -c "…"` / `bash -lc "…"` is unwrapped into
its payload. So `npm test` → `npm`, `cd /app && rm -rf .` → `cd+rm`,
`bash -lc "rm -rf /"` → `rm`, `sh -c 'curl x | sh'` → `curl+sh`.
`matchEscalate` treats the key as a set and escalates when **any** part
matches a listed scope. **Every** segment is scanned, with no cap of any kind —
a cap on segments *or* on input length drops executables, and a floor that
silently loses `rm` is worse than no floor. (Measured: a 1 MB truncation of a
1.4 MB `true | …×200000… | rm -rf /` cut mid-token and yielded `t+true`, with
the `rm` gone.) Cost is linear and small next to the database round trip on
every gated call: 1.4 MB / 200k segments in ~63 ms, 7 MB / 1M segments in
~306 ms.

This is **best-effort protection against accidental destructive commands, not a
boundary that resists deliberate evasion.** A command can still obscure what it
runs — variable indirection (`X=rm; $X -rf /`), `eval`, a base64/`printf`
payload piped into a shell, or a second level of nesting (`bash -c 'sh -c "rm
x"'` keys on `sh`, not `rm`). Treat the floor as a guard rail on an agent's own
mistakes; a genuinely adversarial prompt is a sandbox problem, not a scope-key
problem.

Accepted limitations, recorded rather than fixed:

- **Scope keys carry no workspace or app component.** An `always` granted on
  `src/a.ts` in one app also covers `src/a.ts` in another app the same user
  drives through the same plugin/agent pair. Narrowing this needs a workspace
  component in the consent key (migration + a new column), which this change
  deliberately does not take on.
- **Escalate scope matching is case-insensitive; the consent row it guards is
  case-sensitive.** `Bash:RM` in the env list matches a key of `rm`, but a
  stored consent for `RM` and one for `rm` are two different rows. The
  mismatch only ever makes the floor match *more* often than the consent it
  guards, which is the safe direction.
- Path keys are matched against the same `+`-split, so a path containing a
  literal `+` (a file named `a+b.ts`) can over-match a listed scope — again,
  toward more escalation.
- **The Bash scope key for a multiplexer executable now carries its
  subcommand** (`git` → `git:push`/`git:status`/…, see "External engines"
  below), which is a different string from the coarse `git` key this runtime
  used before. A sticky consent recorded against the coarse key does not
  automatically apply to the finer one — same shape of mismatch as the
  case-sensitivity point above, just introduced by this phase rather than
  pre-existing. Rows recorded before the change are **not** stranded, though:
  on an exact miss the gate re-derives the coarse key (`coarseScopeKey`) and
  honours an old `never` from it, so a standing refusal keeps refusing. An old
  `always` is deliberately *not* honoured — a grant on `git` never covered
  `git push` — so the user is simply asked again. Fail-safe in both
  directions, which is why no migration deletes anything; an exact row still
  wins outright, so a finer decision can be carved out from under an older
  blanket one.

### Precedence

`resolveApproval` (`approval-policy.ts`) is pure and exhaustively tested. In
order:

1. a stored `never` consent → **deny** (`consent-never`)
2. a **hard** escalate match → **gate** if an approver is reachable
   (`approverReachable`, which `channelBound` implies), else **deny**
   (`no-approver`) — nobody to ask means deny, not park
3. a **soft** escalate match → **allow** if `unattended`, else **gate** — a
   soft match never denies outright, and never checks approver-reachability: an
   unattended session with nobody to ask still gets `allow`, not `no-approver`
4. a stored `always` consent → **allow**
5. `unattended` → **allow**
6. otherwise → **gate**

(`matchEscalate` returns the matched tier or `null`; a tool/scope pair can
only ever match one tier for a given list, since `!Tool` and `Tool` are
distinct entries — but see `resolveApproval`'s own comment for why hard
"wins outright" if a list is ever authored with both.)

Rules 2 and 3 sit above rules 4 and 5 deliberately: under a shared bot
identity, one `always` click would otherwise disarm the floor for every user
of that identity — this is true of *either* tier, not just hard.

For the same reason, **`always` is refused at write time for a tool matching
either tier**. `POST .../approval` and the `inputResponses` path both reject
the decision with `"<Tool> cannot be granted 'always' — it requires approval
every time"` instead of accepting the click and ignoring the row at read time
— the person clicking must learn the grant did not stick. `never` is still
accepted (it only narrows), and a plain one-shot `approve` is unaffected.

Both routes return that refusal — and **only** that refusal — as **400** with
`{ error }`. Swallowing it would leave the gate pending and park the turn for
the full approval deadline. Every other resolve failure (unknown request,
already decided, the gate's turn no longer running) keeps its prior behaviour:
404 on `.../approval`, and on the `inputResponses` route it falls through to
202. That fall-through is load-bearing — eve's SDK sends `{inputResponses,
message}` in ONE body, so 400ing a stale decision would discard the message
with it and every retry of that body would 400 again.

## External engines (delegated turns)

trex-only capability — eve's own runtime has no concept of handing a turn to
something other than its own model loop. `AgentConfig.resolveEngine`
(`eve-shim/types.ts`) is called on every turn/chat request, same posture as
`resolveModel`/`buildInstructions`: a rejecting hook fails the turn rather
than falling back to `runner.ts`'s loop, which would run on the wrong
credentials and the wrong tools. Resolving `undefined` runs the model loop as
usual — this is what makes external-engine delegation a per-account switch,
not a global one, and `resolveModel` is **not** consulted for a delegated
turn at all: the engine holds its own credentials.

The first (and, as of this phase, only) engine is the **claude-code sidecar**
(`plugins/devx/agent/lib/sidecar_engine.ts`) — a Node server wrapping the
Claude Agent SDK, which runs its own agentic loop with its own tools (`Read`,
`Write`, `Edit`, `Glob`, `Grep`, `Bash`, and whatever else the SDK ships).
devx's `agent.ts`'s `resolveEngine` returns it only for a `provider ===
"claude-code"` row; every other provider resolves `undefined` and is
unaffected.

### What changes about turn execution

`service/engine/delegate.ts`'s `runDelegatedTurn` replaces `runner.ts`'s
`streamText` loop entirely for a delegated turn: instead of eve driving the
model over eve's own tool set, the whole turn is handed to `engine.run(...)`,
and `service/engine/events.ts`'s translator maps what comes back — a stream
of `SDKMessage` variants (assistant text, `tool_use`, `tool_result`, the
terminal `result` message, a `compact_boundary`, a `permission_denied`) — onto
eve's `AgentEvent` vocabulary, dropping everything eve has no counterpart for
(session bootstrap, streaming partials, subagent/hook/plugin progress, …).
A delegated turn still persists the same `agents.steps` row kinds a
`runner.ts` turn does (`text`, `tool-call`, `tool-result`, `finish`, `error`)
— the dashboard, `/stream`, claw's transport and `history.ts`'s replay all
read whichever path wrote them, so this is not optional parity, it is the
contract `delegate.ts`'s own header comment states.

### Hooks a delegated turn structurally cannot honour

The engine owns its own loop — there is no per-step hook point inside it for
eve to call into. A delegated turn honours exactly two `AgentConfig` hooks:
`buildUserMessage` (applied to the prompt before it's handed to `engine.run`,
`delegate.ts:56`) and `onTurnEnd` (called once the text is persisted,
`delegate.ts:197-207`, identical posture to `runner.ts`'s own call: errors
logged and swallowed, never called for a failed turn). It does **not**, and
structurally **cannot**, honour `buildInstructions`, `filterTools`,
`onToolCall`, `onToolResult`, or `onCompact` — there is no eve-built system
prompt for the engine to receive, no eve tool set for `filterTools` to
filter, no `authoredTool` call site for `onToolCall`/`onToolResult` to
intercept, and no eve-side compaction to hook (see below). An agent author
who configures one of these five expecting it to apply to sidecar turns will
see it silently do nothing on that path: nothing throws and nothing warns,
because from `delegate.ts`'s point of view the hook was never in scope to
call in the first place.

### Compaction is skipped for a delegated turn, deliberately

`handler.ts`'s pre-turn compaction block is gated on `!engine && priorTurns.length
> 0` — a resolved engine skips it outright, for two independent reasons,
either sufficient on its own:

- **There is nothing for it to shorten.** `DelegatedTurnOpts` carries no
  `history` field at all, unlike `RunTurnOpts` — the sidecar resumes its own
  SDK transcript across turns, so eve's assembled history never reaches the
  engine. Summarizing it would shorten something nothing reads.
- **It would have to run through `resolveModel`, which a `claude-code`
  account has none for.** Compaction's summarizer needs a `ModelSpec` to
  call. A `claude-code` provider row authenticates the sidecar with a Claude
  Code OAuth token, not an Anthropic API key, so synthesizing a `ModelSpec`
  for it would leave `apiKey: undefined` — which `buildModel`
  (`model.ts:52-73`) backfills from the operator's own `ANTHROPIC_API_KEY`.
  That is a cross-tenant credential substitution, the exact failure mode
  `resolveModel` guards against everywhere else in this codebase, which is
  why devx's `agent.ts`'s `resolveModel` still throws `"sidecar providers use
  the legacy endpoint"` for `claude-code` rather than ever returning
  something usable (`agent.ts:194-206`) — this throw is now unreachable on
  the delegating path (the engine is picked before `resolveModel` would run),
  but stays in place because `/chat` has no engine switch and can still
  reach it. Without this skip, `maybeCompact`'s own catch-and-drop fallback
  would silently start dropping the oldest turns from eve's record of the
  session for no benefit.

### `usage.lastStepInputTokens` is absent on a delegated turn

`delegate.ts`'s `turn.completed` handling persists the engine's `usage`
verbatim but never sets `lastStepInputTokens` — the engine reports one
**cumulative** total for the whole delegated turn, where that field
specifically means "the final model step's own prefill", which
`store.ts`'s `getLastTurnUsage` reads as an approximation of how full the
context window is. `getLastTurnUsage` returns `null` when the field is
absent rather than falling back to the summed total (by design — pinned by
`store.test.ts`'s "never falls back to the SUMMED inputTokens" case), and a
consumer chaining off that with `??` (`compact.ts:155`) falls through to the
**estimate** path (`estimateTokens` over the assembled messages), not to
zero. Concretely: a delegated session's next compaction decision (once it
returns to the model loop) is made from an estimate, not the sidecar's own
reported number — it does not read as "no context has been used yet."

### The `"(completed)"` placeholder, and its one latent trap

The sidecar streams its own devx-flavoured SSE (`chunk`, `tool_call_start`,
`tool_call_end`, …) rather than raw SDK messages, and `fn-claude-code/server.js`
emits `tool_call_end` with a hardcoded `result: "(completed)"`
(`server.js:284,341`) — it never threads a tool's real output back onto that
event. `sidecar_engine.ts`'s `toSdkMessage` turns that into a `tool_result`
block whose `content` is the literal string `"(completed)"`, and
`events.ts`'s `translateToolResult` reads `block.content` (there is no
`tool_use_result` on this synthesized message to prefer instead) — so every
sidecar tool call persists an `agents.steps` row of kind `tool-result` whose
`output` is `"(completed)"`, never the tool's actual result.

This is harmless today: the model never sees the placeholder, because the
sidecar resumes its own SDK transcript — which holds the real tool outputs —
and never re-reads eve's persisted steps. The legacy `/stream` path behaves
identically (same `server.js` code), so this is not a regression this phase
introduced.

**The trap:** if that account is later switched from `claude-code` to a real
model provider, `history.ts`'s `assembleHistory` (`history.ts:85`) replays
every persisted `tool-result` step straight into the model's message list —
including, for every prior sidecar tool call, the literal string
`"(completed)"` in place of whatever that tool actually returned. There is no
detection or warning for this. Treat it as a known limitation of switching a
session's provider away from `claude-code` after it has run turns on the
sidecar, not something this phase closes.

### The tool-input mapping, and why an unmapped tool gates rather than fails

Sidecar tool calls are gated by eve's approval machinery before they run —
`sidecar_engine.ts`'s `resolvePermission` is wired as the SDK's `canUseTool`
callback, and it is consulted for calls of any tool, not only ones a devx
author marked `needsApproval`.

**`canUseTool` is reached only on the SDK's `ask` outcome**, and that is a
durable property of the SDK, not a configuration detail: allow rules, deny
rules and `PreToolUse` hooks all resolve before the callback
(`sdk.d.ts:4111`, and the SDK's own `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`
warning — "Allow rules from settings files can also shadow the callback").
The sidecar needs `settingSources: ["user"]` to discover the skills
materialized into `~/.claude/skills`, which also loads
`~/.claude/settings.json` — a file on a mounted volume that the coder can
write itself, and whose `permissions.allow`, `permissions.defaultMode:
"bypassPermissions"` and `hooks.PreToolUse` each route around the gate. What
makes the statement above true is therefore the in-process policy tier
`fn-claude-code/permission_policy.js` stamps onto every query
(`managedSettings`, which no tool call can write): it pins the default mode,
disables bypass mode, and sets `allowManagedPermissionRulesOnly` and
`allowManagedHooksOnly` so no user-tier rule or hook is honoured. Those two
keys are not interchangeable — the managed tier's restrictive-only filter
covers the permissions arrays, not hooks.

To decide, `resolvePermission` has to derive the
same `scopeKey` a native devx call would (`scope-key.ts`'s `deriveScopeKey`,
which reads devx's own field names — `path`, `command`, …) — so
`engine/tool-input.ts`'s `toDevxToolInput` first renames the SDK's field
names onto devx's shape, for the six tools devx itself authors natively
(`Read`, `Write`, `Edit`, `Glob`, `Grep`, `Bash`). Field renames only, no
execution semantics: a field with no mapped target (the SDK `Bash` tool's
`timeout`, `Read`'s `offset`/`limit`, `Edit`'s `replace_all`, …) is dropped
rather than guessed at.

An SDK tool name this table has never been taught (or input that isn't a
plain object) passes through **unmapped** rather than throwing —
`toDevxToolInput` returns the bare SDK name with no renamed fields.
`scope-key.ts`'s `scopeAction` then returns `""` for a name/shape it doesn't
recognize — the same defensive default it already uses for malformed input on
a *known* tool. That empty scope can't match a scoped escalate entry, so the
call falls through `resolveApproval`'s precedence to whatever the
bare-unmatched-tool rule decides: **gate** for an attended session,
**allow** for an unattended one (rules 5/6 in "Precedence" above) — never a
crash, and never a silent grant to an attended human's session. Gating an
unrecognized shape is the safe default: failing the call outright would break
every future SDK tool this table hasn't caught up to yet, and silently
granting it would be worse.

`suggestions` — the SDK's own "always allow this tool for the rest of the
session" signal on a permission response — is **deliberately unmapped**.
`sidecar_engine.ts`'s `PermissionDecision` type has no `suggestions` variant
at all (`{behavior:"allow", updatedInput}` or `{behavior:"deny", message}`
only), and `resolvePermission` always returns `updatedInput: req.input` on
allow, never a `suggestions` array. Eve's own sticky-consent mechanism
(`always`/`never`, divergence 13) is the single place that decision is
allowed to live, keyed on `(user_id, plugin, agent, tool, scope)`; honouring
the SDK's `suggestions` would let it grant a standing consent eve's own store
never recorded and eve's own gate can't revoke — `fn-claude-code/server.js`'s
own `canUseTool` comment states the same reasoning for the legacy path
("`suggestions` … is left unused — it could grant more than agreed").

### Why a tool-name-based escalate policy needed a Bash subcommand scope

`AGENTS_ESCALATE_TOOLS`'s default hard entries are written against **devx
tool names** — `!GitPush`, `!ExecuteSQL`, `!CronCreate`, `!CronDelete`,
`!RestartApp` — because that is what the model loop's own tool set calls
them. The sidecar has no `GitPush` tool: it has `Bash`, and it runs `git
push` (or `psql`, or `crontab`) through it like any other shell command. So
before this phase, every one of those hard entries matched **nothing** on a
delegated turn — an unattended sidecar session could run `git push --force`
where an unattended model-loop session hard-denied the equivalent `GitPush`
call outright. A policy is only as good as its ability to recognize the same
capability however it is reached.

The fix (`scope-key.ts`'s `SUBCOMMAND_TOOLS`) makes the `Bash` scope carry
the subcommand for an allowlist of multiplexer executables — today just
`git` — so the key is `git:push`, not bare `git`: `bashScopeKey` walks past
the executable's value-taking global flags (`-C`, `--git-dir`, …, so `git -C
/repo push` still keys on `push`) to find the first non-flag token.
`DEFAULT_ESCALATE` now reads
`!Bash:sudo|dd|ssh|scp|psql|crontab|git:push|git:subtree`
— `git:push` (and `git:subtree`, whose own `push` subcommand is a push too)
sits in the hard tier beside `psql` (`ExecuteSQL`'s shell equivalent) and
`crontab` (`CronCreate`/`CronDelete`'s), so all three are now
blocked identically from either execution path (with the attended-session
consequence described above, under "Two tiers: hard and soft"). `git
status`/`git diff`/`git log` key on bare `git`, which matches nothing in the
list, so an unattended coder can still read the repo freely. `RestartApp` has
no shell equivalent at all — it drives the process manager through devx's own
DuckDB functions, which a sidecar's `Bash` genuinely cannot reach — so that
entry stays inert on the delegated path, not from a gap in the mapping but
because there is nothing to map.

**The general lesson, stated plainly: a policy written against tool names
loses its teeth the moment a different execution path names the same
capability differently.** Any future engine that presents its own tool
vocabulary needs the same audit this one got — check every hard/soft entry
against what that engine actually calls things, not just what the model loop
calls them. (A Bash scope key's subcommand-awareness is now also part of the
sticky-consent key — see "Accepted limitations" below for the one
consent-scoping consequence that follows from it.)

### What an unattended delegated turn can, and cannot, do

Same precedence as any other gated call (see "Precedence" above), applied
through the Bash-subcommand-aware scope keys above. Concretely, on the
default escalate list, an **unattended** (no human watching — channel-bound
or `sessions.unattended`) sidecar session:

- **Can** run `Read`/`Write`/`Edit`/`Glob`/`Grep` freely, and `Bash` for
  anything not listed below — including the soft-tier `rm`/`curl`/`wget`/
  `chmod`/`chown` (soft allows on an unattended match).
- **Cannot** run `git push` or `git subtree` (anything keying `git:push` or
  `git:subtree`), `psql`, `crontab`, or a command keying on
  `sudo`/`dd`/`ssh`/`scp` — the hard tier denies these outright when no
  approver is reachable, regardless of `unattended` (see above), and gates
  them (parks for a human) when one is. No sticky `always` consent can buy
  back either tier.
- Any SDK tool name outside the six devx maps runs through the gate above
  unrecognized: it allows when unattended, same as any other unmatched call.

An **attended** delegated turn does *not* see hard and soft the same way —
see "Two tiers: hard and soft" above for exactly how they diverge.

## Child-process environment allowlist

trex-only (eve has no equivalent — this is about what a *host tool's own
subprocess* sees, not the agent protocol). `plugins/devx-ext/src/subprocess.rs`'s
`run_git` and `run_command` — the two functions behind the `Bash` tool and
devx's git operations — used to spawn with `Command::new(...)` inheriting the
worker's full environment. **These two, and only these two**, now `env_clear()` first and rebuild the child's
environment from an **allowlist**, not a denylist: `filtered_env(parent, extra)`
keeps only names in `ALLOWED_EXACT` (`PATH`, `HOME`, `SHELL`, `USER`,
`LOGNAME`, `TERM`, `TZ`, `TMPDIR`, `LANG`, `PWD`, `DENO_DIR`, `CARGO_HOME`,
`RUSTUP_HOME`, the `HTTP(S)_PROXY`/`NO_PROXY` pairs in both cases, `JAVA_HOME`,
`GOPATH`, `GOCACHE`, `GOMODCACHE`, `GRADLE_USER_HOME`, `MAVEN_OPTS`) or a
prefix in `ALLOWED_PREFIX` (`LC_`, `NODE_`, `npm_config_`, `NPM_CONFIG_`,
`YARN_`, `PNPM_`) — the rationale being that a newly added secret must not
become reachable by default just because nobody remembered to deny it.

A prefix match gets one extra check: `looks_secret(name)` refuses any name
whose uppercased form contains `AUTH`, `TOKEN`, `SECRET`, `PASSWORD`,
`PASSWD` or `CREDENTIAL`, even under an otherwise-allowed prefix — a prefix
admits names nobody vetted one by one (`NODE_AUTH_TOKEN`,
`npm_config__authToken`, `YARN_NPM_AUTH_TOKEN`), so exact-name allowlisting
alone isn't enough there. Over-refusing this way is recoverable; under-refusing
leaks a secret.

**`DEVX_CHILD_ENV_EXTRA`** is the deliberate escape hatch: a comma-separated
list of exact names admitted regardless of the allowlist or the secret-marker
check — the way back for a deployment that genuinely needs, say,
`NODE_AUTH_TOKEN` reaching a child.

Three exclusions are choices, not oversights:

- **`GIT_*` is not allowlisted at all**, at either call site — but `run_git`
  re-adds a specific, narrow set of its own afterward
  (`GIT_TERMINAL_PROMPT=0`, and `GIT_CONFIG_COUNT`/`GIT_CONFIG_KEY_0`/
  `GIT_CONFIG_VALUE_0` to mark `*` as a safe directory). The exclusion is
  because an inherited `GIT_CONFIG_*` set outranks `.git/config` and would
  override the per-user identity and SSH signing that `git_identity.ts`
  installs there; letting the allowlist admit `GIT_*` generally would silently
  reopen that override. A caller that needs git identity before that file can
  exist (`git_init`) passes a scoped `-c` fallback identity instead, not env.
- **`SSH_AUTH_SOCK` is dropped**, even though an earlier version of this same
  change allowlisted it. It forwards *live signing authority* — auth as the
  host to every trusting SSH endpoint — not a static secret like an API key,
  so it doesn't fit the "value on this allowlist is safe to leak" model. This
  repo's GitHub auth is HTTPS-token based and commit signing uses a
  materialized key file, so no in-repo consumer needs it; a deployment with a
  real SSH-remote workflow gets it back via `DEVX_CHILD_ENV_EXTRA`.
- **Registry/index URL variables are excluded**: `PIP_INDEX_URL`,
  `PIP_EXTRA_INDEX_URL`, `GOPROXY` (these three routinely embed credentials
  directly in the URL) and `CARGO_REGISTRY_TOKEN` (a token outright). Same
  `DEVX_CHILD_ENV_EXTRA` escape hatch for a deployment that needs a private
  registry.

One other child spawned from core is covered, by different means:
`handler.ts`'s turn-diff `git` child (see [Turn-scoped diff](#turn-scoped-diff))
runs with `clearEnv: true` and an explicit `PATH`/`HOME` +
`GIT_TERMINAL_PROMPT`/`GIT_CONFIG_*` set mirroring `run_git`'s.

**Known remaining gap — the process manager.** `plugins/devx-ext/src/
process_manager.rs`'s spawn (the long-running dev server behind
`dev_server.ts`) still inherits the worker environment: it sets `PORT` and
nothing else, with no `env_clear()`/`filtered_env`. It IS model-reachable — a
model-authored `package.json` script started this way runs with the worker's
full environment, and `ReadLogs` returns that process's stdout. Left as-is
deliberately, not by oversight: a dev server may legitimately need a broader
environment than a one-shot `Bash` command, so narrowing it is its own
decision (which variables a *server* gets) rather than a mechanical
application of this allowlist.

## Channels

trex implements eve's **channels** — inbound platform entry points that
start/resume a session and deliver the reply back — via a `defineChannel` layer
(`channels/`) plus eight built-in adapters (`eve`-web, `discord`, `slack`,
`telegram`, `twilio`-SMS, `github`, `linear`, `teams`) and a `custom` layer-only
path. **Channel files are eve-portable**: the `defineChannel`/`POST`/`GET`
authoring API and the adapter factory names (`discordChannel(...)`, …) match
eve, so a `channels/*.ts` file authored here loads on real eve and vice versa.
The day-to-day setup guide (env vars, route URLs to register per platform) lives
in [README.md](./README.md)'s "Channels" section; this section is the
reconciliation record.

### Vendored vs. reimplemented per-platform logic

Adapters reuse eve's **pure, per-platform** helpers (signature verify, payload
parse, REST/message formatting, HITL encode/decode) by vendoring them under
`channels/vendor/<platform>/`, each file carrying an Apache-2.0 attribution
header. eve's **runtime** factories (`defineChannel`, `<platform>Channel.js`,
`dist/src/channel/*`) are NOT vendored — trex's `channels/adapters/*.ts` supply
that wiring. The vendored copies are **pinned to eve@0.19.0**; behavior tracks
that version until re-synced, and `channels/vendor/VENDOR.md` records the exact
copied files and local edits so a re-sync is mechanical (bump the version,
re-copy, re-apply the edit categories).

Not every adapter could vendor cleanly — several of eve's "pure" helpers turned
out to import compiled-coupled runtime primitives (`#compiled/@chat-adapter/*`,
`#compiled/jose`) or `#internal/logging`, which are not vendorable in a Deno
worker. Those pieces are **reimplemented** (trex-owned, standard algorithms),
honestly labelled as such in VENDOR.md:

- **discord** — cleanest split; all pure helpers vendored (Ed25519 verify moved
  from Node `node:crypto` to WebCrypto, so `verifyDiscordSignature` is now async).
- **slack** — `verify`/`api` **reimplemented** (eve wraps
  `#compiled/@chat-adapter/slack/*`); pure parsers/HITL vendored. mrkdwn↔GFM is a
  **passthrough** (eve's `slackMrkdwnToGfm` wraps a compiled format engine).
- **telegram** — mostly vendored; `hitl` **reimplemented** as a stateless compact
  `callback_data` encoding (eve's is stateful per-session channel state, which the
  trex layer doesn't expose).
- **twilio** — the odd one out: `verify`/`api`/`inbound`/`twiml` **reimplemented**
  from eve's minified `#compiled/@chat-adapter/twilio/*` chunks; SMS HITL is
  **invented for trex** (eve's Twilio channel has no HITL widget). SMS only.
- **github** — most helpers vendored; `verify` (HMAC) and `auth` (RS256 App-JWT
  mint) **reimplemented** on WebCrypto. The App-JWT reimplementation also converts
  a PKCS1 GitHub key to PKCS8 in-process (WebCrypto `importKey` accepts only
  PKCS8; Node's `createSign` accepted both). Comment HITL **invented for trex**.
- **linear** — a **model mismatch**, not just runtime coupling: eve@0.19.0's
  Linear channel is built on Linear's **Agent Session** platform (consumes
  `AgentSessionEvent` webhooks, delivers via `agentActivityCreate`). The trex
  adapter uses the CLASSIC **Comment/Issue webhook + `commentCreate`** model
  instead, so only the model-agnostic pieces (verify algorithm, credential
  resolvers, GraphQL transport) are reused; inbound parse, delivery mutation,
  HITL, and auth projection are all trex-shaped for the comment model. Adds a
  config-free echo/loop guard (a hidden marker on every outgoing comment) eve's
  agent-session model never needed.
- **teams** — the Bot Framework JWT validator is **reimplemented** on WebCrypto
  (eve validates with `#compiled/jose`), including `alg:none` rejection, JWKS
  fetch+cache, and full claim checks; everything else (Activity parse,
  client-credentials delivery, Adaptive-Card HITL) is vendored.

### Channel-level divergences from eve

1. **`waitUntil`-backed background delivery vs eve's Nitro.** eve delivers
   replies from a Nitro/H3 `waitUntil` after ACKing the webhook; trex reproduces
   the same "ACK in 3s, run in background" contract on its own edge-runtime
   `waitUntil`-style primitive. Same contract, different host primitive; if the
   primitive is absent the design falls back to a persisted delivery-pending
   marker drained by a poller. Delivery is **best-effort / at-least-once**, not
   eve's exact Nitro internals (spec §4.2, §9).
2. **Platform-signature route auth replaces trex `pluginAuthz`.** Channel webhook
   routes (`…/eve/v1/<channelId>/*`) are exempted from `authContext`/`pluginAuthz`
   and authenticated by the adapter's own signature verify (Discord Ed25519,
   Slack signing secret, Telegram secret token, GitHub/Linear HMAC-SHA256, Twilio
   signature, Teams Azure JWT) — which must pass before any `send()` work, so a
   bad signature 401s first. The **`eve` web channel is the exception**: it
   carries no platform signature and stays behind the trex JWT exactly like the
   native session API (it is excluded from the auth carve-out).
3. **WebSocket channels + Twilio voice deferred to v1.1.** All eight built-in
   adapters are HTTP webhooks. The `WS()` route helper is stubbed (throws a clear
   "not supported in v1"), and Twilio's voice-call / transcription / media-stream
   surface is not implemented (SMS only).
4. **`continuationToken` addressing.** The layer namespaces an adapter's raw
   continuation token with the channel id and maps `(channel, token)` → session
   via `agents.channel_sessions`; a channel's `auth` principal is stored on new
   `agents.sessions.principal_type/principal_id/authenticator` columns (distinct
   from the trex `x-user-id`).

### Channels — known v1 limitations

These are real, shipped-with gaps, not cosmetic:

a. **HITL over channels does NOT close end-to-end.** The channel layer has no
   token→session RESUME primitive a webhook route can call — `send()` always
   starts a *fresh* turn. So every adapter renders its HITL widget but exposes an
   injectable `opts.resume` seam whose **default is a loud no-op**: it warns and
   drops the approval rather than POSTing to a route that would 404. Wiring HITL
   fully today requires supplying `opts.resume` (which calls the native approval
   route). This is the single biggest channels gap; a first-class resume
   primitive is the follow-up.
b. **Concurrent same-session turns can cross-cancel delivery.** A rapid
   double-message on one continuation token (two turns racing on the same
   session) can cross-cancel the background delivery — turn serialization per
   session is a follow-up.
c. **Cross-user session-stream ownership is not enforced on the stream routes.**
   The `created_by`/principal scoping that guards approval resolution on the
   session API (divergence 14) is not applied to the channel stream routes — a
   leaked stream URL is readable cross-user.
d. **Slack mrkdwn is a passthrough** (eve's compiled mrkdwn↔GFM engine isn't
   vendored), so a GFM-formatted reply renders imperfectly on Slack; Slack event
   de-dup is deferred (a redelivered event can drive a duplicate turn).
e. **Linear delivery is mock-tested only.** The `commentCreate` fields have not
   been confirmed against live Linear; the adapter's inbound/verify/loop-guard
   are unit-tested, but end-to-end delivery is unverified against the real API.
f. **A channel's declared `state`/`metadata`/`context` are accepted but not
   projected (spec §6).** `ChannelDef.state`, `metadata(state)`, and
   `context(state, session)` pass through `defineChannel` and type-check, but the
   runtime never invokes `.metadata(`/`.context(` and there is no `channel_state`
   table — so an author who declares them gets a silent no-op. State projection
   into session metadata / dynamic-tool resolution is not wired in v1.

## Connections

trex implements eve's **connections** — declarative, per-agent integrations that
expose an *external service's* tools to the model with managed credentials kept
out of the prompt — via a connection layer at `connections/`
(`defineMcpClientConnection` + `defineOpenApiConnection`), an eve-native static
auth path, and a **trex-native OAuth broker** (`trexConnect`, see below) that
replaces Vercel Connect. Connections extend the **tool layer**, not the
session/channel layer: each is realized as an H2-style dynamic tool provider
(`buildConnectionProvider`, a sibling merge to `dynamic-tools.ts` in
`service/toolset.ts`), so a broken connection logs-and-continues and never fails
the turn. The day-to-day authoring/setup guide (how to add a connection,
register an OAuth connector, the env/secret refs) lives in
[README.md](./README.md)'s "Connections" section; this section is the
reconciliation record. The manual live-acceptance steps are in
[connections/ACCEPTANCE.md](./connections/ACCEPTANCE.md).

### What we implement

- **`connections/*.ts` discovery** — the loader (`loader.ts`) no longer ignores
  `connections/` (only `sandbox/` remains in `IGNORED_DIRS`). Each file at the
  agent-dir root default-exports a branded connection def; the filename (minus
  extension) is the connection name (`connections/linear.ts` → `linear`, its
  tools `linear__<tool>`). Discovery is top-level only (subagents declare none,
  eve parity).
- **`defineMcpClientConnection({ url, description, auth?, headers?, tools?, approval? })`**
  — points at a remote MCP server. The default connect tries
  `StreamableHTTPClientTransport` first, then falls back to SSE (eve's transport
  fallback), via `@modelcontextprotocol/sdk` (already a dep, proven by the devx
  MCP path). The server's tools are exposed as `<name>__<tool>`.
- **`defineOpenApiConnection({ spec, description, auth?, headers?, tools?, approval?, baseUrl? })`**
  — generates one tool per OpenAPI operation. The generator
  (`connections/openapi.ts`) is a **fresh, readable port of eve@0.19.0's**
  `runtime/connections/openapi-*.js` transform (a genuinely pure spec→tools
  algorithm; see divergence 2), not vendored bytes.
- **`connection_search` built-in** — added at depth 0 only when the agent has ≥1
  connection (`service/toolset.ts`); input `{ query }`, returns the best-matching
  `<name>__<tool>` names + descriptions (token-overlap ranking over each tool's
  namespaced name, its own description, and its connection's description; a blank
  query returns every tool). Discovery only — see limitation (e).
- **`<name>__<tool>` naming**; **`tools: { allow: [...] } | { block: [...] }`**
  filters (exactly one, enforced at authoring time by the shim over the *bare*
  remote tool name); **`approval: once()`** → the tool is marked `needsApproval`
  and rides the existing approval park/resume + H4 sticky-consent flow.
- **Static auth** (`auth.getToken` → `Authorization: Bearer <token>`;
  `auth.headers` / top-level `headers`, either a literal map or a function of
  session ctx; omit both → no-auth). Resolved fresh per turn. The MCP client
  cache is keyed by `(agentDir, connection, url, hash(resolved-headers))` so a
  ctx-dependent `getToken`/`headers` can never reuse one caller's authenticated
  client for another's `callTool` (tenant isolation).
- **The trex-native OAuth broker** (`trexConnect`) — §5/§7 of the spec; detailed
  below.

### The OAuth broker (`trexConnect`)

`trexConnect(connector, { principalType? })` is trex's replacement for eve's
`connect()`. It brands a connection's `auth` as `{ kind: "oauth", connector,
principalType }` (`principalType` defaults to `"user"`; `"app"` acts as the
application's own service principal under the `__app__` sentinel). At tool-call
time the broker (`connections/oauth/broker.ts`) resolves it to one of:

- a valid stored token (or one it silently **refreshes** via the connector's
  `refresh_token` when within the expiry-skew window) → the call proceeds with a
  Bearer;
- `authorization.required` → the tool emits a `tool.event` carrying the consent
  URL and **parks** (polls the token store until the callback writes the token,
  or a 5-minute timeout — mirroring the `needsApproval` park in `toolset.ts`);
- `principal_required` → a terminal error surfaced to the model, when a
  user-scoped connection has no resolvable principal (**fail-closed**: it never
  borrows the app token or anyone else's).

**Consent routes** are mounted on the agent worker and, like channel routes, are
**exempt from `pluginAuthz`** (the proxy's `channelAuthExemptPattern` excludes
only `session|health|info|eve`, so `oauth` falls through the exemption). There is
no trex JWT on the provider's browser redirect — the **only** authenticator is a
signed, expiring `state` (HMAC over session+principal+connector+nonce+exp, via
`connections/oauth/state.ts`):

- `GET …/eve/v1/oauth/<connector>/start?state=<signed>` → verify state → 302 to
  the connector's `authorization_url` (`client_id`, fixed `redirect_uri`,
  `scope`, the same `state` threaded through). Nothing is written here.
- `GET …/eve/v1/oauth/<connector>/callback?code=…&state=…` → verify state →
  exchange `code` at `token_url` → encrypt + store the token under the exact
  `(principalType, principalId)` the state was signed with → the parked turn's
  poll observes it and resumes. A bad/expired/forged state, a missing code, an
  unset client secret, or a failed exchange all return an error and write
  **nothing** (the parked turn is left to time out — never silently resumed).

**Data model** (`migrations/V5__connections.sql`, agents schema, follows
channels' `V4`):

- `agents.oauth_tokens (principal_type, principal_id, connector,
  access_token_enc, refresh_token_enc, expires_at, scopes, …,
  PK(principal_type, principal_id, connector))` — `*_enc` columns are AES-GCM
  ciphertext produced by the DEK layer (`core/server/auth/dek.ts`); tokens are
  **never** stored plaintext. App-scoped tokens use `principal_id = '__app__'`.
- `agents.oauth_connectors (id, authorization_url, token_url, client_id,
  client_secret_ref, scopes, principal_scope, …)` — `client_secret_ref` is an
  **env-var name**, not the secret; the secret is resolved from the environment
  at use time and never persisted (an unset/empty ref is a hard error at exchange
  and refresh time — never send `client_secret=`).

**`TREX_ROOT_KEY` gates the whole broker.** The worker wires it only when
`TREX_ROOT_KEY` is set (`service/index.ts`), because it needs the root key to
unwrap the DEK (token encryption-at-rest) and to derive the HMAC state secret
(`deriveSubkeyBase64(LABELS.agentsOAuthState)`). Without it — or if DEK init
fails — the broker is left unwired: the `/oauth/*` routes 404 and a
`kind:"oauth"` connection reports "not configured" and skips its tools, but every
non-oauth agent still boots. **Env vars:** `TREX_ROOT_KEY` (broker + DEK), plus
each connector's own `client_secret_ref` env key.

### Deliberate divergences from eve

1. **`trexConnect` REPLACES eve's `connect()`.** eve's Vercel Connect is
   proprietary; trex ships its own broker instead. This is the one intentional
   authoring-API break: a connection file that uses **static auth** or plain
   **MCP/OpenAPI** is byte-portable to real eve, but a file using
   `trexConnect(...)` is **NOT portable to real eve** without swapping back to
   `connect(...)` — the whole broker (routes, token store, signed state, refresh)
   has no real-eve equivalent to fall back to. `trexConnect` is exported from the
   `eve/connections` shim (`connections/shim.ts`); on real eve that import
   wouldn't resolve.
2. **The OpenAPI generator is a trex fresh port, pinned to eve@0.19.0's
   algorithm.** `connections/openapi.ts` re-implements eve@0.19.0's
   `runtime/connections/openapi-*.js` transform (operation naming with the
   `opId → method_pathslug`/64-char-cap fallback, `$ref` deref with cycle guard +
   depth cap, param/requestBody → JSON Schema, Swagger `host`/`basePath` +
   OpenAPI `servers` extraction, apiKey/http-basic/bearer/oauth2 security
   placement, response shaping). It ships trex `ToolDef`s, not ai-sdk `Tool`s.
   Behavior tracks that pinned version; the shipped eve dist is minified-only, so
   this is a readable port against it as reference, not vendored bytes.
3. **MCP client via `@modelcontextprotocol/sdk`, not eve's `mcp-client.js`.**
   eve's `mcp-client.js` is the one coupled file in its connection tree (imports
   `#compiled/@ai-sdk/mcp`, `#context/*`, `#runtime/connections/*`), so it is
   NOT reused; trex connects with the SDK directly, reusing the shipping devx
   posture (lazy connect, per-`(agent, connection, auth)` client cache,
   connect-error → skip that connection). Only eve's small pure helpers
   (`passesToolFilter`, the http→sse transport fallback) are mirrored.
4. **`authorization.required` is a `tool.event`, not a first-class stream
   event.** eve documents it as a distinct connection-OAuth challenge event;
   trex surfaces it through the additive `tool.event` mechanism (divergence 10)
   from inside the parked tool's `execute()`. There is no `authorization.completed`
   event at all (see "What we ignore entirely").

### Connections — known v1 limitations

These are real, shipped-with gaps, not cosmetic:

a. **Channel-initiated OAuth fails closed.** The channel principal is not yet
   threaded into `HookCtx.principal` — `buildHookCtx` (`service/handler.ts`) only
   derives the principal from the native `x-user-id`. So OAuth connections work
   for **web sessions** (an `x-user-id`-authenticated caller), but a session
   started by a **channel** (Discord/Slack/…) has no principal and a user-scoped
   `trexConnect` connection fails closed with `principal_required` until that
   threading lands. App-scoped (`principalType: "app"`) connections are
   unaffected (they key on `__app__`, not the end user).
b. **MCP + OAuth cold-start chicken-egg.** An MCP connection cannot enumerate its
   tools before it has connected, and it cannot connect without a token — so an
   oauth-gated **MCP** connection with no token yet cannot list any tools; its
   tools appear only on the turn *after* the principal has authorized (the
   provider resolves-or-skips at build time, no park). An oauth-gated **OpenAPI**
   connection has no such problem: it enumerates from its static spec and parks
   cleanly from cold at the first tool call.
c. **`redirect_uri` is derived from the worker request origin.** The fixed
   per-connector callback URL is built server-side from the incoming request's
   own `origin` + the worker mount prefix. Behind a proxy whose public origin
   differs from what the worker sees, the redirect_uri won't match what's
   registered at the provider — a `PUBLIC_URL`-style override is needed and is a
   follow-up (not wired in v1).
d. **OpenAPI spec source is inline-object / JSON-string only.** Remote-URL specs,
   file-path specs, and YAML documents are deferred — `openapi.ts`'s `parse()`
   throws a clear error for anything but an inline document object or a JSON
   string.
e. **`connection_search` is discovery-only.** The `<name>__<tool>` tools are
   still realized **eagerly** by the provider and stay directly callable —
   `connection_search` only helps the model *name* them, it does not gate their
   availability (full lazy-gating is deferred past v1). One consequence: a
   `filterTools` hook runs *after* the connection merge, so `connection_search`
   can list a tool that `filterTools` later drops from the callable set.
f. **No connector-registration route.** `agents.oauth_connectors` rows are seeded
   by an operator via SQL; the admin route set spec §5 sketched (mirroring devx
   `provider_config_routes`) is deferred. The store exposes only `getConnector`
   (read) — there is no write path outside migrations/tests. Connectors are
   admin infrastructure, so SQL-seeding is the v1 workflow.
g. **Consent routes are not rate-limited.** `/eve/v1/oauth/<connector>/{start,
   callback}` reject any request without a valid signed `state` before any token
   write, so the exposed surface is only cheap HMAC-verify CPU (no credential or
   token exposure) — but per-IP throttling (spec §5 Security) is a v1.1 follow-up.

## Turn-scoped diff

trex-only (no eve equivalent). `GET /eve/v1/session/:id/turn/:turnId/diff`
returns a read-only `git diff` scoped to exactly the paths ONE turn's file
tools touched, without the caller re-reading the whole tree. Two pieces make
it work:

- **Recording** (`toolset.ts`'s `authoredTool`): after a call to `Write`,
  `Edit`, `DeleteFile`, `SearchReplace`, `CopyFile` or `RenameFile`
  (`scope-key.ts`'s `PATH_TOOLS`/`PAIR_TOOLS`, reused by its new
  `touchedPaths` helper so this can never drift from the escalate floor's own
  path/pair scope-key derivation) returns successfully — never for a call the
  approval gate denied, and never for a tool result shaped `{error}` (a tool
  that itself failed did not touch what it claims to) — the normalized
  path(s) are appended to `agents.turns.touched_paths` (migration `V12`, a
  `TEXT[]` column, default `{}`) via `store.recordTouchedPaths`. A copy/rename
  records BOTH endpoints separately, not one JSON-joined pair.
- **Serving** (`handler.ts`): the route first checks
  `store.turnBelongsToSession(turnId, sessionId)` — a turn from another
  session 404s exactly like an unknown one, never distinguishing the two
  cases to a caller. It then reads `touched_paths` back and, if non-empty,
  shells out to git (the worker's own `Deno.Command`, args
  array — no shell, so a model-authored path can't inject a flag; the `--` is
  still load-bearing, stopping a path like `--output=x` from being read as a
  git option) in a working directory the AGENT resolves. `git ls-files`
  splits the recorded paths into tracked and untracked; the tracked ones are
  diffed with **`git diff HEAD`** (bare `git diff` misses everything staged —
  including a file the coder created and `git add`ed, the commonest case of
  all) and each untracked one with `git diff --no-index -- /dev/null <path>`,
  concatenated. Both are strictly read-only: the route never runs `git add
  -N` or otherwise writes the index. A repo with no commits (no `HEAD`) falls
  back to `diff --cached` + `diff` rather than erroring.

- **Serving, security** (`handler.ts`): `git diff` is *scriptable by the repo
  it runs in* — `diff.external`, and a `diff.<driver>.textconv` reachable
  through `.gitattributes`, both execute arbitrary commands — and the coder
  whose turn this route diffs can write `.git/config` in that very workspace.
  So the git child is (1) spawned with `clearEnv: true` and an explicit
  `PATH`/`HOME` + `GIT_TERMINAL_PROMPT=0` + safe-directory `GIT_CONFIG_*` set
  mirroring `subprocess.rs`'s `run_git`, so nothing that does run sees
  `ANTHROPIC_API_KEY`/`DATABASE_URL`/the DEK/Discord/Logto secrets;
  (2) invoked with `--no-ext-diff --no-textconv` and `-c diff.external=
  -c core.attributesFile=/dev/null` (the `-c` pairs must precede the
  subcommand), disabling both the invocation and the configured drivers; and
  (3) time-bounded (`GIT_DIFF_TIMEOUT_MS`), so a slow driver cannot wedge the
  request — a timeout is reported as the "unavailable" shape below.

### Three response shapes

1. **No touched paths** — `{ paths: [], diff: "" }`. This is the ONLY
   shape without an explicit workspace/git step; it fires before either is
   attempted.
2. **A diff** — `{ paths, diff: "<git diff output>" }`, once a workspace
   resolved and `git diff` exited 0.
3. **Unavailable** — `{ paths, error: "<reason>" }`, with **no `diff` key at
   all**. Covers "no workspace resolver configured/it declined" (`error:
   "no workspace available to diff against"`), "resolved workspace but
   git itself failed or timed out" (`error` carries `git`'s own stderr, e.g.
   "not a git repository"), and "none of the recorded paths are tracked by,
   or present in, the resolved workspace" — almost always a workspace/root
   mismatch, and reported here rather than as an empty diff for the same
   reason as the rest. (A path that is merely *missing* while others are
   diffable just contributes nothing.) The missing `diff` key is deliberate — fix round 1 on
   this task found that collapsing "couldn't look" into the same `diff: ""`
   as "nothing to show" tells a caller a turn was clean when the truth is the
   route couldn't tell. `paths` is always present, even on the error shapes,
   so a caller can see what WOULD have been diffed.

### Two real limitations

- **`Bash` writes are not tracked.** `Bash` is not in `PATH_TOOLS`/
  `PAIR_TOOLS`, so a turn whose changes came entirely from a shell command
  (`rm`, a build script, `sed -i`, …) records an empty `touched_paths` and
  reports response shape 1 — `{ paths: [], diff: "" }` — indistinguishable
  from a turn that touched nothing at all. This is a stated, accepted gap
  (the route's own header comment says it plainly), not a bug: statically
  deriving what a shell command wrote would need either parsing the command
  (unreliable, see the escalate floor's own `Bash` scope-key limitations
  above) or diffing the whole tree before/after every `Bash` call, which
  defeats the point of a narrow, cheap, per-turn diff.
- **Depends on `AgentConfig.resolveWorkspace`; never guesses.** Core has no
  workspace/cwd concept of its own — `resolveWorkspace` is a new,
  deployment-authored `AgentConfig` field (same posture as `resolveModel`/
  `buildInstructions`) that resolves the git worktree a session's file tools
  actually write into. It is deliberately NOT `HookCtx`-shaped: the diff
  route is a bare `GET` with no live request to build a `HookCtx` from, so it
  instead hands the resolver what the STORE can tell it — the session's own
  `created_by` as `userId`, and the DIFF'D TURN's own `metadata` (not
  necessarily the latest turn's, and not this request's, which carries none).
  Absent, or resolving to `undefined` (devx's own `resolveWorkspace` returns
  `undefined` only when a turn has no `userId` at all — a turn with a `userId`
  but no `appId` gets the user-scoped `ensureWorkspace(userId)`, mirroring
  `lib/context.ts`'s `toDevxCtx`, which is the workspace that turn's file
  tools actually wrote into), the route reports response shape 3 rather than falling back to the
  worker's own process `cwd` — an early version of this route did exactly
  that (shelled to `git diff` in the worker's own cwd) and was corrected once
  it was clear that a wrong-but-successful diff is worse than an honest
  "unavailable". devx wires this today (`plugins/devx/agent/agent.ts`'s
  `resolveWorkspace`, reusing the same `ensureAppWorkspace`/`ensureWorkspace`
  paths `buildInstructions`/attachment materialization already use) — `claw` and
  `d2esupport` do not configure it, so the route always reports unavailable
  for them regardless of what a turn touched.

## What we ignore entirely

- **`sandbox/`** — not loaded; no seeded `/workspace`, no sandboxed tool
  execution.
- **`schedules/`** — not implemented; no cron-driven turns, no
  `dispatchSchedule`.
- **`hooks/`** — not implemented.
- **`authorization.completed`** — no distinct "consent finished" stream event.
  `authorization.required` *is* now surfaced (as a `tool.event` from an
  oauth-gated connection tool — see the "Connections" section), but the
  completion side is signaled implicitly: the parked turn resumes when the
  callback writes the token, with no separate `authorization.completed` event.

(**`connections/`** — MCP and OpenAPI — are now implemented; see the
"Connections" section above. They are no longer in this list.)
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
  is a plain boolean on the tool definition (`eve-shim/types.ts`). Not the
  same thing as divergence 13's sticky `always`/`never` decision verbs, which
  are a different, additive mechanism (a resolve-time API choice plus a
  `tool_consents` table), not this eve-native policy-function primitive.
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
  (A later migration, `V2__custom_steps.sql`, DID add a new
  `agents.steps.kind` value — `'custom'`, for `tool.event`/`ToolContext.emit`
  (divergence 10 above) — but that widening is unrelated to this gap: it
  gives an *authored tool* a durable step kind to persist through, not these
  four *runtime-lifecycle* events, which still have no `agents.steps` row of
  their own and remain exactly as non-replayable as described above.)
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

### H5 re-verification (post H1-H4 hooks)

Re-ran the identical probe recipe after H1-H4 (per-request hooks, filterTools/
dynamic-tools.ts, `ToolContext.emit`, sticky approval decisions) all landed,
specifically because the toy agent fixture uses NONE of those hooks — it is
the default/no-hooks path. Same standalone probe (real `handler.ts`/
`store.ts`/`loader.ts`, `toy-agent-pg` on `localhost:15544`, migrated through
`V3__tool_consents.sql`, a scripted `MockLanguageModelV3`), two independent
runs (fresh probe process + truncated tables between them, to rule out
mock-model call-count state leaking across runs): **3/3 gates both times**
(`succeeded`, `calledTool(echo)`, `includes(banana)`) —
`plugins-dev/toy-agent/.eve/evals/2026-07-04T*/summary.json`. Confirms H1-H4's
additive hooks (all opt-in `AgentConfig`/`ToolDef`/agent-dir-root-file
surfaces an agent must explicitly configure) introduced no regression on an
agent that configures none of them.

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
