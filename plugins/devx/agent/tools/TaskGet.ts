// Batch B (task-v2-brief.md): thin wrapper over the legacy devx taskGetTool.
// Internals live in functions/tools/task_tools.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { taskGetTool } from "../../functions/tools/task_tools.ts";

export default wrap({
  description: taskGetTool.description,
  schema: taskGetTool.parameters,
  execute: taskGetTool.execute,
  modifiesState: taskGetTool.modifiesState,
  defaultConsent: taskGetTool.defaultConsent,
});
