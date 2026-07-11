// Batch B (task-v2-brief.md): thin wrapper over the legacy devx browserEvaluateTool.
// Internals live in functions/tools/playwright.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { browserEvaluateTool } from "../../functions/tools/playwright.ts";

export default wrap({
  description: browserEvaluateTool.description,
  schema: browserEvaluateTool.parameters,
  execute: browserEvaluateTool.execute,
  modifiesState: browserEvaluateTool.modifiesState,
  defaultConsent: browserEvaluateTool.defaultConsent,
});
