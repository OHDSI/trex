// Batch B (task-v2-brief.md): thin wrapper over the legacy devx browserNavigateTool.
// Internals live in functions/tools/playwright.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { browserNavigateTool } from "../../functions/tools/playwright.ts";

export default wrap({
  description: browserNavigateTool.description,
  schema: browserNavigateTool.parameters,
  execute: browserNavigateTool.execute,
  modifiesState: browserNavigateTool.modifiesState,
  defaultConsent: browserNavigateTool.defaultConsent,
});
