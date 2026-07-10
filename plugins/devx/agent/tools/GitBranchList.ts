// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitBranchListTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitBranchListTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitBranchListTool.description,
  schema: gitBranchListTool.parameters,
  execute: gitBranchListTool.execute,
  modifiesState: gitBranchListTool.modifiesState,
  defaultConsent: gitBranchListTool.defaultConsent,
});
