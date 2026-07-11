// Batch B (task-v2-brief.md): thin wrapper over the legacy devx writePlanTool.
// Internals live in functions/tools/plan_tools.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { writePlanTool } from "../../functions/tools/plan_tools.ts";

export default wrap({
  description: writePlanTool.description,
  schema: writePlanTool.parameters,
  execute: writePlanTool.execute,
  modifiesState: writePlanTool.modifiesState,
  defaultConsent: writePlanTool.defaultConsent,
});
