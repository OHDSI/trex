import { assertEquals } from "jsr:@std/assert";
import { chatWorktreeBranch, worktreeReuseError } from "./worktree_guard.ts";

Deno.test("chatWorktreeBranch: deterministic, sanitized, capped", () => {
  assertEquals(chatWorktreeBranch("abc-123"), "claw/abc-123");
  assertEquals(chatWorktreeBranch("a b/c"), "claw/a_b_c");
  // 40-char cap on the sanitized id
  assertEquals(chatWorktreeBranch("x".repeat(60)), `claw/${"x".repeat(40)}`);
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
