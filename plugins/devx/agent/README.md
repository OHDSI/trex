# devx-agent

The eve/agents-runtime port of devx's chat loop, built across V1-V3 of the devx→agents
migration (`task-v1-brief.md` through `task-v3-brief.md`). It lives entirely under this
directory (`plugins/devx/agent/`) as a standard [eve-layout agent](../../../core/server/agents/README.md):
`instructions.md`, `agent.ts` (the `resolveModel`/`filterTools`/`buildInstructions` hooks),
`tools/*.ts` (thin `wrap()`s over the ~63 pre-existing `functions/tools/*.ts` implementations —
never copied, imported), `dynamic-tools.ts` (per-user MCP tools), and `subagents/{code-reviewer,
code-explorer}/`.

It is registered in `plugins/devx/package.json`'s `trex.agents` as `devx-agent`, so trex's core
`agents` plugin type runs it as its own edge-runtime worker, mounted at
`/plugins/trex/devx-agent/...`.

## Coexistence flag (Phase 2 / V4)

`devx.settings.loop` (migration `V11__loop_flag.sql`) is a per-user `'legacy' | 'agents'` flag,
`NOT NULL DEFAULT 'legacy'`. It exists so the two loops can run side by side while this port is
verified, but **nothing reads it yet** — Phase 3 is what wires the devx chat UI to check the flag
and route a user's turns to this runtime instead of the legacy one. Until then:

- The legacy chat route (`plugins/devx/functions/index.ts`'s chat handler, `functions/agent.ts`'s
  `streamAgentChat`) is **completely untouched** by this runtime — every user, flag value
  notwithstanding, keeps hitting the legacy AI-SDK loop through the existing devx UI.
- This runtime is exercised **directly**, bypassing the UI entirely, at the routes below.

## Exercising the agent directly

Mounted path: `/plugins/trex/devx-agent/` (see `core/server/plugin/agents.ts`:
`<PLUGINS_BASE_PATH>/<plugin-scope>/<agent-name>/...`).

- `POST /plugins/trex/devx-agent/chat` — stateless UIMessage chat (the same shape a `useChat`
  frontend sends): `{ messages: UIMessage[], metadata?: { mode?: "ask"|"plan"|"build", chatId?:
  string, appId?: string } }`. History comes from the client; a session is persisted for
  observability only. `x-user-id` (injected by the control-server proxy for `@trex/...`-scoped
  plugins) becomes `ToolContext.userId` — never trust `metadata` for identity.
- `POST /plugins/trex/devx-agent/eve/v1/session` — eve session API: create a session, optionally
  start a turn with an initial `message`.
- `POST /plugins/trex/devx-agent/eve/v1/session/:id` — follow-up turn (`message`) and/or HITL
  answers (`inputResponses: [{requestId, optionId: "approve"|"deny"|"always"|"never"}]`).
- `POST /plugins/trex/devx-agent/eve/v1/session/:id/approval` — resolve one approval directly
  (`{requestId, decision}`), an additive convenience route alongside `inputResponses`.
- `GET /plugins/trex/devx-agent/eve/v1/session/:id/stream` — ndjson event stream (`?startIndex=`
  to resume, `?replayOnly=1` to skip the live tail).
- `GET /plugins/trex/devx-agent/eve/v1/health`, `/eve/v1/info` — eve-documented health/introspection
  routes; `/healthz` is a pre-eve alias kept for back-compat.

See `core/server/agents/README.md` and `COMPAT.md` for the full HTTP surface and where it
deliberately diverges from real eve.

## Running the tests

devx suite (fakes only, no live model, no Postgres, no docker):

```
LD_LIBRARY_PATH=/usr/local/lib deno test --allow-all --no-config \
  --import-map=plugins/devx/agent/local-test-import-map.json plugins/devx/agent/lib/
```

Core agents-runtime suite (loader, hooks, toolset, handler, store):

```
cd core/server && LD_LIBRARY_PATH=/usr/local/lib LIBRARY_PATH=/usr/local/lib deno task test
```

## Parity status

Phase 2's job was proving the ported runtime behaves the same as the legacy loop it will
eventually replace. `lib/parity.test.ts` (V2b) covers the tool-NAME-set equation
(`TOOL_DEFINITIONS` names == ported tool names ∪ documented exclusions). `lib/parity_smoke.test.ts`
(V4) adds four narrower checks, using fakes (a real `loadAgent`, fake `sql`/`ToolContext`, no
model, no DB, no docker):

| # | Check | How | Status |
|---|-------|-----|--------|
| a | Mode/tool-availability parity (ask/plan/build/none) | Legacy `buildToolSet(mode, {}, null)` vs. a hand-mirrored replica of `toolset.ts`'s `buildSdkTools` assembly (static tools + dynamic-tools.ts + built-in `skill`/`agent`, filtered through the real `filterTools` hook) | Scripted, passing. One documented divergence: legacy's `Agent` tool is `modifiesState:true` and is dropped in ask mode, but eve's built-in `agent` tool carries no such flag and survives ask-mode filtering — asserted explicitly, not swept under the rug. |
| b | `needsApproval` parity | Every ported tool's `needsApproval` vs. its legacy `defaultConsent === "ask"` | Scripted, passing (all ported tools). |
| c | Workspace path parity | `toDevxCtx`'s `ensureWorkspace`/`ensureAppWorkspace` calls vs. the same functions called directly, confirming the adapter feeds them `userId` from `ToolContext.userId` (never metadata) and `appId` from metadata | Scripted, passing. Trivially guaranteed by shared code (`functions/tools/workspace.ts` is imported, not copied) — the test asserts the *wiring*, not the path-building logic. |
| d | Instructions parity | `buildInstructions` vs. legacy `constructSystemPrompt`/`constructLocalAgentPrompt` for the agent-mode flow: same static `<block>` tags in the same order, same effective AI-rules winner (project rules > user `ai_rules` > `DEFAULT_AI_RULES`) across 4 scenarios | Scripted (structural, not byte-equal — the ported rules section is appended at the end since `instructions.md` has no `[[AI_RULES]]` placeholder to substitute mid-prompt; legacy's placeholder happens to be its last section too, so this is a documented position-only divergence, not a behavior gap). Passing. |

Deferred to manual/live verification (not reproducible with fakes — see `task-v4-brief.md`):

- [ ] A `needsApproval` tool's actual approval round-trip through `POST .../eve/v1/session/:id`
      and `.../approval` (create → pending `input.requested` → `approve`/`deny`/`always`/`never` →
      tool executes or is denied accordingly).
- [ ] An MCP tool (from a real `devx.mcp_servers` row) appears in `/eve/v1/info`'s tool list and
      executes successfully via `mcpManager`.
- [ ] A subagent run (`code-reviewer` or `code-explorer`, via the built-in `agent` tool) completes
      and returns text.
- [ ] A real model turn (any provider) produces a coherent response and streams correctly end to
      end through `/chat` and the `eve/v1/session/:id/stream` ndjson feed.
