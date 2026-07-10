// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitBranchSwitchTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitBranchSwitchTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitBranchSwitchTool.description,
  schema: gitBranchSwitchTool.parameters,
  execute: gitBranchSwitchTool.execute,
  modifiesState: gitBranchSwitchTool.modifiesState,
  defaultConsent: gitBranchSwitchTool.defaultConsent,
});
