// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitPushTool.
// Internals live in functions/tools/github.ts (multi-export file — one
// wrapper per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitPushTool } from "../../functions/tools/github.ts";

export default wrap({
  description: gitPushTool.description,
  schema: gitPushTool.parameters,
  execute: gitPushTool.execute,
  modifiesState: gitPushTool.modifiesState,
  defaultConsent: gitPushTool.defaultConsent,
});
