// Parity smoke suite (task-v4-brief.md): scripted parity checks between the
// legacy AI-SDK loop (plugins/devx/functions/) and the ported eve/agents
// runtime (plugins/devx/agent/), using fakes only — NO live model, NO
// Postgres, NO docker. Complements lib/parity.test.ts (V2b's tool-NAME-set
// parity, which this file imports and reuses the EXCLUDED rationale from)
// with four narrower checks from task-v4-brief.md's Phase 2 parity
// checklist:
//   a) mode/tool-availability parity
//   b) needsApproval parity
//   c) workspace path parity
//   d) instructions (system prompt) structural parity
//
// Deferred to a manual/live checklist — none of these are reproducible with
// fakes:
//   - a needsApproval tool's actual approval round-trip (approval routes)
//   - an MCP tool appearing AND executing against a real MCP server
//   - a subagent run completing
//   - a real model turn
//
// Circular-import note (same as tools/ToolSearch.ts's header comment):
// registry.ts and tool_search.ts import each other; importing registry.ts
// FIRST here (for its module-evaluation side effect only) reproduces the
// production evaluation order and avoids a TDZ ReferenceError on
// TOOL_DEFINITIONS's array literal.
import "../../functions/tools/registry.ts";

import { assert, assertEquals } from "jsr:@std/assert";
import { loadAgent } from "../../../../core/server/agents/loader.ts";
import type { HookCtx, ToolContext, ToolDef } from "../../../../core/server/agents/eve-shim/types.ts";
import { buildToolSet, TOOL_DEFINITIONS } from "../../functions/tools/registry.ts";
import {
  ensureAppWorkspace,
  ensureWorkspace,
  getAppWorkspacePath,
  getWorkspacePath,
  readProjectRules,
} from "../../functions/tools/workspace.ts";
import { toDevxCtx } from "./context.ts";
import { constructLocalAgentPrompt, DEFAULT_AI_RULES } from "../../functions/prompts.ts";
import agentConfig from "../agent.ts";
import { loadSessionScope } from "./session_scope.ts";

const AGENT_DIR = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// Redirect workspace.ts's DEFAULT_WORKSPACE_DIR to a scratch dir, same
// precedent as context.test.ts / build_instructions.test.ts.
const SCRATCH = await Deno.makeTempDir({ prefix: "devx-agent-parity-smoke-test-" });
Deno.env.set("DEVX_WORKSPACE_DIR", SCRATCH);

// Load once — every test below reads the agent's static tools/instructions,
// none of which mutate as a result of being read.
const agent = await loadAgent(AGENT_DIR);
const buildInstructions = agentConfig.buildInstructions!;
const filterTools = agentConfig.filterTools!;

// filterTools reads the session's V14 scope from the snapshot buildInstructions
// primes; calling the hook directly means priming it here. Nothing declared.
await loadSessionScope("s-1", () => Promise.resolve({ rows: [] }));

function fakeHookCtx(overrides: Partial<HookCtx> = {}): HookCtx {
  return {
    sessionId: "s-1",
    env: () => undefined,
    sql: () => Promise.resolve({ rows: [] }),
    ...overrides,
  };
}

// ===========================================================================
// (a) Mode / tool-availability parity
// ===========================================================================
//
// Mirrors core/server/agents/service/toolset.ts's buildSdkTools name
// assembly (steps 1-4, toolset.ts:267-334: static tools/*.ts, merge in
// dynamic-tools.ts's provider output, add the built-in skill/agent tools,
// then run filterTools over the FULL merged set) WITHOUT importing
// toolset.ts itself — that module (and its model.ts import) pull in "ai" /
// "@ai-sdk/*", which devx's local-test-import-map.json deliberately does
// NOT map (confirmed: importing toolset.ts from this suite fails
// TS2307 "Import 'ai' not a dependency and not in import map" under the
// devx `--no-config --import-map=...` test invocation — this whole suite's
// point is running with fakes only, no model deps). Any future edit to
// toolset.ts's assembly order/logic should be mirrored here too.
const BUILTIN_SKILL_DEF: ToolDef = { description: "", inputSchema: { type: "object" } };
const BUILTIN_AGENT_DEF: ToolDef = { description: "", inputSchema: { type: "object" } };

