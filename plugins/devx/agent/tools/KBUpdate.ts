// Batch B (task-v2-brief.md): thin wrapper over the legacy devx kbUpdateTool.
// Internals live in functions/tools/knowledge_base.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { kbUpdateTool } from "../../functions/tools/knowledge_base.ts";

export default wrap({
  description: kbUpdateTool.description,
  schema: kbUpdateTool.parameters,
  execute: kbUpdateTool.execute,
  modifiesState: kbUpdateTool.modifiesState,
  defaultConsent: kbUpdateTool.defaultConsent,
});
