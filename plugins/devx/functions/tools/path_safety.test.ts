// deno test --no-check --allow-all plugins/devx/functions/tools/path_safety.test.ts
//
// Coverage for safeJoin: traversal/absolute-path rejection plus the .git
// segment guard (a model-authored write into .git is code execution, not
// data — see the comment on safeJoin).
import { assertEquals, assertThrows } from "jsr:@std/assert";
import { safeJoin } from "./path_safety.ts";

const base = "/workspace/repo";

Deno.test("safeJoin refuses writes into .git at any depth", () => {
  assertThrows(() => safeJoin(base, ".git/config"), Error, ".git");
  assertThrows(() => safeJoin(base, ".git/hooks/post-checkout"), Error, ".git");
  assertThrows(() => safeJoin(base, "sub/.git/config"), Error, ".git");
});

Deno.test("safeJoin allows paths that merely contain the letters git", () => {
  assertEquals(safeJoin(base, ".gitignore"), `${base}/.gitignore`);
  assertEquals(safeJoin(base, ".gitattributes"), `${base}/.gitattributes`);
  assertEquals(safeJoin(base, "gitlab/config"), `${base}/gitlab/config`);
  assertEquals(safeJoin(base, "my.git.backup/x"), `${base}/my.git.backup/x`);
});

Deno.test("safeJoin still joins normal relative paths", () => {
  assertEquals(safeJoin(base, "src/index.ts"), `${base}/src/index.ts`);
});

Deno.test("safeJoin still rejects absolute paths", () => {
  assertThrows(() => safeJoin(base, "/etc/passwd"), Error, "Absolute or special paths");
});

Deno.test("safeJoin still rejects traversal escapes", () => {
  assertThrows(() => safeJoin(base, "../escape"), Error, "Path traversal detected");
});
