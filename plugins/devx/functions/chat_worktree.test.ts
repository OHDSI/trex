import { assertEquals, assertRejects } from "jsr:@std/assert";
import { ensureChatWorktree } from "./chat_worktree.ts";

Deno.test("a non-git app has no worktree to branch from, and says so with null", async () => {
  const dir = await Deno.makeTempDir();
  try {
    // getAppWorkspacePath resolves under /tmp/devx-workspaces; a path with no
    // .git is the one case the function is allowed to answer with null.
    const result = await ensureChatWorktree("no-such-user", `missing-${crypto.randomUUID()}`, "chat-1");
    assertEquals(result, null);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("the module exports exactly the shared entry point both engines import", () => {
  assertEquals(typeof ensureChatWorktree, "function");
});
