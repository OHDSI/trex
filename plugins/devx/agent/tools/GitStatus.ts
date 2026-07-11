// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitStatusTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitStatusTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitStatusTool.description,
  schema: gitStatusTool.parameters,
  execute: gitStatusTool.execute,
  modifiesState: gitStatusTool.modifiesState,
  defaultConsent: gitStatusTool.defaultConsent,
});
