// Batch B (task-v2-brief.md): thin wrapper over the legacy devx browserFillTool.
// Internals live in functions/tools/playwright.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { browserFillTool } from "../../functions/tools/playwright.ts";

export default wrap({
  description: browserFillTool.description,
  schema: browserFillTool.parameters,
  execute: browserFillTool.execute,
  modifiesState: browserFillTool.modifiesState,
  defaultConsent: browserFillTool.defaultConsent,
});
