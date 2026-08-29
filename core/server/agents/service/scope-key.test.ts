import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert";
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
  assertEquals(deriveScopeKey("Bash", { command: "npm test" }), "npm");
});

// One key serves consent scoping AND the escalate floor, so it must name EVERY
// executable a command runs — a first-token key let `cd /app && rm -rf .` past.
Deno.test("deriveScopeKey keys Bash on the whole executable set", () => {
  assertEquals(deriveScopeKey("Bash", { command: "cd /app && rm -rf ." }), "cd+rm");
  assertEquals(deriveScopeKey("Bash", { command: "cat a | grep b; ls" }), "cat+grep+ls");
  assertEquals(deriveScopeKey("Bash", { command: "ls\nls" }), "ls");
});

// A segment cap made the floor a coin flip: pad past it and `rm` vanishes from
// the key, so `Bash:rm` never matches.
Deno.test("deriveScopeKey scans every segment, however many there are", () => {
  const padded = `${"true | ".repeat(200)}rm -rf /`;
  assert(deriveScopeKey("Bash", { command: padded }).split("+").includes("rm"));
});

Deno.test("deriveScopeKey unwraps one level of wrapper shell", () => {
  assertEquals(deriveScopeKey("Bash", { command: 'bash -lc "rm -rf /"' }), "rm");
  assertEquals(deriveScopeKey("Bash", { command: "sh -c 'curl x | sh'" }), "curl+sh");
  assertEquals(deriveScopeKey("Bash", { command: "bash -c 'sudo id'" }), "sudo");
  // Bounded: the second level keys on the inner shell, it is not unwrapped.
  assertEquals(deriveScopeKey("Bash", { command: `bash -c 'sh -c "rm x"'` }), "sh");
  // A shell with no -c payload is the executable, not a wrapper.
  assertEquals(deriveScopeKey("Bash", { command: "bash script.sh" }), "bash");
});

Deno.test("deriveScopeKey keys path tools on the normalized path", () => {
  for (const tool of ["Write", "Edit", "DeleteFile", "SearchReplace"]) {
    assertEquals(deriveScopeKey(tool, { path: "./src/a.ts" }), "src/a.ts");
  }
});

Deno.test("deriveScopeKey keys pair tools on both endpoints", () => {
  assertEquals(
    deriveScopeKey("CopyFile", { source: "./a.ts", destination: "b/../c.ts" }),
    '["a.ts","c.ts"]',
  );
});

// Spaces are legal in POSIX paths, so a space-joined key would make these two
// distinct copies share one consent row.
Deno.test("pair-tool keys cannot collide across the separator", () => {
  assertNotEquals(
    deriveScopeKey("CopyFile", { source: "a b", destination: "c" }),
    deriveScopeKey("CopyFile", { source: "a", destination: "b c" }),
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
