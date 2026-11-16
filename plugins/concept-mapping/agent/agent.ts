import { defineAgent } from "eve";
import type { HookCtx } from "eve";
import { resolveConceptMappingModel } from "./lib/model.ts";

export default defineAgent({
  // A row takes about 3 to 6 steps (retrieve, judge, save, sometimes
  // enrichment), so one turn maps roughly 60 to 100 rows before the agent
  // asks the user to "continue".
  maxSteps: 400,
  resolveModel: (ctx: HookCtx) => Promise.resolve(resolveConceptMappingModel(ctx.env)),
});
