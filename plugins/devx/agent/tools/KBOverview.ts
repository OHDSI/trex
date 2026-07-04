// Batch B (task-v2-brief.md): thin wrapper over the legacy devx kbOverviewTool.
// Internals live in functions/tools/knowledge_base.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { kbOverviewTool } from "../../functions/tools/knowledge_base.ts";

export default wrap({
  description: kbOverviewTool.description,
  schema: kbOverviewTool.parameters,
  execute: kbOverviewTool.execute,
  modifiesState: kbOverviewTool.modifiesState,
  defaultConsent: kbOverviewTool.defaultConsent,
});
