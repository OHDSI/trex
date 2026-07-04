// Batch B (task-v2-brief.md): thin wrapper over the legacy devx kbReadTool.
// Internals live in functions/tools/knowledge_base.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { kbReadTool } from "../../functions/tools/knowledge_base.ts";

export default wrap({
  description: kbReadTool.description,
  schema: kbReadTool.parameters,
  execute: kbReadTool.execute,
  modifiesState: kbReadTool.modifiesState,
  defaultConsent: kbReadTool.defaultConsent,
});
