import { defineAgent } from "eve";
import type { HookCtx, ModelSpec } from "eve";
import { resolveClawModel } from "./lib/model.ts";
import { readOrchestration, renderStateForPrompt } from "./lib/state.ts";

async function resolveModel(ctx: HookCtx): Promise<ModelSpec> {
  return await resolveClawModel(ctx.env, ctx.userId);
}

async function buildInstructions(base: string, ctx: HookCtx): Promise<string> {
  const o = await readOrchestration(ctx.sql, ctx.sessionId);
  return base + renderStateForPrompt(o);
}

export default defineAgent({
  maxSteps: 25,
  resolveModel,
  buildInstructions,
});
