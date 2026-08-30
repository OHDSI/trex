// The session-creation-time scope agent.ts enforces: the tool allowlist
// filterTools applies and the workspace resolveWorkspace/toDevxCtx honour.
// Both come from agents.sessions (V14) and never from per-turn metadata, so
// these tests pin the two traps: an EMPTY allowlist means "no tools" (not
// "all tools"), and a declared workspace is honoured only when it is a value
// devx itself could have produced.
import { assert, assertEquals } from "jsr:@std/assert";
import { acceptDeclaredWorkspace, loadSessionScope, parseSessionScopeRow, peekSessionScope } from "./session_scope.ts";
import { getAppWorkspacePath, getRunWorktreePath, getWorkspacePath } from "../../functions/tools/workspace.ts";

const rows = (row: unknown) => () => Promise.resolve({ rows: row === undefined ? [] : [row] });

Deno.test("parseSessionScopeRow: a declared EMPTY allowlist is an empty array, not 'no allowlist'", () => {
  const scope = parseSessionScopeRow({ tool_allowlist: [], tool_allowlist_declared: true, workspace_path: "" });
  assertEquals(scope.allowedTools, []);
});

Deno.test("parseSessionScopeRow: an undeclared allowlist is undefined, whatever the array column holds", () => {
  assertEquals(parseSessionScopeRow({ tool_allowlist: ["Read"], tool_allowlist_declared: false }).allowedTools, undefined);
  assertEquals(parseSessionScopeRow({}).allowedTools, undefined);
  assertEquals(parseSessionScopeRow(undefined).allowedTools, undefined);
  // Only a strict `true` declares, same posture as V13's approver_reachable.
  assertEquals(parseSessionScopeRow({ tool_allowlist: ["Read"], tool_allowlist_declared: "true" }).allowedTools, undefined);
});

Deno.test("parseSessionScopeRow: a declared allowlist keeps only string entries", () => {
  const scope = parseSessionScopeRow({ tool_allowlist: ["Read", 7, null, "Grep"], tool_allowlist_declared: true });
  assertEquals(scope.allowedTools, ["Read", "Grep"]);
});

Deno.test("parseSessionScopeRow: an empty workspace_path is 'not declared'", () => {
  assertEquals(parseSessionScopeRow({ workspace_path: "" }).workspace, undefined);
  assertEquals(parseSessionScopeRow({ workspace_path: "/tmp/x" }).workspace, "/tmp/x");
  assertEquals(parseSessionScopeRow({ workspace_path: 7 }).workspace, undefined);
});

Deno.test("loadSessionScope: reads the row once per session and answers peek synchronously afterwards", async () => {
  let calls = 0;
  const sql = () => {
    calls++;
    return Promise.resolve({ rows: [{ tool_allowlist: ["Read"], tool_allowlist_declared: true, workspace_path: "" }] });
  };
  assertEquals(peekSessionScope("s-scope-load"), undefined);
  assertEquals((await loadSessionScope("s-scope-load", sql)).allowedTools, ["Read"]);
  assertEquals((await loadSessionScope("s-scope-load", sql)).allowedTools, ["Read"]);
  assertEquals(calls, 1);
  assertEquals(peekSessionScope("s-scope-load")?.allowedTools, ["Read"]);
});

// A deployment whose agents.sessions predates V14 has no such columns: the
// SELECT errors. That must read as "nothing declared" (today's behaviour),
// not fail every turn.
Deno.test("loadSessionScope: a failing read (pre-V14 columns) is nothing-declared, not a thrown turn", async () => {
  const sql = () => Promise.reject(new Error(`column "tool_allowlist" does not exist`));
  const scope = await loadSessionScope("s-scope-premigration", sql);
  assertEquals(scope.allowedTools, undefined);
  assertEquals(scope.workspace, undefined);
  assertEquals(peekSessionScope("s-scope-premigration")?.allowedTools, undefined);
});

Deno.test("loadSessionScope: a session with no row at all is nothing-declared", async () => {
  assertEquals(await loadSessionScope("s-scope-norow", rows(undefined)), {});
});

