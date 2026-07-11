// Batch B (task-v2-brief.md): thin wrapper over the legacy devx browserGetTextTool.
// Internals live in functions/tools/playwright.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { browserGetTextTool } from "../../functions/tools/playwright.ts";

export default wrap({
  description: browserGetTextTool.description,
  schema: browserGetTextTool.parameters,
  execute: browserGetTextTool.execute,
  modifiesState: browserGetTextTool.modifiesState,
  defaultConsent: browserGetTextTool.defaultConsent,
});
