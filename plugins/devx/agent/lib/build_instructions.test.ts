// Unit tests for agent.ts's buildInstructions hook (task-1-brief.md,
// 2026-08-21-agents-loop-coder-contract: buildInstructions now consumes the
// shared functions/coder_context.ts::buildCoderContext instead of hand-
// assembling the prompt). This loop's own remaining contribution is the
// legacy single-winner ai_rules override chain (functions/agent.ts:171-177 +
// prompts.ts's wrapAiRules) — project rules (appId-gated) ||
// devx.settings.ai_rules || DEFAULT_AI_RULES — which is now handed to
// buildCoderContext as the RAW winner and wrapped by prompts.ts's own
// wrapAiRules (a real winner in <user_defined_ai_rules>; DEFAULT_AI_RULES
// unwrapped), rather than wrapped by hand here.
//
// `base` (the first argument) is accepted for hook-signature compatibility
// only and is IGNORED — the assembled prompt's spine now comes entirely from
// buildCoderContext, not from the static instructions.md content the caller
// hands in as `base`. Tests below assert `base`'s literal text ("BASE
// PROMPT") does NOT appear in the result, to make that explicit.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import agentConfig from "../agent.ts";
import { ensureAppWorkspace, ensureWorkspace } from "../../functions/tools/workspace.ts";
import { DEFAULT_AI_RULES } from "../../functions/prompts.ts";
import { loadSkillsForPrompt } from "../../functions/skills/resolver.ts";

const buildInstructions = agentConfig.buildInstructions!;

// The shared contract markers buildCoderContext adds that the old
// hand-assembled prompt never carried (task-1-brief.md's whole point: this
// loop got none of these before).
function assertCarriesSharedContract(result: string) {
  assertStringIncludes(result, "<skills-protocol>");
  assertStringIncludes(result, "<skill-usage>");
  assertStringIncludes(result, "<commit-pr-hygiene>");
  // askToolAvailable is false on this loop (no mcp__ask__ask_question tool
  // registered) — the blocking ask-question rule must NOT be injected.
  assert(!result.includes("<asking-questions>"), "ask-question rule must be absent: this loop has no mcp__ask__ask_question tool");
  // `base` is accepted but ignored; it must not leak into the result.
  assert(!result.includes("BASE PROMPT"), "the static `base` argument must not appear in the assembled prompt");
}

// Redirect workspace.ts's DEFAULT_WORKSPACE_DIR to a scratch dir, same
// precedent as context.test.ts / tools_batch_a.test.ts.
const SCRATCH = await Deno.makeTempDir({ prefix: "devx-agent-build-instructions-test-" });
Deno.env.set("DEVX_WORKSPACE_DIR", SCRATCH);

function fakeHookCtx(overrides: Partial<HookCtx> & { aiRules?: string | null } = {}): HookCtx {
  const { aiRules, ...rest } = overrides;
  return {
    sessionId: "s-1",
    env: () => undefined,
    userId: "u-1",
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
  };
}

function wrapped(rules: string): string {
  return `<user_defined_ai_rules>\n${rules}\n</user_defined_ai_rules>`;
}