async function agentSideNames(mode: "ask" | "plan" | "build" | undefined): Promise<Set<string>> {
  const hookCtx = fakeHookCtx({ metadata: mode ? { mode } : undefined, userId: "u-parity-tools" });

  // Step 1+2: static + dynamic (MCP) tool defs. The fake sql returns no
  // devx.mcp_servers rows, so dynamic-tools.ts's provider returns {}
  // (dynamic-tools.ts:51) — the "no MCP servers configured" baseline this
  // smoke suite assumes; live MCP tool appearance is on the deferred/manual
  // checklist above.
  const defs: Record<string, ToolDef> = { ...agent.tools };
  if (agent.toolProvider) {
    const dynamic = await agent.toolProvider(hookCtx);
    for (const [name, def] of Object.entries(dynamic)) {
      if (!Object.hasOwn(defs, name)) defs[name] = def;
    }
  }

  // Step 3: built-ins, top-level only, unless an authored tool already
  // claims the name (it doesn't here — no tools/skill.ts or tools/agent.ts).
  if (agent.skills.length > 0 && !defs.skill) defs.skill = BUILTIN_SKILL_DEF;
  if (!defs.agent) defs.agent = BUILTIN_AGENT_DEF;

  // Step 4: filterTools over the full merged set.
  const names = new Set<string>();
  for (const [name, def] of Object.entries(defs)) {
    if (filterTools(name, def, hookCtx)) names.add(name);
  }
  return names;
}

function legacySideNames(mode: string): Set<string> {
  return new Set(Object.keys(buildToolSet(mode, {}, null)));
}

// Documented exclusion/mapping table (mode/tool-availability parity). Also
// see this dir's parity.test.ts (V2b) for the full tool-by-tool rationale —
// these three names are the same ones excluded there:
//  - "CompactContext": legacy-loop-internal, no eve-side equivalent at all
//    (not even a built-in) — dropped from the legacy side; there is nothing
//    on the agent side to compare it against.
//  - "Skill" / "Agent": legacy's bespoke tools of those names are superseded
//    by eve's built-in `skill` / `agent` tools (different names, different
//    semantics — not a rename). Dropped from the legacy side, and the
//    built-ins `skill` / `agent` dropped from the agent side, so the
//    name-set comparison never has to reconcile them directly. Their
//    presence/absence per mode is asserted separately below instead.
const DROP_FROM_LEGACY = new Set(["CompactContext", "Skill", "Agent"]);
const DROP_FROM_AGENT = new Set(["skill", "agent"]);

function withoutExcluded(names: Set<string>, drop: Set<string>): string[] {
  return [...names].filter((n) => !drop.has(n)).sort();
}

// legacy mode name -> ported metadata.mode (undefined = "no mode set", the
// eve-side counterpart of legacy's "agent" chat mode — functions/index.ts's
// VALID_MODES includes "agent" alongside ask/plan/build; agent.ts's own
// readMode() comment documents why "no mode" must mean "allow everything").
const MODES: Array<{ legacy: string; ported: "ask" | "plan" | "build" | undefined; label: string }> = [
  { legacy: "ask", ported: "ask", label: "ask" },
  { legacy: "plan", ported: "plan", label: "plan" },
  { legacy: "build", ported: "build", label: "build" },
  { legacy: "agent", ported: undefined, label: "none (legacy 'agent' mode / no client metadata.mode)" },
];

