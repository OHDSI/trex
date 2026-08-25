# Eve loop parity + cutover — design

**Date:** 2026-08-25
**Branch:** `p-hoffmann/codex-compare` (worktree `.claude/worktrees/codex-compare`), based on `3fd57f46`
**Status:** design approved, spec under review

## Problem

`plugins/devx` runs two agent loops side by side, selected per user by
`devx.settings.loop` (`'legacy' | 'agents'`, default `'legacy'`, added in
`V11__loop_flag.sql`). The `'agents'` path is the eve/agents runtime in
`core/server/agents` driven by the agent directory at `plugins/devx/agent/`.

The eve path is at deliberate **tool** parity — `agent/lib/parity.test.ts`
enforces `TOOL_DEFINITIONS names == loadAgent(devx/agent).tools ∪ EXCLUDED`,
with file:line justification for each of the three exclusions (`Skill`, `Agent`,
`CompactContext`). Skills content is shared outright: `plugins/devx/agent/skills`
is a **symlink** to `../skills`, so drift is impossible.

Parity was never established for anything that is not a tool name. Six gaps
remain, and all six become user-visible regressions the moment the default
flips to `'agents'`.

## Goals

- Close all six gaps below.
- Extend `core/server/agents` where the gap cannot be expressed in the current
  hook contract, following the established additive-`AgentConfig` convention so
  agent directories stay loadable on real eve.
- Flip `devx.settings.loop` to default `'agents'` and move existing rows.

## Non-goals

- Sandboxing and multi-tenant isolation. Out of scope by direction; tracked
  separately.
- Fixing or porting `CompactContext`. It is excluded from parity for cause
  (it manipulates `devx.messages`/`devx.compacted_contexts`, tables only the
  legacy history builder reads back) and is independently defective — it
  prepends a truncation-based blob without removing anything. It stays dead on
  the eve path.
- Token-budget context management. Real, but a separate piece of work.

## Gap inventory

| # | Gap | Evidence |
|---|-----|----------|
| 1 | Prompt is mode-blind: `buildInstructions` hardcodes `mode: "agent"` while `filterTools` is mode-aware, so plan mode gets plan-mode tools with the agent prompt | `agent/agent.ts:325` vs `:210,220`; `functions/prompts.ts:1072-1081` |
| 2 | `skillContext` never reaches the eve prompt | `agent/agent.ts:323-329`; legacy injects at `functions/prompts.ts:1084` |
| 3 | `base`'s `## Skills` listing is discarded, leaving `SKILL_USAGE_RULE`'s "the skills above" dangling | `agent/agent.ts:302,330`; `core/…/toolset.ts:70-73`; `functions/coder_context.ts:32` |
| 4 | DB-backed user hooks (PreToolUse/PostToolUse/Stop) never fire | `functions/agent.ts:235,322,358,572`; no equivalent in `agent/` or `core/…/service/` |
| 5 | Attachments are not materialized; UI-reachable, not channel-only | `functions/agent.ts:15,490`; `src/components/chat/ChatInput.tsx:101` |
| 6 | Subagent progress is opaque: `runSubagent` returns `{ text }` only | `core/…/toolset.ts:187-218` vs `functions/tools/spawn_agent.ts:167-169` |

Note on 3: legacy has no skills listing either — its `skillContext` is an
activated skill's *body*, not a list. So the "skills above" reference is wrong
on both paths today. eve already builds the listing and throws it away; legacy
never had one. Preserving it on eve and adding it to legacy fixes both and
keeps them equivalent.

## Design

### 1. Core: four additive `AgentConfig` hooks

Added to `core/server/agents/eve-shim/types.ts` alongside `resolveModel`,
`buildInstructions`, `filterTools`. Same convention as H1-H4: trex-only fields
that real eve's `defineAgent` silently ignores, so an agent directory using them
still loads there, just without the behaviour. Recorded as new divergences in
`COMPAT.md`.

```ts
onToolCall?: (
  call: { name: string; input: unknown },
  ctx: HookCtx,
) => Promise<{ allow: boolean; input?: unknown; reason?: string }>;

onToolResult?: (
  call: { name: string; input: unknown; result: unknown },
  ctx: HookCtx,
) => Promise<unknown>;

onTurnEnd?: (
  turn: { text: string; finishReason: string },
  ctx: HookCtx,
) => Promise<void>;

buildUserMessage?: (base: string, ctx: HookCtx) => Promise<string>;
```

**`onToolCall` / `onToolResult` placement** — inside `authoredTool`'s `execute`
(`core/…/service/toolset.ts:94-160`), **after** the approval gate at `:105-142`
and immediately around the `def.execute!(input, {...})` call at `:143`.

Ordering is load-bearing: a hook that ran before consent would be a
consent-bypass. Consent stays the outer gate; hooks are inner.

