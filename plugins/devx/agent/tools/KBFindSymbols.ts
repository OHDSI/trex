// Batch B (task-v2-brief.md): thin wrapper over the legacy devx kbFindSymbolsTool.
// Internals live in functions/tools/knowledge_base.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { kbFindSymbolsTool } from "../../functions/tools/knowledge_base.ts";

export default wrap({
  description: kbFindSymbolsTool.description,
  schema: kbFindSymbolsTool.parameters,
  execute: kbFindSymbolsTool.execute,
  modifiesState: kbFindSymbolsTool.modifiesState,
  defaultConsent: kbFindSymbolsTool.defaultConsent,
});
