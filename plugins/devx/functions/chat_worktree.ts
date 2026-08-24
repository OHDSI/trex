// @ts-nocheck - Deno edge function
import {
  ensureWorktreeParent,
  getAppWorkspacePath,
  getRunWorktreePath,
} from "./tools/workspace.ts";
import { gitOps } from "./git.ts";
import { chatWorktreeBranch, worktreeReuseDecision } from "./worktree_guard.ts";

// Pin a chat to a stable, isolated git worktree so a feature's work persists
// across turns — each /stream turn otherwise resets the coder's cwd to the app
// root — and parallel chats on the same app don't collide on one working tree.
// Returns null ONLY when the app is not a git repo (nothing to branch from —
// the shared workspace is then the only tree). Any other failure THROWS:
// silently continuing on the shared app workspace put an isolated task's edits
// into whatever branch/state the shared tree happened to hold (cross-task
// contamination), and a reused worktree is trusted only after verifying its
// checked-out branch is this chat's own branch. The branch/worktree are keyed
// deterministically on the chat id, created once and reused thereafter.

export async function ensureChatWorktree(userId: string, appId: string, chatId: string): Promise<string | null> {
  const repoRoot = getAppWorkspacePath(userId, appId);
  try {
    await Deno.stat(`${repoRoot}/.git`);
  } catch {
    return null; // not a git repo — nothing to branch from
  }
  const worktree = getRunWorktreePath(userId, appId, chatId);
  const branch = chatWorktreeBranch(chatId);
  let exists = false;
  try {
    await Deno.stat(worktree);
    exists = true;
  } catch { /* create below */ }
  if (exists) {
    // Never trust bare directory existence: verify the worktree is registered
    // and has THIS chat's branch checked out before reusing it. A foreign
    // branch with a CLEAN tree is the coder's own doing (it checks out e.g. an
    // existing PR branch mid-turn and leaves it checked out) — restore the
    // chat branch instead of failing the turn. A status failure counts as
    // dirty: when we cannot PROVE the tree is clean, keep refusing.
    const entries = await gitOps.worktreeList(repoRoot);
    const dirtyCount = await gitOps.status(worktree)
      .then((s) => s.files.length)
      .catch(() => Number.MAX_SAFE_INTEGER);
    const decision = worktreeReuseDecision(entries, worktree, branch, dirtyCount);
    if ("error" in decision) {
      throw new Error(
        `chat worktree ${worktree} is unusable: ${decision.error}. ` +
          `Refusing to run the coder outside its isolated branch.`,
      );
    }
    if ("restore" in decision) {
      console.warn(
        `[claude_code_agent] chat worktree ${worktree} was left on '${decision.foreignBranch}' ` +
          `(clean tree) — restoring ${branch}`,
      );
      await gitOps.branchSwitch(worktree, branch);
    }
    return worktree;
  }
  try {
    await ensureWorktreeParent(userId, appId);
    // Base the feature worktree on the latest origin/develop so work always
    // starts from an up-to-date tree, not whatever the app workspace was left at.
    let startPoint: string | undefined;
    try {
      await gitOps.fetch(repoRoot, "origin", "develop");
      startPoint = "origin/develop";
    } catch (e) {
      console.warn("[claude_code_agent] fetch origin/develop failed; basing worktree on current HEAD:", e?.message || e);
    }
    await gitOps.worktreeAdd(repoRoot, worktree, branch, startPoint);
    return worktree;
  } catch (err) {
    // Do NOT fall back to the shared app workspace — that is where other
    // branches'/tasks' state lives. Fail the turn loudly instead.
    throw new Error(
      `could not create the isolated worktree for this chat (${err?.message || err}). ` +
        `Refusing to run the coder on the shared app workspace.`,
    );
  }
}
