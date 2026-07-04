// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitInitTool.
// Internals live in functions/tools/git.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitInitTool } from "../../functions/tools/git.ts";

export default wrap({
  description: gitInitTool.description,
  schema: gitInitTool.parameters,
  execute: gitInitTool.execute,
  modifiesState: gitInitTool.modifiesState,
  defaultConsent: gitInitTool.defaultConsent,
});
