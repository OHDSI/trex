// Batch B (task-v2-brief.md): thin wrapper over the legacy devx kbListFilesTool.
// Internals live in functions/tools/knowledge_base.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { kbListFilesTool } from "../../functions/tools/knowledge_base.ts";

export default wrap({
  description: kbListFilesTool.description,
  schema: kbListFilesTool.parameters,
  execute: kbListFilesTool.execute,
  modifiesState: kbListFilesTool.modifiesState,
  defaultConsent: kbListFilesTool.defaultConsent,
});
