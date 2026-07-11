// Batch B (task-v2-brief.md): thin wrapper over the legacy devx taskUpdateTool.
// Internals live in functions/tools/task_tools.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { taskUpdateTool } from "../../functions/tools/task_tools.ts";

export default wrap({
  description: taskUpdateTool.description,
  schema: taskUpdateTool.parameters,
  execute: taskUpdateTool.execute,
  modifiesState: taskUpdateTool.modifiesState,
  defaultConsent: taskUpdateTool.defaultConsent,
});
