// Batch A (task-v2-brief.md): thin wrapper over the legacy devx
// enterWorktreeTool. Classified into batch A (git family) rather than
// deferred to batch B — it primarily touches git (git worktree add) and the
// workspace filesystem (/tmp/devx-worktrees), matching the brief's
// tie-breaker for family-ambiguous entries. Internals live in
// functions/tools/worktree.ts (multi-export file — one wrapper per registry
// entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { enterWorktreeTool } from "../../functions/tools/worktree.ts";

export default wrap({
  description: enterWorktreeTool.description,
  schema: enterWorktreeTool.parameters,
  execute: enterWorktreeTool.execute,
  modifiesState: enterWorktreeTool.modifiesState,
  defaultConsent: enterWorktreeTool.defaultConsent,
});
