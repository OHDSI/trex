// The session-creation-time scope agent.ts enforces: the tool allowlist
// filterTools applies and the workspace resolveWorkspace/toDevxCtx honour.
// Both come from agents.sessions (V14) and never from per-turn metadata, so
// these tests pin the two traps: an EMPTY allowlist means "no tools" (not
// "all tools"), and a declared workspace is honoured only when it is a value
// devx itself could have produced.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import {
  acceptDeclaredWorkspace,
  isUndefinedColumn,
  loadSessionScope,
  parseSessionScopeRow,
  peekSessionScope,
  peekSessionScopeForCtx,
} from "./session_scope.ts";
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
// SELECT errors with SQLSTATE 42703. THAT must read as "nothing declared"
// (today's behaviour), not fail every turn.
function pgError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

Deno.test("loadSessionScope: a failing read (pre-V14 columns) is nothing-declared, not a thrown turn", async () => {
  const sql = () => Promise.reject(pgError("42703", `column "tool_allowlist" does not exist`));
  const scope = await loadSessionScope("s-scope-premigration", sql);
  assertEquals(scope.allowedTools, undefined);
  assertEquals(scope.workspace, undefined);
  assertEquals(peekSessionScope("s-scope-premigration")?.allowedTools, undefined);
});

// Whole-branch review must-fix 3: the catch used to swallow ANY error into
// "nothing declared" AND cache it for the worker's lifetime. A transient blip on
// a session's first turn therefore dropped the allowlist and the workspace
// together - and sidecar_engine.ts awaits the same value, so a claude-code plan
// run would then get the full SDK preset and ensureAppWorkspace, mutating the
// MAIN app tree with unrestricted tools. Failing the turn is the same fail-safe
// posture agent.ts takes on a cold snapshot.
Deno.test("loadSessionScope: a transient read failure fails the turn rather than silently unrestricting it", async () => {
  const sql = () => Promise.reject(pgError("57P01", "terminating connection due to administrator command"));
  await assertRejects(() => loadSessionScope("s-scope-blip", sql), Error, "terminating connection");
  // And it is NOT cached: the next turn re-reads and gets the real scope.
  assertEquals(peekSessionScope("s-scope-blip"), undefined);
  const ok = rows({ tool_allowlist: ["Read"], tool_allowlist_declared: true, workspace_path: "" });
  assertEquals((await loadSessionScope("s-scope-blip", ok)).allowedTools, ["Read"]);
});

Deno.test("loadSessionScope: a query fn that throws synchronously is still surfaced, not swallowed", async () => {
  const boom = () => {
    throw pgError("08006", "connection failure");
  };
  await assertRejects(() => loadSessionScope("s-scope-sync-throw", boom), Error, "connection failure");
  assertEquals(peekSessionScope("s-scope-sync-throw"), undefined);
});

Deno.test("isUndefinedColumn: only SQLSTATE 42703, never a message that merely looks like one", () => {
  assert(isUndefinedColumn(pgError("42703", "column x does not exist")));
  assert(!isUndefinedColumn(new Error(`column "tool_allowlist" does not exist`)));
  assert(!isUndefinedColumn(pgError("42P01", "relation does not exist")));
  assert(!isUndefinedColumn(undefined));
});

// Re-review also-fix 2: a MISSING row used to parse as `{}` — unrestricted, no
// workspace — and be cached for the worker's lifetime, which is MF3's fail-open
// arriving through a different input. Every session that reaches a turn has a
// row, so an empty result is a failed read wearing a success's clothes.
Deno.test("loadSessionScope: a session with no row at all fails the turn, it is not 'nothing declared'", async () => {
  await assertRejects(
    () => loadSessionScope("s-scope-norow", rows(undefined)),
    Error,
    "has no agents.sessions row",
  );
  assertEquals(peekSessionScope("s-scope-norow"), undefined, "a missing row must not be cached either");
});

// A row that EXISTS and declares nothing is the ordinary unrestricted session,
// and stays exactly that.
Deno.test("loadSessionScope: a row that declares nothing is nothing-declared", async () => {
  assertEquals(await loadSessionScope("s-scope-emptyrow", rows({})), {});
});

