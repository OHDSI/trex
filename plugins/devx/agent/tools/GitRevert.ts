// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitRevertTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitRevertTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitRevertTool.description,
  schema: gitRevertTool.parameters,
  execute: gitRevertTool.execute,
  modifiesState: gitRevertTool.modifiesState,
  defaultConsent: gitRevertTool.defaultConsent,
});
