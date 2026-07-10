// Batch B (task-v2-brief.md): thin wrapper over the legacy devx taskListTool.
// Internals live in functions/tools/task_tools.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { taskListTool } from "../../functions/tools/task_tools.ts";

export default wrap({
  description: taskListTool.description,
  schema: taskListTool.parameters,
  execute: taskListTool.execute,
  modifiesState: taskListTool.modifiesState,
  defaultConsent: taskListTool.defaultConsent,
});
