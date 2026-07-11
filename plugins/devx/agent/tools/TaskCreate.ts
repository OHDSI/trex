// Batch B (task-v2-brief.md): thin wrapper over the legacy devx taskCreateTool.
// Internals live in functions/tools/task_tools.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { taskCreateTool } from "../../functions/tools/task_tools.ts";

export default wrap({
  description: taskCreateTool.description,
  schema: taskCreateTool.parameters,
  execute: taskCreateTool.execute,
  modifiesState: taskCreateTool.modifiesState,
  defaultConsent: taskCreateTool.defaultConsent,
});
