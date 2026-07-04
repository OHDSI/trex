// Batch B (task-v2-brief.md): thin wrapper over the legacy devx kbSearchTool.
// Internals live in functions/tools/knowledge_base.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { kbSearchTool } from "../../functions/tools/knowledge_base.ts";

export default wrap({
  description: kbSearchTool.description,
  schema: kbSearchTool.parameters,
  execute: kbSearchTool.execute,
  modifiesState: kbSearchTool.modifiesState,
  defaultConsent: kbSearchTool.defaultConsent,
});
