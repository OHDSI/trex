// @ts-nocheck - Deno edge function
/**
 * GET /apps/:appId/worktrees/health — what the chat-worktree guard would do to
 * each of an app's per-chat worktrees, without doing it.
 *
 * Four worktrees sat locked in a live deployment and only surfaced because
 * someone went looking; the only way to see the state at all was `docker exec`
 * plus a hand-written shell loop. The classification here is
 * `classifyWorktreeHealth`, i.e. the guard's own decision function — an
 * operator view that disagreed with real behaviour would be worse than none.
 */
import { gitOps } from "../git.ts";
import { getAppWorkspacePath, getRunWorktreePath } from "../tools/workspace.ts";
import {
  classifyWorktreeHealth,
  foreignDirtCount,
  legacyChatWorktreeBranch,
} from "../worktree_guard.ts";

/** The pinned branch for a chat, or the legacy name when none is pinned. */
async function expectedBranchFor(chatId: string, sql): Promise<string> {
  try {
    const r = await sql(`SELECT worktree_branch FROM devx.chats WHERE id = $1`, [chatId]);
    const pinned = r.rows[0]?.worktree_branch;
    if (pinned) return String(pinned);
  } catch { /* column may predate V18 — fall through */ }
  return legacyChatWorktreeBranch(chatId);
}

export async function handleWorktreeHealthRoutes(
  path: string,
  method: string,
  _req: Request,
  userId: string,
  sql,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const match = path.match(/\/apps\/([^/]+)\/worktrees\/health$/);
  if (!match || method !== "GET") return null;

  const appId = match[1];
  const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
  if (appCheck.rows.length === 0) {
    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }

  const repoRoot = getAppWorkspacePath(userId, appId);
  try {
    const entries = await gitOps.worktreeList(repoRoot);
    const worktrees = [];
    for (const entry of entries) {
      // Per-chat worktrees only. The app's main checkout is not one of these
      // and has no chat branch to be measured against.
      const m = entry.path.match(/\/\.worktrees\/([^/]+)$/);
      if (!m) continue;
      const chatId = m[1];
      // A quarantined directory is a corpse we deliberately kept, not a live
      // worktree — reporting it as unhealthy would make the list never go green.
      if (chatId.includes(".quarantine-")) continue;
      const expected = await expectedBranchFor(chatId, sql);
      const dirtyFileCount = await gitOps.status(entry.path)
        .then((st) => foreignDirtCount(st.files ?? []))
        .catch(() => Number.MAX_SAFE_INTEGER);
      worktrees.push(
        classifyWorktreeHealth(
          entries,
          entry.path,
          chatId,
          expected,
          dirtyFileCount,
          legacyChatWorktreeBranch(chatId),
        ),
      );
      // Cross-check the path we derive from the chat id against the one git
      // reports; a mismatch means the two naming schemes have drifted and the
      // guard would be comparing against a worktree that is not this one.
      const derived = getRunWorktreePath(userId, appId, chatId);
      if (derived !== entry.path) {
        worktrees[worktrees.length - 1].detail +=
          ` (path mismatch: guard expects ${derived})`;
      }
    }
    const summary = {
      total: worktrees.length,
      ok: worktrees.filter((w) => w.verdict === "ok").length,
      selfHeals: worktrees.filter((w) => w.verdict === "self-heals").length,
      quarantines: worktrees.filter((w) => w.verdict === "quarantines").length,
    };
    return Response.json({ summary, worktrees }, { headers: corsHeaders });
  } catch (err) {
    return Response.json(
      { error: err?.message || String(err), worktrees: [] },
      { status: 500, headers: corsHeaders },
    );
  }
}
