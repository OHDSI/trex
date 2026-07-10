// Batch B (task-v2-brief.md): thin wrapper over the legacy devx exitPlanTool.
// Internals live in functions/tools/plan_tools.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { exitPlanTool } from "../../functions/tools/plan_tools.ts";

export default wrap({
  description: exitPlanTool.description,
  schema: exitPlanTool.parameters,
  execute: exitPlanTool.execute,
  modifiesState: exitPlanTool.modifiesState,
  defaultConsent: exitPlanTool.defaultConsent,
});
