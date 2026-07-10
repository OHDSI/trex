// Batch B (task-v2-brief.md): thin wrapper over the legacy devx cronDeleteTool.
// Internals live in functions/tools/cron.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { cronDeleteTool } from "../../functions/tools/cron.ts";

export default wrap({
  description: cronDeleteTool.description,
  schema: cronDeleteTool.parameters,
  execute: cronDeleteTool.execute,
  modifiesState: cronDeleteTool.modifiesState,
  defaultConsent: cronDeleteTool.defaultConsent,
});