// ---------------------------------------------------------------------------
// acceptDeclaredWorkspace — the workspace is half of every consent scope key
// (core/server/agents/service/scope-key.ts), so a caller-supplied one decides
// which stored consents apply.
// ---------------------------------------------------------------------------

Deno.test("acceptDeclaredWorkspace: accepts exactly the run worktree devx itself produces", () => {
  const wt = getRunWorktreePath("u-ws", "app-ws", "run-1");
  assertEquals(acceptDeclaredWorkspace(wt, "u-ws", "app-ws"), wt);
});

Deno.test("acceptDeclaredWorkspace: rejects a traversal out of the managed area", () => {
  const wt = getRunWorktreePath("u-ws", "app-ws", "run-1");
  for (
    const bad of [
      `${getAppWorkspacePath("u-ws", "app-ws")}/.worktrees/../../../etc`,
      `${wt}/../../../../etc/passwd`,
      "/etc/passwd",
      "../../etc",
      `${wt}/nested`,
      `${wt}/`,
      "",
    ]
  ) {
    assertEquals(acceptDeclaredWorkspace(bad, "u-ws", "app-ws"), undefined, `${bad} must be rejected`);
  }
});

// The impersonation case: a bare workspace path is what ensureWorkspace /
// ensureAppWorkspace produce for a WHOLE app or user, so honouring one would
// let a session borrow another scope's stored consents wholesale.
Deno.test("acceptDeclaredWorkspace: rejects anything that could pass for another app's or user's workspace", () => {
  assertEquals(acceptDeclaredWorkspace(getAppWorkspacePath("u-ws", "app-ws"), "u-ws", "app-ws"), undefined);
  assertEquals(acceptDeclaredWorkspace(getAppWorkspacePath("u-ws", "other-app"), "u-ws", "app-ws"), undefined);
  assertEquals(acceptDeclaredWorkspace(getWorkspacePath("u-ws"), "u-ws", "app-ws"), undefined);
  // Another user's / another app's run worktree.
  assertEquals(acceptDeclaredWorkspace(getRunWorktreePath("u-other", "app-ws", "r"), "u-ws", "app-ws"), undefined);
  assertEquals(acceptDeclaredWorkspace(getRunWorktreePath("u-ws", "app-other", "r"), "u-ws", "app-ws"), undefined);
});

// The structural reason the impersonation case above cannot come back: no
// appId can produce a ".worktrees" segment, because sanitizeId rewrites ".".
Deno.test("acceptDeclaredWorkspace: an accepted worktree can never also be some app's own workspace", () => {
  assert(!getAppWorkspacePath("u-ws", ".worktrees").endsWith("/.worktrees"));
  assert(getRunWorktreePath("u-ws", "app-ws", "r").includes("/.worktrees/"));
});

Deno.test("acceptDeclaredWorkspace: no appId or no userId means there is no worktree to accept", () => {
  const wt = getRunWorktreePath("u-ws", "app-ws", "run-1");
  assertEquals(acceptDeclaredWorkspace(wt, "u-ws", undefined), undefined);
  assertEquals(acceptDeclaredWorkspace(wt, undefined, "app-ws"), undefined);
  assertEquals(acceptDeclaredWorkspace(undefined, "u-ws", "app-ws"), undefined);
});

Deno.test("acceptDeclaredWorkspace: the accepted value is absolute and NUL-free (a scope key is stored as text)", () => {
  const wt = acceptDeclaredWorkspace(getRunWorktreePath("u-ws", "app-ws", "run-1"), "u-ws", "app-ws");
  assert(wt && wt.startsWith("/"));
  assert(!wt.includes("\0"));
  // Not via getRunWorktreePath: it sanitizes, and what must be rejected here
  // is the RAW declared value nobody sanitized.
  assertEquals(acceptDeclaredWorkspace(`${getAppWorkspacePath("u-ws", "app-ws")}/.worktrees/run\0evil`, "u-ws", "app-ws"), undefined);
});
