// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitCommitTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitCommitTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitCommitTool.description,
  schema: gitCommitTool.parameters,
  execute: gitCommitTool.execute,
  modifiesState: gitCommitTool.modifiesState,
  defaultConsent: gitCommitTool.defaultConsent,
});