Deno.test("buildInstructions: project rules win when appId is set and a rules file exists (user ai_rules discarded, single section) — and now carries the shared coder contract", async () => {
  const userId = "u-project-wins";
  const appId = "app-1";
  const wsPath = await ensureAppWorkspace(userId, appId);
  await Deno.writeTextFile(`${wsPath}/TREX.md`, "Use 2-space indentation.");

  const ctx = fakeHookCtx({ userId, metadata: { chatId: "c-1", appId }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertCarriesSharedContract(result);
  assertStringIncludes(result, wrapped("Use 2-space indentation."));
  // Loser must NOT appear anywhere — override, not append.
  assert(!result.includes("Always use TypeScript."), "user ai_rules must be overridden, not appended alongside");
});

Deno.test("buildInstructions: user ai_rules win when appId is set but no project rules file exists", async () => {
  const userId = "u-user-wins-no-file";
  const appId = "app-2";
  await ensureAppWorkspace(userId, appId); // exists, but carries no TREX.md/AI_RULES.md

  const ctx = fakeHookCtx({ userId, metadata: { chatId: "c-1", appId }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertCarriesSharedContract(result);
  assertStringIncludes(result, wrapped("Always use TypeScript."));
});

Deno.test("buildInstructions: user ai_rules win when there is no appId — the shared coder contract carries the legacy precedence winner, wrapped", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertCarriesSharedContract(result);
  assertStringIncludes(result, wrapped("Always use TypeScript."));
});

Deno.test("buildInstructions: DEFAULT_AI_RULES (unwrapped) when neither project rules nor user ai_rules exist", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" } });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertCarriesSharedContract(result);
  // A distinctive substring of the real constant, and NOT wrapAiRules's
  // user-rules wrapper (the default goes in unwrapped, per wrapAiRules).
  assert(result.includes("ALWAYS try to use the shadcn/ui library."), "expected a distinctive DEFAULT_AI_RULES substring");
  assert(!result.includes("<user_defined_ai_rules>"), "DEFAULT_AI_RULES must not be wrapped");
});

Deno.test("buildInstructions: readProjectRules is NOT consulted without an appId (legacy gate) — a rules file in the bare user workspace is ignored", async () => {
  const userId = "u-no-app-gate";
  const wsPath = await ensureWorkspace(userId);
  await Deno.writeTextFile(`${wsPath}/TREX.md`, "Rules that must stay invisible.");

  const ctx = fakeHookCtx({ userId, metadata: { chatId: "c-1" }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertStringIncludes(result, wrapped("Always use TypeScript."));
  assert(!result.includes("Rules that must stay invisible."), "project rules must not be read without an appId");
});

Deno.test("buildInstructions: empty-string user ai_rules falls through to DEFAULT_AI_RULES (legacy `|| undefined` falsiness)", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" }, aiRules: "" });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assert(result.includes("ALWAYS try to use the shadcn/ui library."), "expected DEFAULT_AI_RULES to win");
  assert(!result.includes("<user_defined_ai_rules>"), "DEFAULT_AI_RULES must not be wrapped");
});

Deno.test("buildInstructions: no ctx.userId appends DEFAULT_AI_RULES (no settings/workspace lookup possible, no throw)", async () => {
  const ctx = fakeHookCtx({
    userId: undefined,
    metadata: { chatId: "c-1" },
    sql: () => Promise.reject(new Error("should not query without a userId")),
  });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assert(result.includes("ALWAYS try to use the shadcn/ui library."), "expected DEFAULT_AI_RULES to win");
  assert(!result.includes("<user_defined_ai_rules>"), "DEFAULT_AI_RULES must not be wrapped");
});

// task-1-brief.md Step 2's required tests: the assembled instructions now
// carry the shared coder contract, and the legacy ai_rules precedence
// survives the switch to buildCoderContext.
Deno.test("agents-loop instructions carry the shared coder contract", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" } });
  const out = await buildInstructions("BASE PROMPT", ctx);
  assertStringIncludes(out, "<skills-protocol>");
  assertStringIncludes(out, "<commit-pr-hygiene>");
});

Deno.test("agents-loop instructions keep the legacy ai_rules precedence", async () => {
  // user rules present, no appId -> user rules win, wrapped
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" }, aiRules: "USER RULES" });
  const out = await buildInstructions("BASE PROMPT", ctx);
  assertStringIncludes(out, "<user_defined_ai_rules>");
  assertStringIncludes(out, "USER RULES");
});

// R12: the eve prompt must only advertise skills eve can actually LOAD.
// This loop's loader is core's `skillTool`, which resolves against the
// `agent/skills -> ../skills` symlink — i.e. the filesystem-synced built-ins
// (skills/sync.ts upserts exactly those with is_builtin = true, under the
// same names). A user-created devx.skills row has no file behind it, so
// naming it here would have the model call `skill` and get `unknown skill`.
const SKILL_ROWS = [
  {
    id: "s1",
    name: "brainstorming",
    slug: "brainstorming",
    description: "Explore an idea before building it",
    allowed_tools: null,
    mode: "agent",
    aliases: [],
    is_builtin: true,
  },
  {
    id: "s2",
    name: "my-custom-skill",
    slug: "my-custom-skill",
    description: "A skill the user created in the UI",
    allowed_tools: null,
    mode: "agent",
    aliases: [],
    is_builtin: false,
  },
];

function ctxWithSkills(): HookCtx {
  return {
    sessionId: "s-1",
    env: () => undefined,
    userId: "u-skills",
    metadata: { chatId: "c-1" },
    sql: (query: string) => {
      if (query.includes("FROM devx.settings")) return Promise.resolve({ rows: [] });
      if (query.includes("FROM devx.skills")) return Promise.resolve({ rows: SKILL_ROWS });
      throw new Error(`unexpected query: ${query}`);
    },
  };
}

Deno.test("eve listing excludes a non-builtin skill skillTool could never resolve", async () => {
  const out = await buildInstructions("BASE PROMPT", ctxWithSkills());
  assertStringIncludes(out, "<available-skills>");
  assertStringIncludes(out, "- brainstorming: Explore an idea before building it");
  assert(
    !out.includes("my-custom-skill"),
    "a user-created skill has no file behind the agent/skills symlink — advertising it makes `skill` return `unknown skill`",
  );
});

Deno.test("the legacy listing still carries the same non-builtin skill (deliberate divergence)", async () => {
  const sqlFn = (_q: string, _p?: unknown[]) => Promise.resolve({ rows: SKILL_ROWS });
  // No opts = exactly what functions/agent.ts, claude_code_agent.ts and
  // index.ts pass, so this is the legacy listing, unchanged.
  const legacy = await loadSkillsForPrompt("u-skills", sqlFn);
  assertEquals(legacy.map((s) => s.name), ["brainstorming", "my-custom-skill"]);
  // ...and the eve flavour of the same call drops it.
  const eve = await loadSkillsForPrompt("u-skills", sqlFn, { builtinOnly: true });
  assertEquals(eve.map((s) => s.name), ["brainstorming"]);
});
