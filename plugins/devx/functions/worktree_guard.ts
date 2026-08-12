// Deterministic identity checks for per-chat git worktrees. A chat's coder must
// only ever run on its own isolated branch: these helpers derive the branch
// name from the chat id and validate a to-be-reused worktree against
// `git worktree list` output. Kept dependency-free so they unit-test in
// isolation (claude_code_agent.ts is the consumer).

/** The isolated feature branch a chat's worktree must have checked out. */
export function chatWorktreeBranch(chatId: string): string {
  return `claw/${String(chatId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}`;
}

/**
 * Validate a to-be-reused worktree: the `git worktree list` entry for this
 * path must exist, not be detached, and have this chat's own branch checked
 * out. Returns an error string (reason) or null when valid.
 *
 * Prefer `worktreeReuseDecision` in consumers: it additionally distinguishes
 * the recoverable foreign-branch case (clean tree) from real contamination.
 */
export function worktreeReuseError(
  entries: Array<{ path: string; branch: string | null; detached: boolean }>,
  worktreePath: string,
  expectedBranch: string,
): string | null {
  const entry = entries.find((e) => e.path === worktreePath);
  if (!entry) return `directory exists but git does not list it as a worktree`;
  if (entry.detached) return `worktree is detached (expected branch ${expectedBranch})`;
  if (entry.branch !== expectedBranch) {
    return `worktree has '${entry.branch ?? "no branch"}' checked out (expected ${expectedBranch})`;
  }
  return null;
}

export type WorktreeReuseDecision =
  | { ok: true }
  | { restore: true; foreignBranch: string }
  | { error: string };

/**
 * Like `worktreeReuseError`, but classifies the foreign-branch case by the
 * tree's dirtiness. The coder itself legitimately checks out other branches
 * inside its own worktree (e.g. an existing PR branch it iterates on) and
 * leaves them checked out at turn end — refusing the NEXT turn for that made
 * every second turn of a work-on-existing-PR task fail. With a CLEAN tree
 * nothing can leak across tasks, so that case is `restore` (the caller
 * switches back to the chat's own branch). A DIRTY tree on a foreign branch
 * stays a hard error: those uncommitted changes belong to *some* branch, and
 * silently carrying them onto the chat branch (or discarding them) would be
 * the exact contamination this guard exists to stop.
 */
export function worktreeReuseDecision(
  entries: Array<{ path: string; branch: string | null; detached: boolean }>,
  worktreePath: string,
  expectedBranch: string,
  dirtyFileCount: number,
): WorktreeReuseDecision {
  const entry = entries.find((e) => e.path === worktreePath);
  if (!entry) return { error: `directory exists but git does not list it as a worktree` };
  if (entry.detached) return { error: `worktree is detached (expected branch ${expectedBranch})` };
  if (entry.branch === expectedBranch) return { ok: true };
  if (dirtyFileCount === 0) {
    return { restore: true, foreignBranch: entry.branch ?? "no branch" };
  }
  return {
    error: `worktree has '${entry.branch ?? "no branch"}' checked out (expected ${expectedBranch}) ` +
      `with ${dirtyFileCount} uncommitted change(s) — cannot restore the chat branch without risking them`,
  };
}
