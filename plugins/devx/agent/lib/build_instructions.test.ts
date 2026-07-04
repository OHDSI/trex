// Unit tests for agent.ts's buildInstructions hook (task-v3-brief.md): AI_RULES
// (devx.settings) + workspace project rules (TREX.md/AI_RULES.md via
// workspace.ts's readProjectRules), both appended AFTER the static base —
// see agent.ts's own header comment for why V3 appends both instead of
// mirroring legacy's override-only behavior.
import { assert, assertEquals } from "jsr:@std/assert";
import type { HookCtx } from "../../../../core/server/agents/eve-shim/types.ts";
import agentConfig from "../agent.ts";
import { ensureAppWorkspace } from "../../functions/tools/workspace.ts";

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

Deno.test("buildInstructions: base stays first, unchanged, when neither AI_RULES nor project rules exist", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" } });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, "BASE PROMPT");
});

Deno.test("buildInstructions: appends devx.settings AI_RULES after base", async () => {
  const ctx = fakeHookCtx({ metadata: { chatId: "c-1" }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, "BASE PROMPT\n\n<user_defined_ai_rules>\nAlways use TypeScript.\n</user_defined_ai_rules>");
});

Deno.test("buildInstructions: appends workspace project rules (TREX.md) after AI_RULES, in that order", async () => {
  const userId = "u-project-rules";
  const appId = "app-1";
  const wsPath = await ensureAppWorkspace(userId, appId);
  await Deno.writeTextFile(`${wsPath}/TREX.md`, "Use 2-space indentation.");

  const ctx = fakeHookCtx({ userId, metadata: { chatId: "c-1", appId }, aiRules: "Always use TypeScript." });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(
    result,
    "BASE PROMPT" +
      "\n\n<user_defined_ai_rules>\nAlways use TypeScript.\n</user_defined_ai_rules>" +
      "\n\n<project_rules>\nUse 2-space indentation.\n</project_rules>",
  );
});

Deno.test("buildInstructions: project rules alone (no devx.settings AI_RULES) still append after base", async () => {
  const userId = "u-project-rules-only";
  const appId = "app-2";
  const wsPath = await ensureAppWorkspace(userId, appId);
  await Deno.writeTextFile(`${wsPath}/AI_RULES.md`, "Legacy rules file.");

  const ctx = fakeHookCtx({ userId, metadata: { chatId: "c-1", appId } });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, "BASE PROMPT" + "\n\n<project_rules>\nLegacy rules file.\n</project_rules>");
});

Deno.test("buildInstructions: no ctx.userId returns base unchanged (no throw)", async () => {
  const ctx = fakeHookCtx({ userId: undefined, metadata: { chatId: "c-1" } });
  const result = await buildInstructions("BASE PROMPT", ctx);
  assertEquals(result, "BASE PROMPT");
});

Deno.test("buildInstructions: no appId uses the per-user workspace (ensureWorkspace), not an app workspace", async () => {
  const userId = "u-no-app";
  const ctx = fakeHookCtx({ userId, metadata: { chatId: "c-1" } });
  const result = await buildInstructions("BASE PROMPT", ctx);
  // No TREX.md/AI_RULES.md written to this user's bare workspace -> nothing appended.
  assertEquals(result, "BASE PROMPT");
  assert((await Deno.stat(`${SCRATCH}/${userId}`)).isDirectory);
});
