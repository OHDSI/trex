// agent.ts's resolveWorkspace is what core's turn-diff route
// (GET /eve/v1/session/:id/turn/:turnId/diff) asks "where did this turn's
// file tools write?". It must answer with the SAME directory lib/context.ts's
// toDevxCtx handed those tools, or the route reports "no workspace available"
// for a turn whose files are sitting right there.
import { assert, assertEquals } from "jsr:@std/assert";
import { resolveWorkspace } from "../agent.ts";
import { ensureAppWorkspace, ensureWorkspace } from "../../functions/tools/workspace.ts";

const info = (userId: string | undefined, metadata: unknown) => ({ sessionId: "s1", turnId: "t1", userId, metadata });

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

Deno.test("resolveWorkspace: an app workspace is nested under the user workspace, never a sibling", async () => {
  const app = await resolveWorkspace(info("u-rw-3", { appId: "a1" }));
  const user = await resolveWorkspace(info("u-rw-3", {}));
  assert(app && user && app.startsWith(`${user}/`), `${app} must be under ${user}`);
});
