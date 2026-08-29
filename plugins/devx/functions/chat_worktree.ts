// @ts-nocheck - Deno edge function
import {
  ensureWorktreeParent,
  getAppWorkspacePath,
  getRunWorktreePath,
} from "./tools/workspace.ts";
import { gitOps } from "./git.ts";
import {
  foreignDirtCount,
  legacyChatWorktreeBranch,
  quarantinePath,
  worktreeReuseDecision,
} from "./worktree_guard.ts";
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

    // A branch based on a root with no .gitignore can never come clean: every
    // build artifact reads as untracked dirt, on this turn and forever. That is
    // not a state to repair, it is a worktree to abandon — see poisonedBaseReason.
    const poisoned = await poisonedBaseReason(repoRoot, worktree, entries);
    if (poisoned) {
      return await quarantineAndRecreate(userId, appId, chatId, repoRoot, worktree, branch, poisoned);
    }

    if ("error" in decision) {
      // Nothing here is actionable (git does not recognise the directory as a
      // worktree at all), so move it aside and build a fresh one rather than
      // failing this turn and every turn after it.
      return await quarantineAndRecreate(userId, appId, chatId, repoRoot, worktree, branch, decision.error);
    }
    if ("rename" in decision) {
      console.warn(
        `[chat-worktree] migrating chat worktree ${worktree} from '${decision.from}' to '${branch}'`,
      );
      await gitOps.branchRename(worktree, decision.from, branch);
    }
    if ("preserve" in decision) {
      // Real uncommitted work on a branch that is not this chat's. Stash it —
      // named, findable, on the branch it belongs to — and only then switch.
      const stashed = await gitOps.stashPush(
        worktree,
        `devx-preserved-chat-${chatId}-from-${decision.foreignBranch}`,
      );
      const ref = stashed ? await gitOps.latestStash(worktree) : null;
      console.warn(
        `[chat-worktree] chat worktree ${worktree} was left on '${decision.foreignBranch}' with ` +
          `${decision.dirtyFileCount} uncommitted change(s) — ` +
          (stashed
            ? `stashed as ${ref ?? "(ref unknown)"} before restoring ${branch}`
            : `nothing tracked to stash; restoring ${branch}`),
      );
    }
    if ("restore" in decision) {
      console.warn(
        `[chat-worktree] chat worktree ${worktree} was left on '${decision.foreignBranch}' ` +
          `(clean tree) — restoring ${branch}`,
      );
    }
    if ("restore" in decision || "preserve" in decision) {
      // The chat's branch can be GONE: a coder that renames its worktree's
      // branch to something it likes better (`git branch -m`) leaves nothing to
      // switch back to, and the switch below then fails for a second, far more
      // confusing reason. Recreate it at the current commit — that is this
      // chat's own work lineage, which is exactly where the branch belongs.
      if (!(await gitOps.refExists(worktree, `refs/heads/${branch}`))) {
        console.warn(`[chat-worktree] ${branch} no longer exists — recreating it at the worktree's HEAD`);
        await gitOps.branchCreate(worktree, branch);
      }
      try {
        await gitOps.branchSwitch(worktree, branch);
      } catch (e) {
        // Usually an untracked file that the chat branch also tracks. Nothing
        // left to try in place; quarantine keeps the tree for recovery.
        return await quarantineAndRecreate(
          userId, appId, chatId, repoRoot, worktree, branch,
          `could not switch back to ${branch}: ${e?.message || e}`,
        );
      }
    }
    return worktree;
  }
  return await createChatWorktree(userId, appId, repoRoot, worktree, branch);
}

/** Build a brand-new worktree for this chat at `worktree`, on `branch`. */
async function createChatWorktree(
  userId: string,
  appId: string,
  repoRoot: string,
  worktree: string,
  branch: string,
): Promise<string> {
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
    // The branch may already exist (a quarantined worktree left it behind, or a
    // previous attempt got partway). `git worktree add -b` fails on an existing
    // branch, so reuse it in that case instead of inventing another name.
    if (await gitOps.refExists(repoRoot, `refs/heads/${branch}`)) {
      await gitOps.worktreeAddExisting(repoRoot, worktree, branch);
    } else {
      await gitOps.worktreeAdd(repoRoot, worktree, branch, startPoint);
    }
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

/**
 * Why this worktree's checked-out branch can never come clean, or null.
 *
 * A branch based on a root that carries no `.gitignore` reports every build
 * artifact — `node_modules/`, generated dirs — as untracked dirt, forever. That
 * is what `origin/main` did in Data2Evidence: an unrelated root whose whole
 * history is one "Initial commit" with no ignore file, so a worktree that landed
 * there was locked permanently and no amount of stashing or switching helped.
 *
 * Only flagged when the repo's DEFAULT branch does have one — a project that
 * genuinely ships no .gitignore is not broken, it is just that kind of project.
 */
async function poisonedBaseReason(
  repoRoot: string,
  worktree: string,
  entries: Array<{ path: string; branch: string | null; detached: boolean }>,
): Promise<string | null> {
  const entry = entries.find((e) => e.path === worktree);
  if (!entry || entry.detached || !entry.branch) return null;
  try {
    if (await gitOps.pathExistsInRef(worktree, entry.branch, ".gitignore")) return null;
    const base = await resolveBaseBranch(repoRoot);
    if (!(await gitOps.pathExistsInRef(repoRoot, `origin/${base}`, ".gitignore"))) return null;
    return `branch '${entry.branch}' has no .gitignore while origin/${base} does — ` +
      `it is based on an unrelated root, so every build artifact reads as an uncommitted change`;
  } catch {
    // Never let this diagnostic turn into the failure. If we cannot tell, say
    // nothing and let the normal decision path run.
    return null;
  }
}

/**
 * Move an unusable worktree aside and build a clean one in its place.
 *
 * The whole point of this plan: an unrecognised state used to THROW, and the
 * throw happens before the coder starts — so nothing inside the session could
 * repair it and the chat was dead until a human with container access
 * intervened. Quarantine keeps every commit, stash and untracked file in the
 * moved directory while letting the next message proceed normally.
 */
async function quarantineAndRecreate(
  userId: string,
  appId: string,
  chatId: string,
  repoRoot: string,
  worktree: string,
  branch: string,
  reason: string,
): Promise<string> {
  // Timestamp, then a counter, so two quarantines in the same second cannot
  // collide and clobber the earlier one's contents.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let dest = quarantinePath(worktree, stamp);
  for (let attempt = 1; attempt < 50; attempt++) {
    try {
      await Deno.stat(dest);
      dest = quarantinePath(worktree, stamp, attempt);
    } catch {
      break;
    }
  }
  try {
    await Deno.rename(worktree, dest);
  } catch (err) {
    // Only now is this fatal: we could neither use the worktree nor set it
    // aside, so there is no clean tree to give the coder.
    throw new Error(
      `chat worktree ${worktree} is unusable (${reason}) and could not be quarantined ` +
        `(${err?.message || err}). Refusing to run the coder outside its isolated branch.`,
    );
  }
  // Drop git's now-dangling registration so `worktree add` can reuse the path.
  await gitOps.worktreePrune(repoRoot);
  console.warn(
    `[chat-worktree] quarantined ${worktree} -> ${dest} (${reason}); ` +
      `building a fresh worktree for chat ${chatId}`,
  );
  return await createChatWorktree(userId, appId, repoRoot, worktree, branch);
}
