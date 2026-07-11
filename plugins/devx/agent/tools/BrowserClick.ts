// Batch B (task-v2-brief.md): thin wrapper over the legacy devx browserClickTool.
// Internals live in functions/tools/playwright.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { browserClickTool } from "../../functions/tools/playwright.ts";

export default wrap({
  description: browserClickTool.description,
  schema: browserClickTool.parameters,
  execute: browserClickTool.execute,
  modifiesState: browserClickTool.modifiesState,
  defaultConsent: browserClickTool.defaultConsent,
});
