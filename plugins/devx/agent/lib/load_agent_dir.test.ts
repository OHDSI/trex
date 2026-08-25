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
import { DEFAULT_MAX_STEPS } from "../../functions/coder_context.ts";

// loadAgent builds file:// URLs from the dir string, so it needs an absolute
// path; derive it from this file's own URL to stay checkout-relative.
const AGENT_DIR = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

Deno.test({
  name: "loadAgent: the real plugins/devx/agent dir loads end-to-end (no stray files in tools/)",
  // Batch B (task-v2b): RestartApp.ts pulls in functions/tools/restart_app.ts
  // -> functions/dev_server.ts, which registers process-wide SIGTERM/SIGINT
  // listeners as a MODULE-LOAD side effect (dev_server.ts:452-453) — real
  // legacy behavior, needed once per running server process, not a bug in
  // this port. Because loadAgent()'s dynamic import of every tools/*.ts file
  // happens INSIDE this test's body (unlike tools_batch_a/b.test.ts, which
  // import their wrappers at module top-level before any Deno.test() runs),
  // Deno's default resource/op sanitizers attribute that global listener
  // registration to this test and flag it as a leak. Disabled deliberately —
  // the loader contract this test guards (every tools/*.ts default-exports a
  // branded tool, no stray files) is unaffected by this flag.
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const agent = await loadAgent(AGENT_DIR);

    // Every ported tool (batch A + batch B, plus anything ported since) is
    // discovered under its filename-derived name…
    const expected = [
      // Batch A (25)
      "AddDependency", "Bash", "CodeSearch", "CopyFile", "DeleteFile", "Edit",
      "EnterWorktree", "ExitWorktree", "GitBranchCreate", "GitBranchList",
      "GitBranchSwitch", "GitCommit", "GitDiff", "GitInit", "GitLog", "GitPull",
      "GitPush", "GitRevert", "GitStatus", "Glob", "Grep", "Read", "RenameFile",
      "SearchReplace", "Write",
      // Batch B (41)
      "AskUserQuestion", "BrowserClick", "BrowserEvaluate", "BrowserFill",
      "BrowserGetText", "BrowserNavigate", "BrowserScreenshot", "CronCreate",
      "CronDelete", "CronList", "DatabaseSchema", "EnterPlanMode",
      "ExecuteSQL", "ExitPlanMode", "GenerateImage", "KBFindSymbols",
      "KBInit", "KBListFiles", "KBListRepos", "KBOverview", "KBRead",
      "KBSearch", "KBUpdate", "ReadLogs", "RefreshPreview", "RestartApp",
      "SendMessage", "SetChatSummary", "TableData", "TaskCreate", "TaskGet",
      "TaskList", "TaskStop", "TaskUpdate", "TodoWrite", "ToolSearch",
      "TypeCheck", "WebCrawl", "WebFetch", "WebSearch", "WritePlan",
      // Figma (2) — added to the legacy registry after batch B closed
      "FigmaListFrames", "FigmaPullMockups",
    ];
    for (const name of expected) {
      assert(name in agent.tools, `tool ${name} missing from loaded agent`);
    }
    assertEquals(Object.keys(agent.tools).length, expected.length, "unexpected extra/missing tool in loaded agent");

    // …and every discovered tool honors the loader's contract (branded,
    // described, executable). If a non-tool file sneaks into tools/, loadAgent
    // itself throws before we ever get here — that throw IS the guard.
    for (const [name, def] of Object.entries(agent.tools)) {
      assertEquals((def as { __trexTool?: boolean }).__trexTool, true, `${name} not branded`);
      assert(typeof def.description === "string" && def.description.length > 0, `${name} has no description`);
      assert(typeof def.execute === "function", `${name} has no execute`);
    }

    // maxSteps now mirrors coder_context.ts's shared DEFAULT_MAX_STEPS
    // rather than a second hardcoded 25 — see agent.ts's defineAgent call
    // site comment for why
    // this value is definition-time and cannot vary per turn. Asserted
    // against the imported constant, not a literal 100, so a future change
    // to DEFAULT_MAX_STEPS fails here with one clear message instead of two
    // (this file and coder_context.test.ts) each reporting a bare number
    // mismatch.
    assertEquals(agent.config.maxSteps, DEFAULT_MAX_STEPS);
    assert(agent.instructions.length > 0);

    // Asserted through the REAL loader, not on agent.ts's raw export: the
    // ceiling only takes effect if resolveContextConfig's explicit key
    // allowlist carries it (an omitted key is dropped silently — the exact
    // bug contextWindow and summarizationPrompt hit). On a 1M window the
    // fraction alone would first compact around 750k tokens.
    assertEquals(agent.config.context.compactAtTokens, 200_000);
    assertEquals(agent.config.context.compactAtFraction, 0.75);

    // Part 4 (task-v3-brief.md): plugins/devx/agent/skills is a relative
    // symlink (`skills -> ../skills`) to the canonical plugins/devx/skills
    // directory — the two pre-existing consumers (functions/skills/sync.ts,
    // fn-claude-code/server.js) both resolve plugins/devx/skills directly
    // and are untouched by this symlink; it exists purely so core's loader
    // (which only scans <agent-dir>/skills) discovers the same skills.
    // Verified empirically: loadAgent (the real loader, via a real
    // Deno.readDir on the symlinked dir) surfaces a non-trivial set of
    // skills here, matching plugins/devx/skills' known contents.
    assert(agent.skills.length > 5, `expected multiple skills discovered through the skills/ symlink, got ${agent.skills.length}`);
    for (const name of ["brainstorming", "d2e", "writing-plans", "using-git-worktrees"]) {
      assert(agent.skills.some((s) => s.name === name), `expected skill "${name}" to be discovered through the skills/ symlink`);
    }

    // Part 5 (task-v3-brief.md): code-reviewer/code-explorer subagents load
    // as full agent dirs (loadAgent's own one-level-deep subagents/ scan —
    // see loader.ts), each with its :max-steps and exactly the tools in its
    // tools/ dir. These dirs are now the SINGLE definition of the built-in
    // agents — functions/skills/sync.ts registers the same ones for the
    // legacy loop (see builtin_agents_sync.test.ts).
    const EXPECTED_SUBAGENT_TOOLS = ["Read", "Glob", "Grep", "CodeSearch", "GitLog", "GitDiff"];
    for (const name of ["code-reviewer", "code-explorer"]) {
      const sub = agent.subagents[name];
      assert(sub, `expected subagent "${name}" to be loaded`);
      assertEquals(sub.config.maxSteps, 15, `${name}: max-steps should come from agent.edn`);
      assert(sub.instructions.length > 0, `${name}: instructions.md body should be non-empty`);
      assertEquals(
        Object.keys(sub.tools).sort(),
        [...EXPECTED_SUBAGENT_TOOLS].sort(),
        `${name}: tool set should match the legacy allowed-tools list exactly`,
      );
      for (const [toolName, def] of Object.entries(sub.tools)) {
        assertEquals((def as { __trexTool?: boolean }).__trexTool, true, `${name}/${toolName} not branded`);
      }
    }
  },
});
