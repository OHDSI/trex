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
`session.waiting`, `session.failed`, plus one additive trex extension not in
eve's vocabulary at all: `tool.event` (see divergence 10 below).
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
    - **Subagents** (depth 1, `toolset.ts`'s `runSubagent`) inherit the
      parent's `toolEmit` unchanged via the existing `{ ...ctx }` spread — a
      subagent's `ctx.emit(...)` call lands on the SAME channel (session
      stream or chat writer) as its parent's, not a distinct one; there is
      no per-subagent tagging of a `tool.event`'s origin.
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
    trusted tool), both hooks apply to EVERY tool regardless of origin — they
    INTERCEPT rather than grant, so withholding them from the least-trusted
    tools would invert the intent. `onToolCall` may deny the call (`{allow:
    false, reason?}` → the tool returns `{error: reason}`) or rewrite its
    input (`{allow: true, input}`) before `def.execute` runs; `onToolResult`
    may rewrite the tool's return value after it runs. Both fail CLOSED: a
    throwing/rejecting hook denies THAT CALL (`{error: "on{ToolCall,
    ToolResult} hook failed: <message>"}`) and the turn continues — the
    opposite of devx's legacy loop, which caught hook errors and proceeded;
    a hook whose job is to stop something must not be defeated by its own
    bug. This is also the opposite failure posture from divergence 12's
    `dynamic-tools.ts` provider (log-and-continue): these hooks are a
    trust-boundary control on tool calls, not an operational integration.
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
