// Batch A (task-v2-brief.md): thin wrapper over the legacy devx
// exitWorktreeTool. Classified into batch A (git family) — see EnterWorktree.ts
// for the family-ambiguity rationale. Internals live in
// functions/tools/worktree.ts (multi-export file — one wrapper per registry
// entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { exitWorktreeTool } from "../../functions/tools/worktree.ts";

export default wrap({
  description: exitWorktreeTool.description,
  schema: exitWorktreeTool.parameters,
  execute: exitWorktreeTool.execute,
  modifiesState: exitWorktreeTool.modifiesState,
  defaultConsent: exitWorktreeTool.defaultConsent,
});
