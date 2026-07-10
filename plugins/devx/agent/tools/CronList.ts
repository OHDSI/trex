// Batch B (task-v2-brief.md): thin wrapper over the legacy devx cronListTool.
// Internals live in functions/tools/cron.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { cronListTool } from "../../functions/tools/cron.ts";

export default wrap({
  description: cronListTool.description,
  schema: cronListTool.parameters,
  execute: cronListTool.execute,
  modifiesState: cronListTool.modifiesState,
  defaultConsent: cronListTool.defaultConsent,
});