for (const { legacy, ported, label } of MODES) {
  Deno.test(`parity smoke (a): tool availability matches in ${label} mode, modulo the Skill/Agent/CompactContext table`, async () => {
    const legacyNames = withoutExcluded(legacySideNames(legacy), DROP_FROM_LEGACY);
    const agentNames = withoutExcluded(await agentSideNames(ported), DROP_FROM_AGENT);
    assertEquals(agentNames, legacyNames);
  });
}

Deno.test("parity smoke (a): built-in skill/agent tools appear agent-side outside build/plan/ask mode", async () => {
  // ask mode: "agent" is now explicitly name-excluded by filterTools (see
  // agent.ts's ride-along fix below) to close the asymmetry the old
  // "documented divergence" test used to pin down — see the parity test
  // right after this one. "skill" has no legacy modifiesState counterpart,
  // so it still survives ask mode.
  assert(!(await agentSideNames("ask")).has("agent"), "ask mode now drops the built-in agent tool (legacy parity fix)");
  assert((await agentSideNames("ask")).has("skill"), "ask mode should keep the built-in skill tool");
  assert((await agentSideNames(undefined)).has("agent"), "no-mode should keep the built-in agent tool");
  assert((await agentSideNames(undefined)).has("skill"), "no-mode should keep the built-in skill tool");
  assert(!(await agentSideNames("plan")).has("agent"), "plan mode's PLAN_MODE_TOOLS allowlist excludes agent");
  assert(!(await agentSideNames("plan")).has("skill"), "plan mode's PLAN_MODE_TOOLS allowlist excludes skill");
  assert(!(await agentSideNames("build")).has("agent"), "build mode drops everything, built-ins included");
  assert(!(await agentSideNames("build")).has("skill"), "build mode drops everything, built-ins included");
});

Deno.test("parity smoke (a): ask-mode 'Agent'/'agent' asymmetry closed — both sides drop it (task-u1 ride-along)", () => {
  // Previously documented as a divergence (V4 report): registry.ts's
  // buildToolSet drops any modifiesState tool in ask mode, and the legacy
  // Agent tool is modifiesState:true (functions/tools/spawn_agent.ts:33),
  // while the eve built-in `agent` tool carries no modifiesState field (it's
  // a generic agent-framework built-in, not a devx-authored ToolDef) and
  // used to survive ask-mode filtering. agent.ts's filterTools now
  // name-excludes "agent" in ask mode explicitly, closing the gap — this
  // test pins down that BOTH sides drop their respective tool in ask mode.
  const legacyAsk = legacySideNames("ask");
  assert(!legacyAsk.has("Agent"), "legacy Agent tool should be dropped by ask-mode's modifiesState filter");
});

// ===========================================================================
// (b) needsApproval parity
// ===========================================================================

Deno.test("parity smoke (b): every ported tool's needsApproval matches legacy defaultConsent === 'ask'", () => {
  const legacyByName = new Map(TOOL_DEFINITIONS.map((t) => [t.name, t]));
  let checked = 0;
  for (const [name, def] of Object.entries(agent.tools)) {
    const legacy = legacyByName.get(name);
    assert(legacy, `ported tool "${name}" has no legacy TOOL_DEFINITIONS counterpart by name`);
    assertEquals(
      (def as ToolDef).needsApproval ?? false,
      legacy!.defaultConsent === "ask",
      `${name}: needsApproval=${(def as ToolDef).needsApproval} but legacy defaultConsent=${legacy!.defaultConsent}`,
    );
    checked++;
  }
  assert(checked > 0, "sanity: at least one ported tool should have been checked");
});

// ===========================================================================
// (c) Workspace path parity
// ===========================================================================
//
// ensureWorkspace/ensureAppWorkspace (functions/tools/workspace.ts) are the
// SAME imported functions on both sides — lib/context.ts's header comment
// documents this is a relative import, not a copy. So "parity" here means:
// the adapter (toDevxCtx) must pass the same inputs the legacy loop passes
// — userId from the request's authenticated identity (ToolContext.userId),
// appId from the (untrusted) client metadata — not that the path-building
// logic itself might diverge (it can't; it's one function).

