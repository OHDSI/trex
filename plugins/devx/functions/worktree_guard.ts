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
