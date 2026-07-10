// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitBranchCreateTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitBranchCreateTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitBranchCreateTool.description,
  schema: gitBranchCreateTool.parameters,
  execute: gitBranchCreateTool.execute,
  modifiesState: gitBranchCreateTool.modifiesState,
  defaultConsent: gitBranchCreateTool.defaultConsent,
});
