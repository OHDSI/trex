# Design: `skills` plugin type

Date: 2026-07-19
Status: approved (brainstorm with p-hoffmann)
Branch: p-hoffmann/skills-plugin-type

## Goal

A new plugin type that ships packs of agent skills (markdown + supporting files,
optionally MCP connections) and injects them into agents declared by *other*
plugins. Direction of attachment is inverted relative to memory links: the
**skill pack declares its target agents**, and packs can be deployed after the
target agent is already installed and running.

Complements the existing `agents` and `memory` plugin types.

## Background (what exists today)

- Skills are already a first-class runtime concept. `core/server/agents/loader.ts`
  discovers `skills/<name>.md` and `skills/<name>/SKILL.md` in the agent dir
  (loader.ts:228-277). `core/server/agents/service/toolset.ts` lists them in the
  system prompt (buildSystemPrompt, toolset.ts:69-77) and serves content
  on demand via the built-in `skill` tool (toolset.ts:162-180).
- Connections are a first-class concept with an MCP-client kind:
  `connections/*.ts` files branded `__trexConnection`
  (loader.ts:206-223, connections/types.ts, connections/shim.ts
  `defineMcpClientConnection`). Remote MCP tools surface into the toolset as
  `<conn>__<tool>` (connections/provider.ts:119-186).
- Plugin types are keys in the `trex` block of `package.json`, dispatched in a
  switch in `core/server/plugin/plugin.ts` (addPlugin, L139-189, orderRank
  L125-135). Install/uninstall surfaces (GraphQL, MCP, HTTP) are type-agnostic.
- The memory pattern is the template: `collectDeclaredMemoryNames` pre-pass
  (plugin.ts:49-74) makes cross-plugin scan order irrelevant;
  `agent-memory.ts` generates skill+tool files into the staged agent dir at
  `buildAgentWorkerConfig` time with a throw-on-collision guard
  (agent-memory.ts:231-268).
- Agent workers are staged into per-agent `trex-agents-*` temp dirs
  (plugin/agents.ts:97-269, `Deno.makeTempDir` at L138) and mounted via
  `_addFunction`. **There is no re-stage, unmount, or uninstall path in core
  today.** The #161/#162 hot-reload machinery (plugin/function.ts:236-359) is
  gated to `DEVX_WORKSPACE_DIR` paths and does not apply to agent workers.
- The worker pool keys workers by `servicePath` (agents.ts:205-214). Sessions,
  turns, steps, approvals are DB-backed (`agents` schema migrations V1-V5).

## Design

### 1. Manifest & pack layout

A skills plugin declares named packs under a new `trex.skills` key:

```json
{
  "name": "@trex/ohdsi-skills",
  "trex": {
    "skills": [
      { "name": "ohdsi-cohorts", "dir": "pack", "agents": ["claw", "coder"] },
      { "name": "house-style",   "dir": "style", "agents": ["*"] }
    ]
  }
}
```

Pack dir layout — only the directory form of skills, so supporting files travel
with the skill:

```
pack/
  skills/
    cohort-building/
      SKILL.md            # frontmatter `description:` + body
      references/*.md     # supporting files, referenced by relative path
  connections/
    atlas.ts              # optional: defineMcpClientConnection(...)
```

Targeting: `agents` is a list of exact agent names, or `"*"` for every agent on
the deployment. A target that does not exist is not an error — the pack
attaches if/when that agent appears.

### 2. Registration & validation

- New `case "skills":` in the `addPlugin` switch (plugin.ts:139-189). Two
  modules, split to avoid an import cycle: `core/server/plugin/skill-packs.ts`
  (pack model, registry, staging — imported by `agents.ts`) and
  `core/server/plugin/skills.ts` (dispatch orchestration — imports
  `agents.ts`). orderRank 4, BEFORE `agents`: at boot the pre-pass makes
  ordering irrelevant, but a dynamically registered plugin declaring both its
  own packs and its own agents then registers packs first and stages each
  agent exactly once.
- Trusted-scope gate: same `isTrustedPluginScope` check as agents/memory
  (`@trex`/`@ohdsi` scopes only) — packs inject prompt content and MCP
  connections into other plugins' agents.
- Boot pre-pass `collectDeclaredSkillPacks()` alongside
  `collectDeclaredMemoryNames` (plugin.ts:49-74, called from initPlugins before
  dispatch): scans every plugin's `trex.skills` across dev+prod plugin paths,
  producing `DECLARED_SKILL_PACKS: Map<packName, { srcDir, agents: string[] }>`.
  Makes scan order irrelevant at boot, exactly like memory.
- Validation at normalize time:
  - pack names unique across all plugins (throw on duplicate),
  - pack dir exists and contains at least one `skills/*/SKILL.md`,
  - each `SKILL.md` parses a frontmatter `description:`,
  - connection files carry the `__trexConnection` brand.

### 3. Staging & injection

`buildAgentWorkerConfig` gains one step, next to the existing
`generateMemoryArtifacts` call (plugin/agents.ts:162-164): for each declared
pack targeting this agent (by name or `*`), copy into the staged agent dir:

- `pack/skills/<skill>/` → `stagedAgentDir/skills/<pack>--<skill>/`
  — existing `skills/<name>/SKILL.md` discovery picks it up with zero loader
  changes; the `<pack>--` prefix namespaces against hand-authored skills and
  other packs.
