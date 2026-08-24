import { assertEquals } from "jsr:@std/assert";
import { ensureChatWorktree } from "./chat_worktree.ts";

Deno.test("a non-git app has no worktree to branch from, and says so with null", async () => {
  // getAppWorkspacePath resolves under /tmp/devx-workspaces; a path with no
  // .git is the one case the function is allowed to answer with null.
  const result = await ensureChatWorktree("no-such-user", `missing-${crypto.randomUUID()}`, "chat-1");
  assertEquals(result, null);
});

Deno.test("the module exports exactly the shared entry point both engines import", () => {
  assertEquals(typeof ensureChatWorktree, "function");
});
