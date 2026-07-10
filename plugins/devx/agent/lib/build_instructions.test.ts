// Unit tests for agent.ts's buildInstructions hook (task-v3-brief.md, revised
// per the V3 review adjudication): legacy single-winner override chain
// (functions/agent.ts:171-177 + prompts.ts's wrapAiRules) reproduced exactly —
// project rules (appId-gated) || devx.settings.ai_rules || DEFAULT_AI_RULES,
// exactly ONE rules section appended after the static base. A user/project
// winner arrives wrapped in <user_defined_ai_rules>; the DEFAULT_AI_RULES
// fallback arrives unwrapped, per wrapAiRules.
import { assert, assertEquals } from "jsr:@std/assert";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import agentConfig from "../agent.ts";
import { ensureAppWorkspace, ensureWorkspace } from "../../functions/tools/workspace.ts";
import { DEFAULT_AI_RULES } from "../../functions/prompts.ts";

const buildInstructions = agentConfig.buildInstructions!;

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
      throw new Error(`unexpected query: ${query}`);
    },
    ...rest,
  };
}

function wrapped(rules: string): string {
  return `<user_defined_ai_rules>\n${rules}\n</user_defined_ai_rules>`;
}

Deno.test("buildInstructions: project rules win when appId is set and a rules file exists (user ai_rules discarded, single section)", async () => {
  const userId = "u-project-wins";
  const appId = "app-1";
  const wsPath = await ensureAppWorkspace(userId, appId);
  await Deno.writeTextFile(`${wsPath}/TREX.md`, "Use 2-space indentation.");

  const ctx = fakeHookCtx({ userId, metadata: { chatId: "c-1", appId }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, `BASE PROMPT\n\n${wrapped("Use 2-space indentation.")}`);
  // Loser must NOT appear anywhere — override, not append.
  assert(!result.includes("Always use TypeScript."), "user ai_rules must be overridden, not appended alongside");
});

Deno.test("buildInstructions: user ai_rules win when appId is set but no project rules file exists", async () => {
  const userId = "u-user-wins-no-file";
  const appId = "app-2";
  await ensureAppWorkspace(userId, appId); // exists, but carries no TREX.md/AI_RULES.md

  const ctx = fakeHookCtx({ userId, metadata: { chatId: "c-1", appId }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, `BASE PROMPT\n\n${wrapped("Always use TypeScript.")}`);
});

Deno.test("buildInstructions: user ai_rules win when there is no appId", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, `BASE PROMPT\n\n${wrapped("Always use TypeScript.")}`);
});

Deno.test("buildInstructions: DEFAULT_AI_RULES (unwrapped) when neither project rules nor user ai_rules exist", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" } });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, `BASE PROMPT\n\n${DEFAULT_AI_RULES}`);
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
  assertEquals(result, `BASE PROMPT\n\n${wrapped("Always use TypeScript.")}`);
  assert(!result.includes("Rules that must stay invisible."), "project rules must not be read without an appId");
});

Deno.test("buildInstructions: empty-string user ai_rules falls through to DEFAULT_AI_RULES (legacy `|| undefined` falsiness)", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" }, aiRules: "" });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, `BASE PROMPT\n\n${DEFAULT_AI_RULES}`);
});

Deno.test("buildInstructions: no ctx.userId appends DEFAULT_AI_RULES (no settings/workspace lookup possible, no throw)", async () => {
  const ctx = fakeHookCtx({
    userId: undefined,
    metadata: { chatId: "c-1" },
    sql: () => Promise.reject(new Error("should not query without a userId")),
  });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, `BASE PROMPT\n\n${DEFAULT_AI_RULES}`);
});
