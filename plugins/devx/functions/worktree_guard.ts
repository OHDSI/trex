// Deterministic identity checks for per-chat git worktrees. A chat's coder must
// only ever run on its own isolated branch: these helpers build the branch name
// and validate a to-be-reused worktree against `git worktree list` output. Kept
// dependency-free so they unit-test in isolation (chat_worktree.ts is the
// consumer).

/**
 * Owner segment used before a chat's branch got a real name. Every worktree
 * created prior to the `<github username>/<topic>` scheme is on
 * `claw/<chat id>`; `legacyChatWorktreeBranch` reproduces those names so
 * existing worktrees can be renamed onto the new scheme instead of being
 * rejected as foreign branches.
 */
export const LEGACY_BRANCH_OWNER = "claw";

/** Longest a single branch segment may get. Git has no hard limit; this keeps
 * names readable and well under the 255-byte ref filename limit once the
 * owner, the slash and any dedupe suffix are added. */
const MAX_SEGMENT = 40;

/**
 * Reduce arbitrary text to one safe branch path segment: lowercase, only
 * `[a-z0-9-]`, no leading/trailing/repeated separators, capped. Git also
 * rejects segments that start with `.`, end with `.lock`, or contain `..` —
 * none survive this filter. Returns `fallback` when nothing usable remains
 * (an all-emoji chat title, say), so the result is never empty.
 */
export function branchSlug(input: string | null | undefined, fallback: string): string {
  const slug = String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SEGMENT)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/**
 * The isolated feature branch a chat's worktree must have checked out:
 * `<github username>/<topic>`.
 *
 * The owner is the GitHub account the push will actually be made as (from the
 * gh integration, or `gh auth status`) — pushing `claw/...` while authenticated
 * as `ohdsi-trex` produced branches nobody could attribute. The topic comes
 * from the chat's title.
 *
 * NOTE: this is NOT derivable from the chat id alone, which is why
 * chat_worktree.ts persists the result on `devx.chats.worktree_branch`: the
 * reuse guard has to compare a later turn's worktree against the SAME name,
 * and a chat title can be renamed between turns.
 */
export function chatWorktreeBranch(owner: string | null | undefined, topic: string | null | undefined): string {
  return `${branchSlug(owner, LEGACY_BRANCH_OWNER)}/${branchSlug(topic, "work")}`;
}

/** The `claw/<chat id>` name used before branches carried an owner and topic. */
export function legacyChatWorktreeBranch(chatId: string): string {
  return `${LEGACY_BRANCH_OWNER}/${String(chatId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, MAX_SEGMENT)}`;
}

/**
 * Paths devx itself writes INTO the user's repo. None of them are in that
 * repo's .gitignore — they are our runtime scratch, not its source — so
 * `git status` reports them as untracked and they used to count as
 * "uncommitted changes".
 *
 * That wedged real chats permanently: a worktree left on the coder's own
 * feature branch with nothing but `attachments/` and `.devServer/` present was
 * refused as "2 uncommitted change(s) — cannot restore the chat branch without
 * risking them", on that turn and every turn after. The coder could not repair
 * it either, because ensureChatWorktree throws BEFORE the coder starts.
 *
 *  - `attachments/`  — materializeAttachments (attachments.ts) drops chat
 *                      uploads here so the coder can Read them.
 *  - `.devServer/`   — the dev server's generated TLS cert dir.
 *  - `.worktrees/`   — where we put the per-chat worktrees themselves.
 */
export const DEVX_ARTIFACT_PATHS: readonly string[] = Object.freeze([
  "attachments/",
  ".devServer/",
  ".worktrees/",
  // Mockup/verification PNGs on their way to a channel (postScreenshots). They
  // are deliberately never committed — see the screenshotting-mockups skill —
  // so they would otherwise sit untracked forever and block every later turn.
  "trex/screenshots/",
]);

/** Is this path one of devx's own artifacts (at the root or nested)? */
function isDevxArtifact(path: string): boolean {
  const p = String(path).replace(/^"|"$/g, "");
  return DEVX_ARTIFACT_PATHS.some((a) => p === a || p.startsWith(a) || p.includes(`/${a}`));
}

/**
 * How many changed files in a worktree could plausibly be someone's work.
 *
 * Only UNTRACKED (`??`) devx artifacts are discounted. If a repo actually
 * tracks a path of that name, a modification to it is real content and is
 * counted — the point is to ignore scratch we created, not to ignore a whole
 * directory name.
 */
export function foreignDirtCount(files: Array<{ path: string; status: string }>): number {
  return files.filter((f) => !(f.status === "??" && isDevxArtifact(f.path))).length;
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
  | { rename: true; from: string }
  | { restore: true; foreignBranch: string }
  | { error: string };

/**
 * Like `worktreeReuseError`, but classifies the non-matching cases instead of
 * failing all of them.
 *
 * `rename`: the worktree is on this chat's own LEGACY branch name. Its commits
 * are the chat's own work, so `git branch -m` moves the branch onto the new
 * name with the working tree and index untouched — dirtiness is irrelevant and
 * deliberately not consulted here.
 *
 * `restore`: some other branch with a CLEAN tree. The coder itself legitimately
 * checks out other branches inside its own worktree (e.g. an existing PR branch
 * it iterates on) and leaves them checked out at turn end — refusing the NEXT
 * turn for that made every second turn of a work-on-existing-PR task fail. With
 * a clean tree nothing can leak across tasks, so the caller just switches back.
 *
 * A DIRTY tree on a foreign branch stays a hard error: those uncommitted
 * changes belong to *some* branch, and silently carrying them onto the chat
 * branch (or discarding them) would be the exact contamination this guard
 * exists to stop.
 */
export function worktreeReuseDecision(
  entries: Array<{ path: string; branch: string | null; detached: boolean }>,
  worktreePath: string,
  expectedBranch: string,
  dirtyFileCount: number,
  legacyBranch?: string,
): WorktreeReuseDecision {
  const entry = entries.find((e) => e.path === worktreePath);
  if (!entry) return { error: `directory exists but git does not list it as a worktree` };
  if (entry.detached) {
    // A detached head with a CLEAN tree is recoverable, and treating it as a
    // hard error wedged a chat permanently: a coder that ran `git rebase` on a
    // wrong base left its worktree detached, so the guard refused it on that
    // turn AND on every turn after — nothing in the system ever puts a
    // worktree back on its branch, so the chat could not recover on its own.
    // Clean means there is nothing to lose by checking the chat branch out
    // again. Dirty stays an error for the same reason a dirty foreign branch
    // does: those edits belong to some other state.
    if (dirtyFileCount === 0) return { restore: true, foreignBranch: "a detached HEAD" };
    return {
      error: `worktree is detached (expected branch ${expectedBranch}) with ${dirtyFileCount} ` +
        `uncommitted change(s) — cannot restore the chat branch without risking them`,
    };
  }
  if (entry.branch === expectedBranch) return { ok: true };
  if (legacyBranch && entry.branch === legacyBranch && legacyBranch !== expectedBranch) {
    return { rename: true, from: legacyBranch };
  }
  if (dirtyFileCount === 0) {
    return { restore: true, foreignBranch: entry.branch ?? "no branch" };
  }
  return {
    error: `worktree has '${entry.branch ?? "no branch"}' checked out (expected ${expectedBranch}) ` +
      `with ${dirtyFileCount} uncommitted change(s) — cannot restore the chat branch without risking them`,
  };
}