// Must-fix 3: the session map evicts in INSERTION order, not LRU, so a worker
// that primes enough other sessions between buildInstructions and
// buildSdkTools could drop the in-flight turn's own entry and fail the turn.
// The ctx-pinned entry is what makes that impossible.
Deno.test("loadSessionScope: cache pressure cannot cold-start the in-flight turn", async () => {
  const ctx = {};
  const live = rows({ tool_allowlist: ["Read"], tool_allowlist_declared: true, workspace_path: "" });
  await loadSessionScope("s-scope-inflight", live, ctx);
  // More than CACHE_MAX (512) distinct sessions primed after it.
  for (let i = 0; i < 600; i++) await loadSessionScope(`s-scope-pressure-${i}`, rows({}));
  assertEquals(peekSessionScope("s-scope-inflight"), undefined, "the session map must actually have evicted it");
  assertEquals(peekSessionScopeForCtx(ctx, "s-scope-inflight")?.allowedTools, ["Read"]);
  // Without a ctx entry the session map is still the answer.
  assertEquals(peekSessionScopeForCtx({}, "s-scope-pressure-599")?.allowedTools, undefined);
});

// ---------------------------------------------------------------------------
// acceptDeclaredWorkspace — the workspace is half of every consent scope key
// (core/server/agents/service/scope-key.ts), so a caller-supplied one decides
// which stored consents apply.
// ---------------------------------------------------------------------------

Deno.test("acceptDeclaredWorkspace: accepts exactly the run worktree devx itself produces", () => {
  const wt = getRunWorktreePath("u-ws", "app-ws", "run-1");
  assertEquals(acceptDeclaredWorkspace(wt, "u-ws"), wt);
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
    assertEquals(acceptDeclaredWorkspace(bad, "u-ws"), undefined, `${bad} must be rejected`);
  }
});

// The impersonation case: a bare workspace path is what ensureWorkspace /
// ensureAppWorkspace produce for a WHOLE app or user, so honouring one would
// let a session borrow another scope's stored consents wholesale.
Deno.test("acceptDeclaredWorkspace: rejects anything that could pass for another app's or user's workspace", () => {
  assertEquals(acceptDeclaredWorkspace(getAppWorkspacePath("u-ws", "app-ws"), "u-ws"), undefined);
  assertEquals(acceptDeclaredWorkspace(getAppWorkspacePath("u-ws", "other-app"), "u-ws"), undefined);
  assertEquals(acceptDeclaredWorkspace(getWorkspacePath("u-ws"), "u-ws"), undefined);
  // Another user's run worktree.
  assertEquals(acceptDeclaredWorkspace(getRunWorktreePath("u-other", "app-ws", "r"), "u-ws"), undefined);
});

// Must-fix 2: the declaration is SESSION-scoped, so it cannot hinge on a
// per-turn metadata.appId a later turn may omit or change. The app segment is
// read back out of the declared path and round-tripped through the generator.
Deno.test("acceptDeclaredWorkspace: acceptance does not depend on any per-turn appId", () => {
  for (const app of ["app-ws", "app-other"]) {
    const wt = getRunWorktreePath("u-ws", app, "run-1");
    assertEquals(acceptDeclaredWorkspace(wt, "u-ws"), wt);
  }
  // Still only sanitize-fixpoint segments: a raw value nobody sanitized is out.
  assertEquals(acceptDeclaredWorkspace(`${getWorkspacePath("u-ws")}/app.ws/.worktrees/r`, "u-ws"), undefined);
  assertEquals(acceptDeclaredWorkspace(`${getWorkspacePath("u-ws")}/app/.worktrees/r evil`, "u-ws"), undefined);
});

// The structural reason the impersonation case above cannot come back: no
// appId can produce a ".worktrees" segment, because sanitizeId rewrites ".".
Deno.test("acceptDeclaredWorkspace: an accepted worktree can never also be some app's own workspace", () => {
  assert(!getAppWorkspacePath("u-ws", ".worktrees").endsWith("/.worktrees"));
  assert(getRunWorktreePath("u-ws", "app-ws", "r").includes("/.worktrees/"));
});

Deno.test("acceptDeclaredWorkspace: no userId (or nothing declared) means there is no worktree to accept", () => {
  const wt = getRunWorktreePath("u-ws", "app-ws", "run-1");
  assertEquals(acceptDeclaredWorkspace(wt, undefined), undefined);
  assertEquals(acceptDeclaredWorkspace(wt, ""), undefined);
  assertEquals(acceptDeclaredWorkspace(undefined, "u-ws"), undefined);
});

Deno.test("acceptDeclaredWorkspace: the accepted value is absolute and NUL-free (a scope key is stored as text)", () => {
  const wt = acceptDeclaredWorkspace(getRunWorktreePath("u-ws", "app-ws", "run-1"), "u-ws");
  assert(wt && wt.startsWith("/"));
  assert(!wt.includes("\0"));
  // Not via getRunWorktreePath: it sanitizes, and what must be rejected here
  // is the RAW declared value nobody sanitized.
  assertEquals(acceptDeclaredWorkspace(`${getAppWorkspacePath("u-ws", "app-ws")}/.worktrees/run\0evil`, "u-ws"), undefined);
});
