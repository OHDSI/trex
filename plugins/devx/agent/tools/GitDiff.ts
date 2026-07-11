// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitDiffTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitDiffTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitDiffTool.description,
  schema: gitDiffTool.parameters,
  execute: gitDiffTool.execute,
  modifiesState: gitDiffTool.modifiesState,
  defaultConsent: gitDiffTool.defaultConsent,
});
