// @ts-nocheck - Deno edge function
/**
 * Resolves — and then PINS — the `<github username>/<topic>` branch name a
 * chat's isolated worktree runs on.
 *
 * Why pinned rather than derived: `chat_worktree.ts`'s reuse guard compares a
 * later turn's worktree against the branch name this module returns, so the
 * name has to be identical on every turn of a chat. The topic comes from the
 * chat title, which a user can rename mid-chat, and the owner comes from
 * whichever GitHub account is authenticated, which can be re-linked. Deriving
 * on each turn would therefore make an existing worktree look like it had a
 * foreign branch checked out. The first turn computes the name and writes it to
 * `devx.chats.worktree_branch`; every later turn reads it back.
 */
import { chatWorktreeBranch, legacyChatWorktreeBranch } from "./worktree_guard.ts";
import { parseGhAccount } from "./gh_status.ts";
import { duckdb, escapeSql } from "./duckdb.ts";

/**
 * The GitHub account pushes from this workspace will be attributed to.
 *
 * Order matters: the devx `github` integration is the account the user linked
 * in Settings, so it wins. The gh CLI's own login is the fallback because in
 * the deployed facilitator setup nobody links an integration — the sidecar is
 * simply logged in as a machine account (`ohdsi-trex`), and that is the account
 * the push actually uses. Returns null when neither is available; the caller
 * then falls back to the legacy owner rather than guessing.
 */
export async function resolveBranchOwner(userId: string, repoRoot: string, sqlFn): Promise<string | null> {
  if (sqlFn) {
    try {
      const res = await sqlFn(
        `SELECT metadata FROM devx.integrations WHERE user_id = $1 AND provider = 'github' LIMIT 1`,
        [userId],
      );
      const raw = res.rows[0]?.metadata;
      const meta = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (meta?.username) return String(meta.username);
    } catch (e) {
      console.warn("[chat-branch] could not read the github integration:", e?.message || e);
    }
  }
  try {
    const json = await duckdb(
      `SELECT * FROM trex_devx_run_command('${escapeSql(repoRoot)}', '${escapeSql("gh auth status")}')`,
    );
    const r = JSON.parse(json);
    // `gh auth status` writes its report to stderr and exits non-zero when any
    // configured host is unauthenticated, so the account is parsed from the
    // output regardless of `ok` — an account line is present or it is not.
    const account = parseGhAccount(String(r.output ?? ""));
    if (account) return account;
  } catch (e) {
    console.warn("[chat-branch] `gh auth status` did not yield an account:", e?.message || e);
  }
  return null;
}

/** The chat's title, which becomes the branch's topic segment. */
async function loadChatTitle(chatId: string, sqlFn): Promise<string | null> {
  if (!sqlFn) return null;
  try {
    const res = await sqlFn(`SELECT title FROM devx.chats WHERE id = $1`, [chatId]);
    const title = res.rows[0]?.title;
    // "New Chat" is the column default, not a topic — a branch called
    // `<user>/new-chat` says nothing and collides with every other unnamed
    // chat. Fall through to the chat id instead.
    if (!title || /^new chat$/i.test(String(title).trim())) return null;
    return String(title);
  } catch (e) {
    console.warn("[chat-branch] could not read the chat title:", e?.message || e);
    return null;
  }
}

/**
 * Make `candidate` unique against branches that already exist in the repo, by
 * appending a short chat-id suffix. Two chats titled the same way must not
 * land on one branch — that is the cross-task contamination the worktree guard
 * exists to prevent, arriving through the name instead of the tree.
 */
export function disambiguateBranch(candidate: string, taken: Iterable<string>, chatId: string): string {
  const existing = new Set(Array.from(taken, (b) => String(b).replace(/^\*?\s*/, "").trim()));
  if (!existing.has(candidate)) return candidate;
  const suffix = String(chatId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toLowerCase() || "chat";
  return `${candidate}-${suffix}`;
}

/**
 * Resolve the pinned branch for a chat, computing and persisting it on first
 * use. `existingBranches` is the repo's current branch list, used only to keep
 * a freshly computed name unique.
 *
 * Falls back to the legacy `claw/<chat id>` name whenever there is no sql
 * handle to read a title or persist a pin — without persistence a computed
 * name could differ next turn, and a wrong-but-stable name beats a
 * right-but-unstable one for the reuse guard.
 */
export async function resolveChatBranch(
  userId: string,
  chatId: string,
  repoRoot: string,
  existingBranches: string[],
  sqlFn,
): Promise<string> {
  if (!sqlFn) return legacyChatWorktreeBranch(chatId);

  try {
    const pinned = await sqlFn(`SELECT worktree_branch FROM devx.chats WHERE id = $1`, [chatId]);
    const value = pinned.rows[0]?.worktree_branch;
    if (value) return String(value);
  } catch (e) {
    // A missing column (migration not yet applied) must not take the coder
    // down: keep every chat on the name it already had.
    console.warn("[chat-branch] could not read the pinned branch; using the legacy name:", e?.message || e);
    return legacyChatWorktreeBranch(chatId);
  }

  const [owner, title] = await Promise.all([
    resolveBranchOwner(userId, repoRoot, sqlFn),
    loadChatTitle(chatId, sqlFn),
  ]);
  const branch = disambiguateBranch(
    chatWorktreeBranch(owner, title ?? chatId),
    existingBranches,
    chatId,
  );

  try {
    await sqlFn(`UPDATE devx.chats SET worktree_branch = $1 WHERE id = $2`, [branch, chatId]);
  } catch (e) {
    // Unpinnable means underivable next turn — fall back rather than hand out
    // a name the next turn's reuse guard will reject as foreign.
    console.warn("[chat-branch] could not pin the branch; using the legacy name:", e?.message || e);
    return legacyChatWorktreeBranch(chatId);
  }
  return branch;
}
