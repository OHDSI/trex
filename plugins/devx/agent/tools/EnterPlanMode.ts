// Batch B (task-v2-brief.md): thin wrapper over the legacy devx enterPlanModeTool.
// Internals live in functions/tools/enter_plan_mode.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { enterPlanModeTool } from "../../functions/tools/enter_plan_mode.ts";

export default wrap({
  description: enterPlanModeTool.description,
  schema: enterPlanModeTool.parameters,
  execute: enterPlanModeTool.execute,
  modifiesState: enterPlanModeTool.modifiesState,
  defaultConsent: enterPlanModeTool.defaultConsent,
});
