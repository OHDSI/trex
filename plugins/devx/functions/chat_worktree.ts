// @ts-nocheck - Deno edge function
import {
  ensureWorktreeParent,
  getAppWorkspacePath,
  getRunWorktreePath,
} from "./tools/workspace.ts";
import { gitOps } from "./git.ts";
import { foreignDirtCount, legacyChatWorktreeBranch, worktreeReuseDecision } from "./worktree_guard.ts";
import { resolveChatBranch } from "./chat_branch.ts";

// Pin a chat to a stable, isolated git worktree so a feature's work persists
// across turns — each /stream turn otherwise resets the coder's cwd to the app
// root — and parallel chats on the same app don't collide on one working tree.
// Returns null ONLY when the app is not a git repo (nothing to branch from —
// the shared workspace is then the only tree). Any other failure THROWS:
// silently continuing on the shared app workspace put an isolated task's edits
// into whatever branch/state the shared tree happened to hold (cross-task
// contamination), and a reused worktree is trusted only after verifying its
// checked-out branch is this chat's own branch. The worktree directory is keyed
// on the chat id; the branch is `<github username>/<topic>`, pinned on
// devx.chats.worktree_branch the first time it is computed (see chat_branch.ts).

/**
 * The branch this repo's work is based on and PRs target.
 *
 * Resolved from the remote rather than assumed. Data2Evidence has BOTH `main`
 * and `develop`, and they share no history at all (`git merge-base
 * origin/main origin/develop` is empty) — a coder that guessed `main` got
 * "no history in common" from `gh pr create` and a rebase reporting 2137
 * unrelated commits, and left its worktree detached mid-rebase.
 */
export async function resolveBaseBranch(repoRoot: string): Promise<string> {
  return await gitOps.defaultBranch(repoRoot);
}

export async function ensureChatWorktree(
  userId: string,
  appId: string,
  chatId: string,
  sqlFn?,
): Promise<string | null> {
  const repoRoot = getAppWorkspacePath(userId, appId);
  try {
    await Deno.stat(`${repoRoot}/.git`);
  } catch {
    return null; // not a git repo — nothing to branch from
  }
  const worktree = getRunWorktreePath(userId, appId, chatId);
  const legacyBranch = legacyChatWorktreeBranch(chatId);
  const existingBranches = await gitOps.branchList(repoRoot)
    .then((b) => b.branches)
    .catch(() => []);
  const branch = await resolveChatBranch(userId, chatId, repoRoot, existingBranches, sqlFn);
  let exists = false;
  try {
    await Deno.stat(worktree);
    exists = true;
  } catch { /* create below */ }
  if (exists) {
    // Never trust bare directory existence: verify the worktree is registered
    // and has THIS chat's branch checked out before reusing it. Its own LEGACY
    // branch name is renamed onto the new scheme; a foreign branch with a CLEAN
    // tree is the coder's own doing (it checks out e.g. an existing PR branch
    // mid-turn and leaves it checked out) — restore the chat branch instead of
    // failing the turn. A status failure counts as dirty: when we cannot PROVE
    // the tree is clean, keep refusing.
    //
    // Clear a half-finished rebase/merge/cherry-pick FIRST. One left in flight
    // detaches the head and checks the other side's tree out, so the worktree
    // reads as detached with thousands of uncommitted changes — which the
    // decision below can only refuse, on this turn and on every turn after,
    // because nothing else in the system ever puts a worktree back on its
    // branch. Aborting restores the branch and tree the operation started from,
    // which is exactly the state the turn should resume in.
    const inProgress = await gitOps.inProgressOperation(worktree).catch(() => null);
    if (inProgress) {
      const aborted = await gitOps.abortOperation(worktree, inProgress);
      console.warn(
        `[chat-worktree] ${worktree} had a ${inProgress} in progress — ` +
          (aborted ? "aborted it to resume on the chat branch" : "could not abort it"),
      );
    }
    const entries = await gitOps.worktreeList(repoRoot);
    // devx's own scratch (attachments/, .devServer/) does not count — see
    // foreignDirtCount. A status failure counts as maximally dirty: when we
    // cannot PROVE the tree is clean, keep refusing.
    const dirtyCount = await gitOps.status(worktree)
      .then((st) => foreignDirtCount(st.files ?? []))
      .catch(() => Number.MAX_SAFE_INTEGER);
    const decision = worktreeReuseDecision(entries, worktree, branch, dirtyCount, legacyBranch);
    if ("error" in decision) {
      throw new Error(
        `chat worktree ${worktree} is unusable: ${decision.error}. ` +
          `Refusing to run the coder outside its isolated branch.`,
      );
    }
    if ("rename" in decision) {
      console.warn(
        `[chat-worktree] migrating chat worktree ${worktree} from '${decision.from}' to '${branch}'`,
      );
      await gitOps.branchRename(worktree, decision.from, branch);
    }
    if ("restore" in decision) {
      console.warn(
        `[chat-worktree] chat worktree ${worktree} was left on '${decision.foreignBranch}' ` +
          `(clean tree) — restoring ${branch}`,
      );
      // The chat's branch can be GONE: a coder that renames its worktree's
      // branch to something it likes better (`git branch -m`) leaves nothing to
      // switch back to, and the switch below then fails for a second, far more
      // confusing reason. Recreate it at the current commit — that is this
      // chat's own work lineage, which is exactly where the branch belongs.
      if (!(await gitOps.refExists(worktree, `refs/heads/${branch}`))) {
        console.warn(`[chat-worktree] ${branch} no longer exists — recreating it at the worktree's HEAD`);
        await gitOps.branchCreate(worktree, branch);
      }
      await gitOps.branchSwitch(worktree, branch);
    }
    return worktree;
  }
  try {
    await ensureWorktreeParent(userId, appId);
    // Base the feature worktree on the remote's own default branch so work
    // always starts from an up-to-date tree, not whatever the app workspace was
    // left at — and not a branch we guessed (see resolveBaseBranch).
    //
    // A failed fetch used to warn and silently fall through to the repo's
    // current HEAD. That HEAD is the SHARED app workspace's — some other task's
    // branch, or a stale checkout weeks behind — so the chat then built its
    // whole feature on the wrong base and only found out at review or push
    // time, which is how branches ended up carrying commits they never
    // authored. There is no safe silent fallback here: use the previously
    // fetched base if one exists (stale, but a real base, and said so loudly),
    // otherwise fail the turn.
    const baseBranch = await resolveBaseBranch(repoRoot);
    const startPoint = `origin/${baseBranch}`;
    try {
      await gitOps.fetch(repoRoot, "origin", baseBranch);
    } catch (e) {
      if (!(await gitOps.refExists(repoRoot, startPoint))) {
        throw new Error(
          `cannot fetch origin/${baseBranch} (${e?.message || e}) and no local copy exists to branch from`,
        );
      }
      console.warn(
        `[chat-worktree] fetch origin/${baseBranch} failed (${e?.message || e}); ` +
          `basing ${branch} on the last fetched ${startPoint} ` +
          `(${await gitOps.revParse(repoRoot, startPoint)}) — it may be behind the remote`,
      );
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
