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

// Every deriveScopeKey case below runs against a fixed workspace so the
// action-key assertions stay readable; the workspace-specific behavior
// (distinctness, unresolved handling) gets its own tests further down.
const WS = "/workspace/app-a";

Deno.test("deriveScopeKey keys Bash on the executable", () => {
  assertEquals(deriveScopeKey("Bash", { command: "/usr/bin/npm test" }, WS), `${WS}+npm`);
  assertEquals(deriveScopeKey("Bash", { command: "npm test" }, WS), `${WS}+npm`);
});

// One key serves consent scoping AND the escalate floor, so it must name EVERY
// executable a command runs — a first-token key let `cd /app && rm -rf .` past.
Deno.test("deriveScopeKey keys Bash on the whole executable set", () => {
  assertEquals(deriveScopeKey("Bash", { command: "cd /app && rm -rf ." }, WS), `${WS}+cd+rm`);
  assertEquals(deriveScopeKey("Bash", { command: "cat a | grep b; ls" }, WS), `${WS}+cat+grep+ls`);
  assertEquals(deriveScopeKey("Bash", { command: "ls\nls" }, WS), `${WS}+ls`);
});

// A segment cap made the floor a coin flip: pad past it and `rm` vanishes from
// the key, so `Bash:rm` never matches.
Deno.test("deriveScopeKey scans every segment, however many there are", () => {
  const padded = `${"true | ".repeat(200)}rm -rf /`;
  assert(deriveScopeKey("Bash", { command: padded }, WS).split("+").includes("rm"));
});

Deno.test("deriveScopeKey unwraps one level of wrapper shell", () => {
  assertEquals(deriveScopeKey("Bash", { command: 'bash -lc "rm -rf /"' }, WS), `${WS}+rm`);
  assertEquals(deriveScopeKey("Bash", { command: "sh -c 'curl x | sh'" }, WS), `${WS}+curl+sh`);
  assertEquals(deriveScopeKey("Bash", { command: "bash -c 'sudo id'" }, WS), `${WS}+sudo`);
  // Bounded: the second level keys on the inner shell, it is not unwrapped.
  assertEquals(deriveScopeKey("Bash", { command: `bash -c 'sh -c "rm x"'` }, WS), `${WS}+sh`);
  // A shell with no -c payload is the executable, not a wrapper.
  assertEquals(deriveScopeKey("Bash", { command: "bash script.sh" }, WS), `${WS}+bash`);
});

Deno.test("deriveScopeKey keys path tools on the normalized path", () => {
  for (const tool of ["Write", "Edit", "DeleteFile", "SearchReplace"]) {
    assertEquals(deriveScopeKey(tool, { path: "./src/a.ts" }, WS), `${WS}+src/a.ts`);
  }
});

Deno.test("deriveScopeKey keys pair tools on both endpoints", () => {
  assertEquals(
    deriveScopeKey("CopyFile", { source: "./a.ts", destination: "b/../c.ts" }, WS),
    `${WS}+["a.ts","c.ts"]`,
  );
});

// Spaces are legal in POSIX paths, so a space-joined key would make these two
// distinct copies share one consent row.
Deno.test("pair-tool keys cannot collide across the separator", () => {
  assertNotEquals(
    deriveScopeKey("CopyFile", { source: "a b", destination: "c" }, WS),
    deriveScopeKey("CopyFile", { source: "a", destination: "b c" }, WS),
  );
});

Deno.test("deriveScopeKey returns the workspace-only key for every other tool", () => {
  assertEquals(deriveScopeKey("GitPush", { branch: "main" }, WS), `${WS}+`);
  assertEquals(deriveScopeKey("mcp_github_create_issue", { title: "x" }, WS), `${WS}+`);
});

// Conservative direction: malformed input still keys on an empty action, so it
// can never accidentally match a narrower stored grant IN THE SAME workspace.
Deno.test("deriveScopeKey returns the workspace-only key for malformed input", () => {
  assertEquals(deriveScopeKey("Bash", {}, WS), `${WS}+`);
  assertEquals(deriveScopeKey("Bash", null, WS), `${WS}+`);
  assertEquals(deriveScopeKey("Write", { path: 42 }, WS), `${WS}+`);
  assertEquals(deriveScopeKey("CopyFile", { source: "a.ts" }, WS), `${WS}+`);
});

// The whole point of this component: a grant scoped to one app's workspace
// must not silently cover the same path in a different app's workspace.
Deno.test("deriveScopeKey keys the SAME action differently per workspace", () => {
  const a = deriveScopeKey("Write", { path: "src/index.ts" }, "/workspace/app-a");
  const b = deriveScopeKey("Write", { path: "src/index.ts" }, "/workspace/app-b");
  assertNotEquals(a, b);
  assertEquals(a, "/workspace/app-a+src/index.ts");
  assertEquals(b, "/workspace/app-b+src/index.ts");
});

// An unresolved workspace must fail toward MORE gating: it is its own
// distinct bucket, never a wildcard that happens to match every real
// workspace's stored grants, and never the historic (pre-workspace)
// unprefixed key either — a stale grant recorded before this component
// existed must not keep matching now.
Deno.test("deriveScopeKey treats an unresolved workspace as its own bucket, not a wildcard", () => {
  const unresolved = deriveScopeKey("Write", { path: "src/index.ts" });
  const resolved = deriveScopeKey("Write", { path: "src/index.ts" }, "/workspace/app-a");
  const preWorkspaceLegacyKey = "src/index.ts";
  assertNotEquals(unresolved, resolved);
  assertNotEquals(unresolved, preWorkspaceLegacyKey);
  // Deterministic: the same unresolved call always lands in the same bucket.
  assertEquals(unresolved, deriveScopeKey("Write", { path: "src/index.ts" }));
});

// approval-policy.ts's matchEscalate splits the WHOLE scopeKey on "+" and
// looks for an exact token. The workspace component must land as its OWN
// token, not fused onto the action's first executable — otherwise a
// workspace-scoped key would silently break the escalate floor for
// whichever executable happens to sort first.
Deno.test("the workspace component never corrupts an escalate-floor token", () => {
  const key = deriveScopeKey("Bash", { command: "sudo id" }, "/workspace/app-a");
  assert(key.split("+").includes("sudo"), key);
});