They apply to **all** tools, not only `isAuthored` ones. This deliberately
differs from the `sql` capability at `:167`, which is withheld from
provider-sourced (MCP) tools because it *grants* power. A hook *intercepts*, so
withholding it from the least-trusted tools would invert the intent. This also
matches legacy, whose matcher runs against every tool name.

**`onTurnEnd` placement** — `core/…/service/runner.ts`, immediately before
`runTurn` returns, after the `finish` case has settled `text`/`finishReason`.

**`buildUserMessage` placement** — `core/…/service/runner.ts:57`, where
`messages` is assembled from `opts.history` plus `userContent`. Signature
deliberately mirrors `buildInstructions(base, ctx)`.

Why attachments do not ride `buildInstructions`: the system prompt is
cache-pointed (`withSystemCachePoint`, `runner.ts:114`) precisely because it is
stable across turns and across requests for the same agent+metadata. Attachment
paths change every turn, so folding them into the system prompt would invalidate
the prompt cache on every request. The user message is already uncached by
design (`runner.ts:111-112`).

### 2. Failure posture

| Hook | On throw | Rationale |
|------|----------|-----------|
| `onToolCall` | Deny that call — tool returns `{ error }`; turn continues | Matches `resolveModel`/`buildInstructions`' documented never-silently-fall-back posture, scoped to the call rather than the turn |
| `onToolResult` | Deny — the result is replaced with `{ error }` | A result rewriter that fails must not pass the raw result through as if it had been inspected |
| `onTurnEnd` | Log and swallow | The turn already succeeded; a Stop-hook bug must not retro-fail completed work |
| `buildUserMessage` | Fail the turn | Same as `buildInstructions` — a turn built on a half-resolved prompt is worse than no turn |

**This inverts legacy for tool hooks.** `functions/agent.ts:328-331` catches a
throwing PreToolUse hook, logs it, and proceeds — hooks fail open. A hook whose
job is to stop something must not be defeated by its own bug. Behaviour change,
called out in the PR description.

**Caveat — the inversion is core-only; the chain as a whole is NOT
fail-closed.** The table above governs a hook FUNCTION that throws. devx's
actual `onToolCall` implementation delegates to
`functions/skills/hooks.ts`, which denies only on **exit code 2** (the Claude
Code blocking convention) or an explicit stdout deny. Three internal failures
still resolve to "approve": `executeHook` throwing (`hooks.ts:61`), a hook
command whose executable is not on the allowlist (`:166`), and the
Trex/DuckDB runtime being unavailable so the command never runs (`:216`).
These are byte-identical on both loops, so the cutover regresses nobody — but
nothing here should be read as "a devx PreToolUse hook cannot be bypassed".
Making those three deny would mean a DuckDB hiccup denies every tool call on
both loops; that is a deliberate non-goal of this work.

**Also not intercepted:** the `skill`, `agent` and `connection_search`
built-ins bypass `authoredTool` entirely, and a depth-1 subagent runs with the
SUBAGENT's config — devx's `.edn` subagents carry no TS config, so a devx
subagent turn runs with no hooks at all. A user whose legacy PreToolUse
matcher was `Agent|Skill` loses that enforcement at cutover.

### 3. Core: subagent streaming

`runSubagent` (`core/…/service/toolset.ts:187-218`) currently ends with
`return { text: await result.text }`, discarding every intermediate step.

No new plumbing is needed — `buildSdkTools({ ...ctx, agent: target, depth: 1 })`
at `:198` already carries `toolEmit` through the spread. The change is to consume
`result.fullStream` and emit, via `ctx.toolEmit`:

- `subagent.start` — `{ runId, agent }`
- `subagent.tool` — `{ runId, callId, name, input }` / `{ runId, callId, result }`
- `subagent.end` — `{ runId, text }`

`runId` is generated per `runSubagent` invocation so concurrent subagents stay
distinguishable. `{ text }` remains the return value; this is additive.

### 4. devx wiring

`plugins/devx/agent/agent.ts` implements the four hooks against the **existing**
`plugins/devx/functions/skills/hooks.ts` — `loadHooks`, `runPreToolHooks`,
`runPostToolHooks`, `runStopHooks` — using `ctx.sql` and `ctx.userId`. No second
hook engine.

Hook rows load **once per turn** and memoize on the hook context, matching
legacy's single load at `functions/agent.ts:235`, not once per tool call.

