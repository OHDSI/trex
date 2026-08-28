import { assertEquals } from "jsr:@std/assert";
import { bashExecutable, deriveScopeKey, normalizePath } from "./scope-key.ts";

Deno.test("bashExecutable strips the directory and lowercases", () => {
  assertEquals(bashExecutable("/usr/bin/npm test"), "npm");
  assertEquals(bashExecutable("npm test"), "npm");
  assertEquals(bashExecutable("  NPM   test "), "npm");
});

Deno.test("bashExecutable skips leading env assignments", () => {
  assertEquals(bashExecutable("FOO=1 BAR=2 npm test"), "npm");
});

Deno.test("bashExecutable on an empty command yields the conservative key", () => {
  assertEquals(bashExecutable(""), "");
  assertEquals(bashExecutable("   "), "");
});

Deno.test("normalizePath resolves . and .. without touching the filesystem", () => {
  assertEquals(normalizePath("./src/../src/a.ts"), "src/a.ts");
  assertEquals(normalizePath("src//a.ts"), "src/a.ts");
  assertEquals(normalizePath("/etc/../etc/passwd"), "/etc/passwd");
});

// A relative path that escapes its base must NOT normalize onto the same key as
// one that does not — that would let an approval for `a.ts` cover `../a.ts`.
Deno.test("normalizePath keeps leading .. segments distinct", () => {
  assertEquals(normalizePath("../a.ts"), "../a.ts");
  assertEquals(normalizePath("../../a.ts"), "../../a.ts");
});

Deno.test("normalizePath keeps absolute and relative keys distinct", () => {
  assertEquals(normalizePath("/a.ts"), "/a.ts");
  assertEquals(normalizePath("a.ts"), "a.ts");
});

Deno.test("deriveScopeKey keys Bash on the executable", () => {
  assertEquals(deriveScopeKey("Bash", { command: "/usr/bin/npm test" }), "npm");
});

Deno.test("deriveScopeKey keys path tools on the normalized path", () => {
  for (const tool of ["Write", "Edit", "DeleteFile", "SearchReplace"]) {
    assertEquals(deriveScopeKey(tool, { path: "./src/a.ts" }), "src/a.ts");
  }
});

Deno.test("deriveScopeKey keys pair tools on both endpoints", () => {
  assertEquals(
    deriveScopeKey("CopyFile", { source: "./a.ts", destination: "b/../c.ts" }),
    "a.ts c.ts",
  );
});

Deno.test("deriveScopeKey returns the empty key for every other tool", () => {
  assertEquals(deriveScopeKey("GitPush", { branch: "main" }), "");
  assertEquals(deriveScopeKey("mcp_github_create_issue", { title: "x" }), "");
});

// Conservative direction: "" matches only a "" consent row, so a malformed
// input can never accidentally match a narrower stored grant.
Deno.test("deriveScopeKey returns the empty key for malformed input", () => {
  assertEquals(deriveScopeKey("Bash", {}), "");
  assertEquals(deriveScopeKey("Bash", null), "");
  assertEquals(deriveScopeKey("Write", { path: 42 }), "");
  assertEquals(deriveScopeKey("CopyFile", { source: "a.ts" }), "");
});
