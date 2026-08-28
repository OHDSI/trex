import { assertEquals } from "jsr:@std/assert";
import { classifyWorktreeHealth } from "../worktree_guard.ts";

const WT = "/ws/u1/app1/.worktrees/chat-1";
const EXPECTED = "ohdsi-trex/add-thing";

/**
 * The verdicts are asserted through classifyWorktreeHealth rather than by
 * booting the route, because the route is a thin loop over exactly this — and
 * this is the part that must not drift from the guard's real behaviour.
 */
Deno.test("classifyWorktreeHealth: a worktree on its own branch is ok", () => {
  const h = classifyWorktreeHealth(
    [{ path: WT, branch: EXPECTED, detached: false }],
    WT,
    "chat-1",
    EXPECTED,
    0,
  );
  assertEquals(h.verdict, "ok");
  assertEquals(h.branch, EXPECTED);
  assertEquals(h.chatId, "chat-1");
});

Deno.test("classifyWorktreeHealth: dirty on its own branch is still ok — the dirt is this chat's", () => {
  const h = classifyWorktreeHealth(
    [{ path: WT, branch: EXPECTED, detached: false }],
    WT,
    "chat-1",
    EXPECTED,
    12,
  );
  assertEquals(h.verdict, "ok");
});

Deno.test("classifyWorktreeHealth: the four production states all self-heal now", () => {
  // c9545b0f — foreign branch, clean (only devx scratch, already discounted)
  assertEquals(
    classifyWorktreeHealth(
      [{ path: WT, branch: "ohdsi-trex/whiterabbit-scan-restore", detached: false }],
      WT,
      "chat-1",
      EXPECTED,
      0,
    ).verdict,
    "self-heals",
  );
  // 56c60151 — foreign branch, real uncommitted work → stashed, not refused
  const preserved = classifyWorktreeHealth(
    [{ path: WT, branch: "ohdsi-trex/disclaimer-audit-log", detached: false }],
    WT,
    "chat-1",
    EXPECTED,
    2,
  );
  assertEquals(preserved.verdict, "self-heals");
  assertEquals(preserved.detail.includes("stashed"), true);
  // be8e540d — detached mid-rebase, tree dirty
  assertEquals(
    classifyWorktreeHealth([{ path: WT, branch: null, detached: true }], WT, "chat-1", EXPECTED, 3995).verdict,
    "self-heals",
  );
  // legacy claw/<id> name → renamed onto the pinned scheme
  const legacy = classifyWorktreeHealth(
    [{ path: WT, branch: "claw/chat-1", detached: false }],
    WT,
    "chat-1",
    EXPECTED,
    0,
    "claw/chat-1",
  );
  assertEquals(legacy.verdict, "self-heals");
  assertEquals(legacy.detail.includes("renamed"), true);
});

Deno.test("classifyWorktreeHealth: only an unregistered directory reports as quarantining", () => {
  const h = classifyWorktreeHealth([], WT, "chat-1", EXPECTED, 0);
  assertEquals(h.verdict, "quarantines");
  assertEquals(h.detail, "directory exists but git does not list it as a worktree");
  // Nothing to report a branch for — must be null rather than a stale guess.
  assertEquals(h.branch, null);
});

Deno.test("classifyWorktreeHealth: a detached worktree reports no branch", () => {
  const h = classifyWorktreeHealth([{ path: WT, branch: null, detached: true }], WT, "chat-1", EXPECTED, 0);
  assertEquals(h.branch, null);
  assertEquals(h.verdict, "self-heals");
});
