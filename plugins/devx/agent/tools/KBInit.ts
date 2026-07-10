// Batch B (task-v2-brief.md): thin wrapper over the legacy devx kbInitTool.
// Internals live in functions/tools/knowledge_base.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { kbInitTool } from "../../functions/tools/knowledge_base.ts";

export default wrap({
  description: kbInitTool.description,
  schema: kbInitTool.parameters,
  execute: kbInitTool.execute,
  modifiesState: kbInitTool.modifiesState,
  defaultConsent: kbInitTool.defaultConsent,
});
