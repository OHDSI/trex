// Batch B (task-v2-brief.md): thin wrapper over the legacy devx cronCreateTool.
// Internals live in functions/tools/cron.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { cronCreateTool } from "../../functions/tools/cron.ts";

export default wrap({
  description: cronCreateTool.description,
  schema: cronCreateTool.parameters,
  execute: cronCreateTool.execute,
  modifiesState: cronCreateTool.modifiesState,
  defaultConsent: cronCreateTool.defaultConsent,
});