Deno.test("parity smoke (c): toDevxCtx.workspacePath === ensureAppWorkspace(userId, appId) when metadata carries an appId", async () => {
  const userId = "parity-user-1";
  const appId = "parity-app-1";
  const evectx: ToolContext & { sql: NonNullable<ToolContext["sql"]> } = {
    sessionId: "s-1",
    userId,
    // deno-lint-ignore no-explicit-any
    metadata: { chatId: "c-1", appId, appId2: "not-real" } as any,
    sql: () => Promise.resolve({ rows: [{ ok: true }] }), // c-1 owned by userId
  };
  const devxCtx = await toDevxCtx(evectx);
  assertEquals(devxCtx.workspacePath, await ensureAppWorkspace(userId, appId));
  assertEquals(devxCtx.workspacePath, getAppWorkspacePath(userId, appId));
  assertEquals(devxCtx.workspacePath, `${SCRATCH}/${userId}/${appId}`);
});

Deno.test("parity smoke (c): toDevxCtx.workspacePath === ensureWorkspace(userId) when metadata carries no appId", async () => {
  const userId = "parity-user-2";
  const evectx: ToolContext & { sql: NonNullable<ToolContext["sql"]> } = {
    sessionId: "s-1",
    userId,
    metadata: { chatId: "c-2" },
    sql: () => Promise.resolve({ rows: [] }),
  };
  const devxCtx = await toDevxCtx(evectx);
  assertEquals(devxCtx.workspacePath, await ensureWorkspace(userId));
  assertEquals(devxCtx.workspacePath, getWorkspacePath(userId));
  assertEquals(devxCtx.workspacePath, `${SCRATCH}/${userId}`);
});

Deno.test("parity smoke (c): userId comes ONLY from ToolContext.userId, never from client-supplied metadata (a spoofed metadata.userId is ignored)", async () => {
  const userId = "real-authenticated-user";
  const appId = "parity-app-spoof";
  const evectx: ToolContext & { sql: NonNullable<ToolContext["sql"]> } = {
    sessionId: "s-1",
    userId,
    // deno-lint-ignore no-explicit-any
    metadata: { chatId: "c-1", appId, userId: "attacker-supplied-id" } as any,
    sql: () => Promise.resolve({ rows: [{ ok: true }] }), // c-1 owned by userId
  };
  const devxCtx = await toDevxCtx(evectx);
  assertEquals(devxCtx.workspacePath, getAppWorkspacePath(userId, appId));
  assert(!devxCtx.workspacePath.includes("attacker-supplied-id"));
});

// ===========================================================================
// (d) Instructions parity — structural comparison, not byte-equality
// ===========================================================================
//
// What this verifies today: two different things, not one, now that
// agent.ts's buildInstructions no longer uses its `base` argument as the
// prompt's spine (it calls buildCoderContext, which supplies prompts.ts's
// LOCAL_AGENT_SYSTEM_PROMPT itself — see agent.ts's buildInstructions header
// comment).
//   - The block-order test below compares TWO INDEPENDENTLY MAINTAINED
//     artifacts — instructions.md's static block order vs.
//     LOCAL_AGENT_SYSTEM_PROMPT's — not "what buildInstructions produces" vs.
//     "what legacy produces" the way it did before buildCoderContext existed.
//     It still has a real job: instructions.md is not dead code. It is
//     exactly what a SELF-DELEGATED SUBAGENT turn runs on verbatim
//     (runSubagent, core/server/agents/service/toolset.ts:204, builds its
//     prompt from the static buildSystemPrompt() and never reaches
//     buildInstructions at all — see agent.ts's defineAgent comment) — so a
//     block missing or reordered here is a real regression on that surface,
//     even though it no longer affects the top-level loop's prompt.
//   - The rules-winner tests further down DO call the real production
//     buildInstructions hook, so they test real behavior — but they pass
//     agent.instructions as `base`, an argument buildInstructions ignores
//     entirely (kept only for hook-signature compatibility). Its content is
//     irrelevant to those tests' outcome; only the hook's own
//     buildCoderContext call determines the result.
//
// The block-order check is ORDER-ONLY: it asserts the same tags appear in
// the same relative order, not that each tagged section's CONTENT matches.
// It passes today even though <general_guidelines> has drifted:
// GENERAL_GUIDELINES_BLOCK (prompts.ts) carries a cross-repo guard bullet
// ("Your workspace is ONE app...") that instructions.md's <general_guidelines>
// does not have. Treat a green run here as weaker evidence of parity than
// "structural comparison" suggests — it rules out a missing or reordered
// section, not a reworded or incomplete one.
//
// Position divergence (the ported [[AI_RULES]] section is appended at the
// END, since instructions.md has no [[AI_RULES]] placeholder to substitute
// mid-prompt, whereas legacy's LOCAL_AGENT_SYSTEM_PROMPT substitutes it at
// its [[AI_RULES]] slot — which happens to ALSO be the last section) is
// documented here and NOT re-asserted as an error.

