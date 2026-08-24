import { defineAgent } from "eve";
import type { HookCtx, ModelSpec } from "eve";
import { resolveSupportModel } from "./lib/model.ts";
import { readTask, renderStateForPrompt } from "./lib/state.ts";

async function resolveModel(ctx: HookCtx): Promise<ModelSpec> {
  return await resolveSupportModel(ctx.env);
}

async function buildInstructions(base: string, ctx: HookCtx): Promise<string> {
  const t = await readTask(ctx.sql, ctx.sessionId);
  return base + renderStateForPrompt(t);
}

export default defineAgent({
  maxSteps: 15,
  resolveModel,
  buildInstructions,
});
