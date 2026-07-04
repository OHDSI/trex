// Batch A (task-v2-brief.md): thin wrapper over the legacy devx gitPullTool.
// Internals live in functions/tools/github.ts (multi-export file — one
// wrapper per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { gitPullTool } from "../../functions/tools/github.ts";

export default wrap({
  description: gitPullTool.description,
  schema: gitPullTool.parameters,
  execute: gitPullTool.execute,
  modifiesState: gitPullTool.modifiesState,
  defaultConsent: gitPullTool.defaultConsent,
});
