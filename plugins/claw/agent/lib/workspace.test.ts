// plugins/claw/agent/lib/workspace.test.ts
import { assertEquals } from "jsr:@std/assert";
import { readCoderFile, safeRelative, workspaceRoot } from "./workspace.ts";

Deno.test("safeRelative keeps in-workspace paths and strips a leading slash", () => {
  assertEquals(safeRelative("trex/screenshots/home.png"), "trex/screenshots/home.png");
  assertEquals(safeRelative("/trex/plans/x.md"), "trex/plans/x.md");
  assertEquals(safeRelative("file.png"), "file.png");
});

Deno.test("safeRelative rejects path traversal", () => {
  assertEquals(safeRelative("../secret"), null);
  assertEquals(safeRelative("a/../../etc/passwd"), null);
  assertEquals(safeRelative("/a/../b"), null);
});

Deno.test("workspaceRoot builds <root>/<userId>/<appId> and sanitizes", () => {
  const root = Deno.env.get("DEVX_WORKSPACE_DIR") || "/tmp/devx-workspaces";
  assertEquals(
    workspaceRoot("00000000-0000-0000-0000-000000000001", "app-abc"),
    `${root}/00000000-0000-0000-0000-000000000001/app-abc`,
  );
  // non-alphanumeric (besides _ and -) is replaced with _
  assertEquals(workspaceRoot("u@1", "a/b"), `${root}/u_1/a_b`);
});

Deno.test("workspaceRoot drops the appId segment for an app-less task", () => {
  const root = Deno.env.get("DEVX_WORKSPACE_DIR") || "/tmp/devx-workspaces";
  assertEquals(workspaceRoot("user1", null), `${root}/user1`);
});

// readCoderFile must resolve a coder-written file from the per-chat git worktree
// (<appWs>/.worktrees/<codeSessionId>) FIRST — where the coder actually runs when
// useWorktree is set — then fall back to the shared app root. Regression for the
// bug where postPlan/postScreenshots read only the app root and silently attached
// nothing because the file lived in the worktree.
Deno.test("readCoderFile: worktree first, app-root fallback, unsafe/missing -> null", async () => {
  const prevEnv = Deno.env.get("DEVX_WORKSPACE_DIR");
  const base = await Deno.makeTempDir();
  Deno.env.set("DEVX_WORKSPACE_DIR", base);
  try {
    const userId = "u1";
    const appId = "app1";
    const sid = "chat-123";
    const appRoot = workspaceRoot(userId, appId); // <base>/u1/app1
    const worktree = `${appRoot}/.worktrees/${sid}`;

    // (1) File that exists ONLY in the worktree — the normal facilitated-task case.
    await Deno.mkdir(`${worktree}/trex/plans`, { recursive: true });
    await Deno.writeTextFile(`${worktree}/trex/plans/p.md`, "WORKTREE");
    const inWorktree = await readCoderFile(userId, appId, sid, "trex/plans/p.md");
    assertEquals(inWorktree?.path, `${worktree}/trex/plans/p.md`);
    assertEquals(new TextDecoder().decode(inWorktree!.bytes), "WORKTREE");

    // (2) File that exists ONLY in the app root (no worktree created) -> fallback.
    await Deno.mkdir(`${appRoot}/trex/plans`, { recursive: true });
    await Deno.writeTextFile(`${appRoot}/trex/plans/q.md`, "APPROOT");
    const inAppRoot = await readCoderFile(userId, appId, sid, "trex/plans/q.md");
    assertEquals(inAppRoot?.path, `${appRoot}/trex/plans/q.md`);
    assertEquals(new TextDecoder().decode(inAppRoot!.bytes), "APPROOT");

    // (3) The worktree wins when the same relative path exists in both roots.
    await Deno.writeTextFile(`${appRoot}/trex/plans/p.md`, "APPROOT-DUP");
    const both = await readCoderFile(userId, appId, sid, "trex/plans/p.md");
    assertEquals(new TextDecoder().decode(both!.bytes), "WORKTREE");

    // (4) With no code session, only the app root is consulted.
    const noSession = await readCoderFile(userId, appId, null, "trex/plans/p.md");
    assertEquals(new TextDecoder().decode(noSession!.bytes), "APPROOT-DUP");

    // (5) Unsafe path -> null. (6) Missing file -> null.
    assertEquals(await readCoderFile(userId, appId, sid, "../escape.md"), null);
    assertEquals(await readCoderFile(userId, appId, sid, "trex/plans/nope.md"), null);
  } finally {
    if (prevEnv === undefined) Deno.env.delete("DEVX_WORKSPACE_DIR");
    else Deno.env.set("DEVX_WORKSPACE_DIR", prevEnv);
    await Deno.remove(base, { recursive: true });
  }
});
