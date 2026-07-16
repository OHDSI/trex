// plugins/claw/agent/lib/workspace.test.ts
import { assertEquals } from "jsr:@std/assert";
import { safeRelative, workspaceRoot } from "./workspace.ts";

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