// The 10 static <tag> blocks instructions.md was extracted from
// (prompts.ts's LOCAL_AGENT_SYSTEM_PROMPT minus its trailing [[AI_RULES]]
// placeholder — see instructions.md's block tags vs. prompts.ts:470-573,
// 605 for the *_BLOCK constants each corresponds to), in the order both
// files declare them.
const BLOCK_TAGS = [
  "role",
  "app_commands",
  "general_guidelines",
  "tool_calling",
  "tool_calling_best_practices",
  "file_editing_tool_selection",
  "development_workflow",
  "image_generation_guidelines",
  "web_research",
  "knowledge_base",
];

function blockOrder(text: string): string[] {
  return BLOCK_TAGS
    .map((tag) => ({ tag, index: text.indexOf(`<${tag}>`) }))
    .filter((t) => t.index !== -1)
    .sort((a, b) => a.index - b.index)
    .map((t) => t.tag);
}

// Legacy override chain, transcribed (not imported — it lives inline in
// functions/agent.ts's streamAgentChat, not exported standalone) from
// functions/agent.ts:171-179. This is the exact chain agent.ts's own
// buildInstructions hook documents porting verbatim in its header comment.
async function legacyResolvedPrompt(opts: { userAiRules?: string; appId?: string; workspacePath?: string }): Promise<string> {
  let aiRules = opts.userAiRules || undefined;
  if (opts.appId && opts.workspacePath) {
    const rules = await readProjectRules(opts.workspacePath);
    if (rules !== undefined) aiRules = rules;
  }
  // prompts.ts is `@ts-nocheck`, so `options` has no inferred optionality
  // from outside it — pass `undefined` explicitly to match legacy's own
  // (untyped, effectively optional) call site at prompts.ts:995.
  return constructLocalAgentPrompt(aiRules, undefined);
}

function fakeInstructionsCtx(overrides: Partial<HookCtx> & { aiRules?: string } = {}): HookCtx {
  const { aiRules, ...rest } = overrides;
  return fakeHookCtx({
    userId: "u-parity-instr",
    sql: (query: string) => {
      if (query.includes("FROM devx.settings")) {
        return Promise.resolve({ rows: aiRules !== undefined ? [{ ai_rules: aiRules }] : [] });
      }
      // buildInstructions now also loads the skills listing (loadSkillMetadata,
      // resolver.ts) via devx.skills; no skills configured in these fixtures.
      if (query.includes("FROM devx.skills")) {
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`unexpected query: ${query}`);
    },
    ...rest,
  });
}

type RulesMarker = { kind: "default" } | { kind: "wrapped"; text: string };

