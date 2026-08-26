// @ts-nocheck - Deno edge function
import {
  ensureWorktreeParent,
  getAppWorkspacePath,
  getRunWorktreePath,
} from "./tools/workspace.ts";
import { gitOps } from "./git.ts";
import { legacyChatWorktreeBranch, worktreeReuseDecision } from "./worktree_guard.ts";
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

/** The branch new worktrees are based on. */
const BASE_BRANCH = "develop";

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
    const entries = await gitOps.worktreeList(repoRoot);
    const dirtyCount = await gitOps.status(worktree)
      .then((s) => s.files.length)
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
      await gitOps.branchSwitch(worktree, branch);
    }
    return worktree;
  }
  try {
    await ensureWorktreeParent(userId, appId);
    // Base the feature worktree on origin/develop so work always starts from an
    // up-to-date tree, not whatever the app workspace was left at.
    //
    // A failed fetch used to warn and silently fall through to the repo's
    // current HEAD. That HEAD is the SHARED app workspace's — some other task's
    // branch, or a stale checkout weeks behind — so the chat then built its
    // whole feature on the wrong base and only found out at review or push
    // time, which is how branches ended up carrying commits they never
    // authored. There is no safe silent fallback here: use a previously
    // fetched origin/develop if one exists (stale, but a real base, and said
    // so loudly), otherwise fail the turn.
    const startPoint = `origin/${BASE_BRANCH}`;
    try {
      await gitOps.fetch(repoRoot, "origin", BASE_BRANCH);
    } catch (e) {
      if (!(await gitOps.refExists(repoRoot, startPoint))) {
        throw new Error(
          `cannot fetch origin/${BASE_BRANCH} (${e?.message || e}) and no local copy exists to branch from`,
        );
      }
      console.warn(
        `[chat-worktree] fetch origin/${BASE_BRANCH} failed (${e?.message || e}); ` +
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
