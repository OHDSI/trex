// Batch B (task-v2-brief.md): thin wrapper over the legacy devx taskStopTool.
// Internals live in functions/tools/task_tools.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { taskStopTool } from "../../functions/tools/task_tools.ts";

export default wrap({
  description: taskStopTool.description,
  schema: taskStopTool.parameters,
  execute: taskStopTool.execute,
  modifiesState: taskStopTool.modifiesState,
  defaultConsent: taskStopTool.defaultConsent,
});
