// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitLogTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitLogTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitLogTool.description,
  schema: gitLogTool.parameters,
  execute: gitLogTool.execute,
  modifiesState: gitLogTool.modifiesState,
  defaultConsent: gitLogTool.defaultConsent,
});
