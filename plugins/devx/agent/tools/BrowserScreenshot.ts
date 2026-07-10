// Batch B (task-v2-brief.md): thin wrapper over the legacy devx browserScreenshotTool.
// Internals live in functions/tools/playwright.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { browserScreenshotTool } from "../../functions/tools/playwright.ts";

export default wrap({
  description: browserScreenshotTool.description,
  schema: browserScreenshotTool.parameters,
  execute: browserScreenshotTool.execute,
  modifiesState: browserScreenshotTool.modifiesState,
  defaultConsent: browserScreenshotTool.defaultConsent,
});