function extractRulesMarker(fullPrompt: string): RulesMarker {
  const m = fullPrompt.match(/<user_defined_ai_rules>\n([\s\S]*?)\n<\/user_defined_ai_rules>/);
  if (m) return { kind: "wrapped", text: m[1] };
  assert(fullPrompt.includes(DEFAULT_AI_RULES), "expected the DEFAULT_AI_RULES fallback when no wrapped rules section is present");
  return { kind: "default" };
}

Deno.test("parity smoke (d): static block order matches between instructions.md and (legacy) LOCAL_AGENT_SYSTEM_PROMPT", async () => {
  assertEquals(blockOrder(agent.instructions), BLOCK_TAGS, "instructions.md is missing/reorders a static block");
  assertEquals(blockOrder(await legacyResolvedPrompt({})), BLOCK_TAGS, "legacy LOCAL_AGENT_SYSTEM_PROMPT is missing/reorders a static block");
});

Deno.test("parity smoke (d): rules winner matches legacy — user ai_rules win when there is no appId", async () => {
  const ctx = fakeInstructionsCtx({ metadata: { chatId: "c-1" }, aiRules: "Always use TypeScript." });
  const ported = await buildInstructions(agent.instructions, ctx);
  const legacy = await legacyResolvedPrompt({ userAiRules: "Always use TypeScript." });
  const expected: RulesMarker = { kind: "wrapped", text: "Always use TypeScript." };
  assertEquals(extractRulesMarker(ported), expected);
  assertEquals(extractRulesMarker(legacy), expected);
});

Deno.test("parity smoke (d): rules winner matches legacy — project rules override user ai_rules when appId is set and TREX.md exists", async () => {
  const userId = "u-parity-instr-project";
  const appId = "app-parity-instr-1";
  const wsPath = await ensureAppWorkspace(userId, appId);
  await Deno.writeTextFile(`${wsPath}/TREX.md`, "Use 2-space indentation.");

  const ctx = fakeInstructionsCtx({ userId, metadata: { chatId: "c-1", appId }, aiRules: "Always use TypeScript." });
  const ported = await buildInstructions(agent.instructions, ctx);
  const legacy = await legacyResolvedPrompt({ userAiRules: "Always use TypeScript.", appId, workspacePath: wsPath });
  const expected: RulesMarker = { kind: "wrapped", text: "Use 2-space indentation." };
  assertEquals(extractRulesMarker(ported), expected);
  assertEquals(extractRulesMarker(legacy), expected);
});

Deno.test("parity smoke (d): rules winner matches legacy — user ai_rules win when appId is set but no project rules file exists", async () => {
  const userId = "u-parity-instr-noproj";
  const appId = "app-parity-instr-2";
  const wsPath = await ensureAppWorkspace(userId, appId); // exists, carries no TREX.md/AI_RULES.md

  const ctx = fakeInstructionsCtx({ userId, metadata: { chatId: "c-1", appId }, aiRules: "Always use TypeScript." });
  const ported = await buildInstructions(agent.instructions, ctx);
  const legacy = await legacyResolvedPrompt({ userAiRules: "Always use TypeScript.", appId, workspacePath: wsPath });
  const expected: RulesMarker = { kind: "wrapped", text: "Always use TypeScript." };
  assertEquals(extractRulesMarker(ported), expected);
  assertEquals(extractRulesMarker(legacy), expected);
});

Deno.test("parity smoke (d): rules winner matches legacy — DEFAULT_AI_RULES when neither project rules nor user ai_rules exist", async () => {
  const ctx = fakeInstructionsCtx({ metadata: { chatId: "c-1" } }); // no aiRules override -> no settings row
  const ported = await buildInstructions(agent.instructions, ctx);
  const legacy = await legacyResolvedPrompt({});
  const expected: RulesMarker = { kind: "default" };
  assertEquals(extractRulesMarker(ported), expected);
  assertEquals(extractRulesMarker(legacy), expected);
});
