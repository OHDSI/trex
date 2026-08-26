import { assertEquals } from "jsr:@std/assert";
import {
  branchSlug,
  chatWorktreeBranch,
  legacyChatWorktreeBranch,
  worktreeReuseDecision,
  worktreeReuseError,
} from "./worktree_guard.ts";

Deno.test("branchSlug: lowercases, collapses separators, caps, never returns empty", () => {
  assertEquals(branchSlug("Add Dataflow Trigger", "work"), "add-dataflow-trigger");
  assertEquals(branchSlug("  --Fix:: the/thing!! ", "work"), "fix-the-thing");
  // 40-char cap, and the cap must not leave a trailing separator behind.
  assertEquals(branchSlug("x".repeat(60), "work"), "x".repeat(40));
  assertEquals(branchSlug(`${"y".repeat(39)} tail`, "work"), "y".repeat(39));
  // Nothing usable left → fallback, so the segment is never empty (an empty
  // segment makes an invalid ref like "owner/").
  assertEquals(branchSlug("🎉🎉", "work"), "work");
  assertEquals(branchSlug(null, "work"), "work");
});

Deno.test("chatWorktreeBranch: <github username>/<topic>", () => {
  assertEquals(chatWorktreeBranch("ohdsi-trex", "Add data source UI plugin"), "ohdsi-trex/add-data-source-ui-plugin");
  // Owner is slugified too — a display name must not smuggle a second slash
  // into the ref and turn one segment into two.
  assertEquals(chatWorktreeBranch("OHDSI/Trex Bot", "topic"), "ohdsi-trex-bot/topic");
  // No account resolved → the legacy owner, so the name is still valid.
  assertEquals(chatWorktreeBranch(null, "topic"), "claw/topic");
  assertEquals(chatWorktreeBranch("owner", null), "owner/work");
});

Deno.test("legacyChatWorktreeBranch: reproduces the pre-rename names exactly", () => {
  assertEquals(legacyChatWorktreeBranch("abc-123"), "claw/abc-123");
  assertEquals(legacyChatWorktreeBranch("a b/c"), "claw/a_b_c");
  assertEquals(legacyChatWorktreeBranch("x".repeat(60)), `claw/${"x".repeat(40)}`);
});

// Regression (cross-branch contamination): a worktree directory must only be
// reused when git confirms it is a registered worktree with THIS chat's own
// branch checked out — bare directory existence proved nothing.
Deno.test("worktreeReuseError: valid entry passes; missing/detached/wrong-branch are rejected", () => {
  const wt = "/ws/u1/app1/.worktrees/chat-1";
  const branch = "claw/chat-1";
  const ok = [{ path: wt, branch, detached: false }];
  assertEquals(worktreeReuseError(ok, wt, branch), null);

  // Not registered with git at all.
  assertEquals(
    worktreeReuseError([], wt, branch),
    "directory exists but git does not list it as a worktree",
  );
  // Detached HEAD.
  assertEquals(
    worktreeReuseError([{ path: wt, branch: null, detached: true }], wt, branch),
    `worktree is detached (expected branch ${branch})`,
  );
  // Another chat's branch checked out — the incident case.
  assertEquals(
    worktreeReuseError([{ path: wt, branch: "claw/other-chat", detached: false }], wt, branch),
    `worktree has 'claw/other-chat' checked out (expected ${branch})`,
  );
});

// worktreeReuseDecision: the guard's recoverable path. The coder legitimately
// checks out an existing PR branch inside its own worktree and leaves it
// there; with a CLEAN tree the next turn restores the chat branch instead of
// failing (the PR-29 incident: every second turn of a work-on-existing-PR
// task died with "unusable worktree").
Deno.test("worktreeReuseDecision: own branch ok; clean foreign branch restores; dirty foreign branch errors", () => {
  const wt = "/ws/u1/app1/.worktrees/chat-1";
  const branch = "claw/chat-1";
  const onOwn = [{ path: wt, branch, detached: false }];
  const onPr = [{ path: wt, branch: "ohdsi-trex/some-pr-branch", detached: false }];

  assertEquals(worktreeReuseDecision(onOwn, wt, branch, 0), { ok: true });
  // Own branch + dirty tree is still fine — the dirt is this chat's own work.
  assertEquals(worktreeReuseDecision(onOwn, wt, branch, 3), { ok: true });
  // Foreign branch, clean tree → recoverable.
  assertEquals(
    worktreeReuseDecision(onPr, wt, branch, 0),
    { restore: true, foreignBranch: "ohdsi-trex/some-pr-branch" },
  );
  // Foreign branch, dirty tree → hard error naming the risk.
  assertEquals(
    worktreeReuseDecision(onPr, wt, branch, 2),
    {
      error: `worktree has 'ohdsi-trex/some-pr-branch' checked out (expected ${branch}) ` +
        `with 2 uncommitted change(s) — cannot restore the chat branch without risking them`,
    },
  );
  // This chat's own LEGACY name → rename, not "foreign branch". Dirtiness is
  // irrelevant: `git branch -m` leaves the working tree and index alone, and
  // those commits/edits are this chat's own work either way.
  const legacy = "claw/chat-1";
  const onLegacy = [{ path: wt, branch: legacy, detached: false }];
  const newName = "ohdsi-trex/add-thing";
  assertEquals(
    worktreeReuseDecision(onLegacy, wt, newName, 0, legacy),
    { rename: true, from: legacy },
  );
  assertEquals(
    worktreeReuseDecision(onLegacy, wt, newName, 7, legacy),
    { rename: true, from: legacy },
  );
  // Already on the pinned name and the legacy name happens to equal it: `ok`,
  // never a rename onto itself (git rejects that).
  assertEquals(worktreeReuseDecision(onLegacy, wt, legacy, 0, legacy), { ok: true });
  // Without a legacy name supplied, the old name is just another foreign branch.
  assertEquals(
    worktreeReuseDecision(onLegacy, wt, newName, 0),
    { restore: true, foreignBranch: legacy },
  );

  // Unregistered and detached stay hard errors regardless of cleanliness.
  assertEquals(
    worktreeReuseDecision([], wt, branch, 0),
    { error: `directory exists but git does not list it as a worktree` },
  );
  assertEquals(
    worktreeReuseDecision([{ path: wt, branch: null, detached: true }], wt, branch, 0),
    { error: `worktree is detached (expected branch ${branch})` },
  );
});
