// Regression guard (task-v2a review fix): the WHOLE agent dir must load
// through core's real loader. loader.ts scans every tools/*.ts entry under a
// strict one-file-one-tool contract — any stray file there (e.g. a *.test.ts,
// which is exactly what batch A briefly shipped) makes loadAgent() throw
// "must default-export defineTool(...)" and the whole agent fail to load.
// This test calls the REAL loadAgent against the REAL plugins/devx/agent dir
// so that class of mistake fails CI, not production.
//
// Cross-workspace resolution note (why V1 said this wasn't possible): the
// blockers were bare specifiers — "edn-data" in loader.ts and "eve"/
// "eve/tools" in agent.ts + every tools/*.ts wrapper, none resolvable from a
// --no-config run. But a flag-provided --import-map applies PROGRAM-WIDE,
// including to loadAgent's dynamic file:// imports, so mapping all three in
// local-test-import-map.json (eve -> eve-shim, edn-data -> npm:edn-data@^1,
// matching core/server/deno.json) resolves everything. This works only under
// this file's documented invocation (repo root, --no-config,
// --import-map=plugins/devx/agent/local-test-import-map.json) — same recipe
// as every other test in this dir.
import { assert, assertEquals } from "jsr:@std/assert";
import { loadAgent } from "../../../../core/server/agents/loader.ts";

// loadAgent builds file:// URLs from the dir string, so it needs an absolute
// path; derive it from this file's own URL to stay checkout-relative.
const AGENT_DIR = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

Deno.test("loadAgent: the real plugins/devx/agent dir loads end-to-end (no stray files in tools/)", async () => {
  const agent = await loadAgent(AGENT_DIR);

  // Every batch-A tool is discovered under its filename-derived name…
  const expected = [
    "AddDependency", "Bash", "CodeSearch", "CopyFile", "DeleteFile", "Edit",
    "EnterWorktree", "ExitWorktree", "GitBranchCreate", "GitBranchList",
    "GitBranchSwitch", "GitCommit", "GitDiff", "GitInit", "GitLog", "GitPull",
    "GitPush", "GitRevert", "GitStatus", "Glob", "Grep", "Read", "RenameFile",
    "SearchReplace", "Write",
  ];
  for (const name of expected) {
    assert(name in agent.tools, `tool ${name} missing from loaded agent`);
  }

  // …and every discovered tool honors the loader's contract (branded,
  // described, executable). If a non-tool file sneaks into tools/, loadAgent
  // itself throws before we ever get here — that throw IS the guard.
  for (const [name, def] of Object.entries(agent.tools)) {
    assertEquals((def as { __trexTool?: boolean }).__trexTool, true, `${name} not branded`);
    assert(typeof def.description === "string" && def.description.length > 0, `${name} has no description`);
    assert(typeof def.execute === "function", `${name} has no execute`);
  }

  assertEquals(agent.config.maxSteps, 25);
  assert(agent.instructions.length > 0);
});
