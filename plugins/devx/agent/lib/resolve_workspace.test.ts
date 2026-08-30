// agent.ts's resolveWorkspace is what core's turn-diff route
// (GET /eve/v1/session/:id/turn/:turnId/diff) asks "where did this turn's
// file tools write?". It must answer with the SAME directory lib/context.ts's
// toDevxCtx handed those tools, or the route reports "no workspace available"
// for a turn whose files are sitting right there.
import { assert, assertEquals } from "jsr:@std/assert";
import { resolveWorkspace } from "../agent.ts";
import { ensureAppWorkspace, ensureWorkspace, getAppWorkspacePath, getRunWorktreePath } from "../../functions/tools/workspace.ts";
import type { QueryFn } from "../../../../core/server/agents/eve-shim/types.ts";
import { loadSessionScope } from "./session_scope.ts";

const info = (userId: string | undefined, metadata: unknown, sessionId = "s1") => ({
  sessionId,
  turnId: "t1",
  userId,
  metadata,
});

const scopeSql = (workspacePath: string): QueryFn => () => Promise.resolve({ rows: [{ workspace_path: workspacePath }] });

Deno.test("resolveWorkspace: an appId resolves to that app's workspace", async () => {
  assertEquals(
    await resolveWorkspace(info("u-rw-1", { chatId: "c1", appId: "a1" })),
    await ensureAppWorkspace("u-rw-1", "a1"),
  );
});

// The gap this covers: a user-scoped turn (no appId) still HAS a workspace —
// toDevxCtx gives it ensureWorkspace(userId) — so returning undefined here
// reported "unavailable" for a diff that was perfectly producible.
Deno.test("resolveWorkspace: no appId falls back to the user-scoped workspace, matching toDevxCtx", async () => {
  assertEquals(
    await resolveWorkspace(info("u-rw-2", { chatId: "c1" })),
    await ensureWorkspace("u-rw-2"),
  );
});

Deno.test("resolveWorkspace: no userId is the one genuinely unresolvable case", async () => {
  assertEquals(await resolveWorkspace(info(undefined, { chatId: "c1", appId: "a1" })), undefined);
  assertEquals(await resolveWorkspace(info(undefined, undefined)), undefined);
});

// An autonomous plan run executes in an isolated git worktree. eve derives the
// workspace from metadata.appId, so without this the run would mutate the main
// tree — and the workspace is half of every consent scope key (scope-key.ts).
Deno.test("resolveWorkspace: a workspace declared at session creation wins over the appId-derived one", async () => {
  const declared = getRunWorktreePath("u-rw-4", "a1", "run-7");
  await loadSessionScope("s-rw-declared", scopeSql(declared));
  assertEquals(await resolveWorkspace(info("u-rw-4", { appId: "a1" }, "s-rw-declared")), declared);
});

// Must-fix 2: the declaration is session-scoped, so a later turn that omits or
// changes metadata.appId must not silently drop back to the derived tree.
Deno.test("resolveWorkspace: the declared workspace holds whatever a turn's metadata says about appId", async () => {
  const declared = getRunWorktreePath("u-rw-8", "a1", "run-7");
  await loadSessionScope("s-rw-metadata-drift", scopeSql(declared));
  for (const metadata of [{ appId: "a1" }, { appId: "a2" }, {}, undefined]) {
    assertEquals(await resolveWorkspace(info("u-rw-8", metadata, "s-rw-metadata-drift")), declared);
  }
  // Still bound to the user the worktree was generated for.
  assertEquals(await resolveWorkspace(info("u-rw-9", { appId: "a1" }, "s-rw-metadata-drift")), await ensureAppWorkspace("u-rw-9", "a1"));
});

Deno.test("resolveWorkspace: no declared workspace falls back to the appId-derived path", async () => {
  await loadSessionScope("s-rw-undeclared", scopeSql(""));
  assertEquals(
    await resolveWorkspace(info("u-rw-5", { appId: "a1" }, "s-rw-undeclared")),
    await ensureAppWorkspace("u-rw-5", "a1"),
  );
});

// Rejected, not honoured: a caller-supplied workspace decides which stored
// consents apply, so anything devx could not itself have produced falls back.
Deno.test("resolveWorkspace: a traversal or foreign workspace is rejected and falls back to the derived path", async () => {
  const derived = await ensureAppWorkspace("u-rw-6", "a1");
  const rejected: Array<[string, string]> = [
    ["traversal", `${getAppWorkspacePath("u-rw-6", "a1")}/.worktrees/../../../../etc`],
    ["outside the managed area", "/etc"],
    ["another app's workspace", getAppWorkspacePath("u-rw-6", "a2")],
    ["another user's run worktree", getRunWorktreePath("u-other", "a1", "run-7")],
  ];
  for (const [label, path] of rejected) {
    const sessionId = `s-rw-bad-${label.replace(/\W+/g, "-")}`;
    await loadSessionScope(sessionId, scopeSql(path));
    assertEquals(await resolveWorkspace(info("u-rw-6", { appId: "a1" }, sessionId)), derived, `${label} must be rejected`);
  }
});

// A pre-V14 row has no columns to read: the SELECT errors, and the turn must
// resolve exactly the workspace it does today.
Deno.test("resolveWorkspace: a pre-migration session resolves the derived workspace, unchanged", async () => {
  const failing: QueryFn = () => Promise.reject(new Error(`column "workspace_path" does not exist`));
  await loadSessionScope("s-rw-premigration", failing);
  assertEquals(
    await resolveWorkspace(info("u-rw-7", { appId: "a1" }, "s-rw-premigration")),
    await ensureAppWorkspace("u-rw-7", "a1"),
  );
});

Deno.test("resolveWorkspace: an app workspace is nested under the user workspace, never a sibling", async () => {
  const app = await resolveWorkspace(info("u-rw-3", { appId: "a1" }));
  const user = await resolveWorkspace(info("u-rw-3", {}));
  assert(app && user && app.startsWith(`${user}/`), `${app} must be under ${user}`);
});
