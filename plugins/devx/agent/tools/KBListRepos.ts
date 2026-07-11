// Batch B (task-v2-brief.md): thin wrapper over the legacy devx kbListReposTool.
// Internals live in functions/tools/knowledge_base.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { kbListReposTool } from "../../functions/tools/knowledge_base.ts";

export default wrap({
  description: kbListReposTool.description,
  schema: kbListReposTool.parameters,
  execute: kbListReposTool.execute,
  modifiesState: kbListReposTool.modifiesState,
  defaultConsent: kbListReposTool.defaultConsent,
});