`ctx.userId` is the trusted identity (never `ctx.metadata`, which is
client-supplied — see `agent/lib/context.ts`'s header). An anonymous session
loads only `is_builtin = true AND user_id IS NULL` rows, matching `loadHooks`'
existing query shape.

### 5. Prompt equivalence

In `agent/agent.ts`'s `buildInstructions`:

- **Mode** — replace hardcoded `mode: "agent"` with the *same* `readMode(ctx.metadata)`
  helper `filterTools` already uses at `:210`. Sharing one helper makes it
  structurally impossible for the prompt and the tool set to disagree about mode.
  `readMode` returns `undefined` for unset/unknown; `buildInstructions` maps that
  to `"agent"`, preserving today's behaviour for callers that send no mode.
- **`skillContext`** — resolve the activated skill and pass it through, restoring
  the `functions/prompts.ts:1084` injection.
- **Skills listing** — `buildCoderContext` gains a skills-list parameter and
  renders the section itself, so `SKILL_USAGE_RULE`'s "the skills above"
  resolves on **both** paths.

  Three sources were considered. Parsing `base` for core's `## Skills` heading
  (`core/…/toolset.ts:72`) is rejected — that heading is core's formatting
  detail, not a contract, and it is unavailable to legacy, which has no `base`.
  Adding `skills` to `HookCtx` is rejected for the same second reason: legacy
  has no `HookCtx` at all, so it would need a second implementation.

  Instead both paths read the `devx.skills` table through the existing
  `loadSkillMetadata(userId, sqlFn)` at `functions/skills/resolver.ts:80`,
  which already returns `{ name, description, ... }` per enabled skill and is
  reachable from eve via `ctx.sql` and from legacy via its `sqlFn`. One
  implementation, one source, both paths — and no core surface added for this
  gap. `<context>` metadata and the
  raw `instructions.md` spine remain intentionally superseded by
  `buildCoderContext`, as documented at `agent/agent.ts:260-284`.
- **Legacy parity** — teach `buildCoderContext` to accept the same skills list and
  emit the same section, so both paths carry it.

The existing `functions/prompt_divergence.test.ts` already guards all four
dispatch paths against re-introducing per-path assembly; it keeps passing
unchanged, since every change here flows through `buildCoderContext`.

`remoteChannel: false` and `settings.max_steps: undefined` stay hardcoded — both
are documented, correct decisions for this loop (`agent/agent.ts:296-301`), not
gaps.

### 6. Attachments

`agent/agent.ts` implements `buildUserMessage` by calling the existing
`materializeAttachments` / `renderAttachmentBlock` from
`plugins/devx/functions/attachments.ts`, resolving the workspace the same way
`buildInstructions` does (`ensureAppWorkspace(userId, appId)`), so files land
where the coder actually runs. Attachment URLs stay remote input: the existing
cap of 10 and the filter at `functions/index.ts:405-408` are reused, not
reimplemented. Only paths enter the prompt, never content.

### 7. Routing: which engine each provider gets

The cutover does **not** move everyone to eve, and no new routing code is
needed — `src/hooks/useEffectiveLoop.ts` already implements the intended split:

```ts
const wantsAgents = settings?.loop === "agents";
const providerForcesLegacy = active.provider === "claude-code";
// effective = wantsAgents && !providerForcesLegacy ? "agents" : "legacy"
```

So after V17:

| Provider | Loop | Engine |
|----------|------|--------|
| anthropic / openai / google / bedrock (any auth shape) | `agents` | eve (`core/…/runner.ts`) |
| **claude-code** | `legacy` (forced) | **OAuth sidecar** (`fn-claude-code/server.js`) |

IAM-shaped bedrock credentials (accessKeyId/secretAccessKey rather than a
bearer token) are **not a supported configuration** — the owner decided not
to implement SigV4 auth on the agents loop. Such a user still routes to
`agents` like any other bedrock user; `agent/agent.ts`'s `resolveModel` throws
a clear, actionable error telling them to switch to a bearer token. This is
the single enforcement point for that decision, not a backstop behind a
client-side gate.

`agent/agent.ts`'s `resolveModel` also throws for the claude-code case as a
server-side backstop, so a stale client that bypasses the claude-code gate
fails loudly rather than running against a sidecar-shaped `ModelSpec`.

**eve cannot host the sidecar, and this design does not attempt it.** eve's
`ModelSpec` is a model+credentials seam (`provider ∈ {anthropic, openai,
google, bedrock}`, `apiKey`, `baseURL`) and `runner.ts` drives its own
`streamText` loop with its own tool set. The sidecar is the Claude Agent SDK
running its *own* agentic loop — own tools, own skills from `~/.claude/skills`,
`permissionMode: "bypassPermissions"`, own `kb`/`ask` MCP servers. Hosting it
would mean delegating an entire turn to an external engine: a new execution
backend in core, not a provider adapter. Out of scope.

**Consequence: the legacy loop is not being retired.** It is the permanent home
for sidecar (claude-code) users. Prompt equivalence (§5) is therefore an
ongoing invariant, not a transitional concern — which is why the skills listing
and mode handling are fixed in the shared `buildCoderContext` rather than only
on the eve side.

### 8. Migration

`plugins/devx/migrations/V17__loop_default_agents.sql` — a forward migration.
`V11` is never edited: the checksum verifier hard-fails existing deployments.

```sql
ALTER TABLE devx.settings ALTER COLUMN loop SET DEFAULT 'agents';
UPDATE devx.settings SET loop = 'agents' WHERE loop = 'legacy';
```

The `CHECK (loop IN ('legacy', 'agents'))` constraint is retained, so an operator
or user can move a row back to `'legacy'` without a schema change. Rolling the
default back is a one-line V18.

Every existing row moves. The column is `NOT NULL DEFAULT 'legacy'`, so nothing
distinguishes a deliberate opt-out from an untouched default; this was decided
explicitly rather than inferred.

Setting a claude-code user's row to `'agents'` is harmless and deliberate:
§7's gate resolves them to `legacy` regardless, so they keep the sidecar.
Storing `'agents'` uniformly means that if such a user later switches to an
API-key provider, they land on eve without a second migration. A bedrock user
with IAM-shaped credentials is NOT covered by this gate — they land on
`agents` and must switch to a bearer token, per §7.

## Testing

**Core** (`core/server/agents/service/`)

- `hooks.test.ts` — `onToolCall` receives name+input and can rewrite input; a
  `{allow:false}` result blocks execute and surfaces `reason`; a throwing hook
  denies the call and does not fail the turn; `onToolResult` rewrites the result;
  **ordering: approval gate runs before `onToolCall`**, asserted directly, since
  the reverse is a consent bypass.
- `runner.test.ts` — `onTurnEnd` sees final text and finishReason; a throwing
  `onTurnEnd` does not fail the turn; `buildUserMessage` rewrites the user
  message and leaves `system` byte-identical (guards the prompt-cache property).
- `toolset` — `runSubagent` emits start/tool/end with a stable `runId`; the
  return value is unchanged; concurrent subagents do not interleave `runId`s.

**devx** (`plugins/devx/`)

- New `agent/lib/prompt_parity.test.ts` — for each mode in
  `{ask, plan, build, agent}`, the prompt `buildInstructions` produces matches
  what legacy `constructSystemPrompt` produces for the same mode; every
  `agent.skills` name appears in the final prompt; an activated `skillContext`
  body appears.
- `agent/lib/hooks.test.ts` — a `devx.hooks` row blocks a tool on the eve path;
  Stop hooks fire once per turn; rows load once per turn, not per call.
- `agent/lib/attachments.test.ts` — attachments materialize into the resolved
  workspace and only paths reach the prompt.
- `src/hooks/useEffectiveLoop` — with `settings.loop === 'agents'` (the post-V17
  state), a `claude-code` provider still resolves to `legacy`. This is
  existing behaviour; the test pins it so the cutover cannot silently route
  sidecar users at eve. A bedrock row with `auth_shape === 'iam'` resolves to
  `agents` like any other bedrock user — that configuration is unsupported and
  fails loudly at `agent.ts`'s `resolveModel`, not at this routing layer.
- Existing `parity.test.ts`, `prompt_divergence.test.ts`, `parity_smoke.test.ts`
  keep passing unchanged.

## Sequencing

Six commits, each independently reviewable and green:

1. Core: `onToolCall`/`onToolResult` + tests + COMPAT.md
2. Core: `onTurnEnd` + `buildUserMessage` + tests + COMPAT.md
3. Core: `runSubagent` streaming + tests
4. devx: prompt equivalence (gaps 1-3) + `prompt_parity.test.ts`
5. devx: hook + attachment wiring (gaps 4-5) + tests
6. `V17__loop_default_agents.sql`

The migration is **last**. Until it lands, every change is inert for existing
users, so any commit in 1-5 can ship alone if the cutover slips.

## Risks

| Risk | Mitigation |
|------|------------|
| Cutover exposes an unlisted eve gap | Commits 1-5 are inert until 6; V18 rolls the default back in one line |
| Fail-closed tool hooks break someone's fail-open hook | Behaviour change stated in the PR; the `CHECK` constraint lets an affected user return to `'legacy'` |
| Prompt equivalence test freezes legacy defects into eve | The test asserts *equivalence*, so a legacy defect fixed later must be fixed in both — which is the intent |
| Core hook surface grows for one consumer | All four are additive and ignored by real eve; each is a seam any future agent plugin needs, not devx-specific |
| Legacy loop is assumed dead and left to rot | It is not being retired (§7) — sidecar (claude-code) users live there permanently. Prompt work lands in the shared `buildCoderContext`, and `prompt_divergence.test.ts` keeps guarding all four dispatch paths |

## Repository constraint

`CLAUDE.md`: never `git push`, never open pull requests. This work lands as
local commits on `p-hoffmann/codex-compare`; pushing and PR creation are the
user's.