- `pack/connections/<c>.ts` → `stagedAgentDir/connections/<pack>--<c>.ts`
  — existing connections discovery realizes MCP tools as `<pack>--<c>__<tool>`.

Collision guard mirrors agent-memory.ts:244-261: if a target path already
exists, **throw** — refuse to overwrite hand-authored content.

Prompt/tool surface comes for free: `buildSystemPrompt` lists the injected
skills, the built-in `skill` tool serves `SKILL.md`, supporting files are
readable from the staged dir by relative path.

### 4. Live attach — re-stage and swap (the new mechanism)

Installing a skills plugin after agents are running must not mutate live staged
dirs. Instead:

- `addAgentsPlugin` keeps a per-agent record `{ entry, pluginDir, mountRef }`
  in a module-level registry. The mounted request handler resolves
  `servicePath` through `mountRef` at call time instead of a captured constant.
- When a skills plugin registers post-boot (via `registerFromPath`), the skills
  handler computes affected agents (targeted ∩ registered), calls
  `buildAgentWorkerConfig` again for each — producing a **fresh**
  `trex-agents-*` dir with the new pack staged — and swaps
  `mountRef.servicePath`.
- The worker pool keys by `servicePath`, so the next request lazily creates a
  worker from the new dir. No restart API, no interaction with
  `DEVX_HOT_RELOAD`; #162-style races do not apply because the swap is a single
  reference assignment. The old temp dir is deleted after a grace period (first
  cleanup this code path has ever had); the old worker idles out per pool
  policy.
- Sessions/turns/approvals are DB-backed, so a swap loses nothing
  mid-conversation.

### 5. Detach / uninstall semantics

Detach is the same operation run backwards: recompute the pack set for an agent
minus the removed plugin, re-stage, swap. The mechanism supports it, but core
has no dynamic *unregister* path today (uninstall only removes the package;
nothing calls back into the registry), so in v1 detach takes effect at next
boot — the pack is simply no longer present and is not staged. When a dynamic
unregister path lands, runtime detach falls out of the same re-stage-and-swap
primitive. The `trex_plugin_install`/uninstall SQL surface stays untouched.

### 6. Error handling & edge cases

- Pack targets no registered agent → registers quietly and waits; log at info
  level so it is diagnosable.
- Re-stage failure (collision, bad pack) → the swap never happens; the running
  agent keeps its current dir. No partial state: `addSkillsPlugin` validates
  every pack before registering any. ACCEPTED DEVIATION (final review): the
  dynamic install surface (`registerFromPath` → `addPlugin`) logs registration
  errors rather than returning them — a pre-existing core convention shared by
  every plugin type, not changed by this feature; operators find the error in
  server logs.
- Two packs shipping a same-named skill cannot collide (pack prefix). A pack
  colliding with a hand-authored file throws at stage time; at boot that skips
  just the affected agent (per-entry isolation in `addAgentsPlugin`), and the
  pre-pass skips packs that fail dir validation so a malformed pack cannot
  block targeted agents from registering.
- `"*"` packs apply to agents from any trusted plugin, including ones installed
  later — stated explicitly in docs since it changes other plugins' prompt
  surface.

### 7. Observability

- `/eve/v1/info` already lists skills (service/handler.ts:298-304); add a
  `pack` provenance field per skill entry so injected vs. hand-authored is
  visible.
- No GraphQL/MCP admin surface in v1 (install/uninstall is already generic;
  YAGNI). If Pythia/dashboard later needs a queryable skill inventory, it
  layers on top of `/eve/v1/info`.

### 8. Scope cuts (deliberate)

- No DB persistence of attachments — the file-staged dir remains the single
  source of truth; attachment state is always derivable from the plugin
  registry.
- No flat-file (`skills/<name>.md`) pack form — directory form only, one shape
  to validate.
- No per-agent opt-out of `"*"` packs in v1.

## Testing

- Unit: normalize/targeting/dedupe (`skills.ts`), duplicate pack names,
  untrusted scope rejection, `"*"` expansion.
- Staging: prefixing, collision throw, connections copy — against the toy agent
  (`core/server/agents/testdata/toy-agent`).
- Integration: register agent → serve request → register skills plugin →
  assert new skill appears in `/eve/v1/info` and the worker serves from the new
  staged dir; detach path symmetrically. Deno tests need `DATABASE_URL` set
  (known gotcha).

## Key files to touch

| File | Change |
| --- | --- |
| `core/server/plugin/plugin.ts` | `case "skills"`, orderRank 4 (before agents), pre-pass call |
| `core/server/plugin/skill-packs.ts` | new: pack model, declaration registry, validation, staging |
| `core/server/plugin/skills.ts` | new: dispatch orchestration, dynamic re-stage of mounted agents |
| `core/server/plugin/function.ts` | `LiveWorkerConfig` indirection in `_addFunction` (both call sites) |
| `core/server/plugin/agents.ts` | stage matching packs in `buildAgentWorkerConfig`; per-agent mount registry + `mountRef` indirection |
| `core/server/agents/service/handler.ts` | `pack` provenance in `/eve/v1/info` |
| `core/server/agents/README.md` | authoring/operating docs for skill packs |
| `plugins/` example | `skills-example` pack + wiring against toy/claw agent |
