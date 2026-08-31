// Unit tests for agent.ts's filterTools hook (task-v3-brief.md): port of
// functions/tools/registry.ts's buildToolSet mode-filtering (registry.ts:
// 180-221), minus the legacy "never" consent branch (now core's sticky
// consent store, see toolset.ts's authoredTool).
import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import type { HookCtx, QueryFn, ToolDef } from "../../../../core/server/agents/eve-shim/types.ts";
import agentConfig, { AGENT_TOOLS } from "../agent.ts";
import { loadSessionScope } from "./session_scope.ts";

const filterTools = agentConfig.filterTools ?? (() => true);

// filterTools reads the session's V14 scope from the sync cache buildInstructions
// primes; a test calling the hook directly has to prime it the same way.
const scopeSql = (row: unknown): QueryFn => () => Promise.resolve({ rows: [row] });
await loadSessionScope("s-1", scopeSql({}));

function fakeHookCtx(metadata?: unknown, sessionId = "s-1"): HookCtx {
  return { sessionId, env: () => undefined, sql: () => Promise.resolve({ rows: [] }), metadata };
}

const READ_ONLY_DEF: ToolDef = { description: "reads stuff", inputSchema: { type: "object" } };
const WRITE_DEF: ToolDef & { modifiesState: boolean } = {
  description: "writes stuff",
  inputSchema: { type: "object" },
  modifiesState: true,
};

Deno.test("filterTools: ask mode drops modifiesState tools, keeps read-only ones", () => {
  const ctx = fakeHookCtx({ mode: "ask" });
  assert(!(filterTools("Write", WRITE_DEF, ctx)));
  assertEquals(filterTools("Read", READ_ONLY_DEF, ctx), true);
});

Deno.test("filterTools: ask mode drops the built-in 'agent' tool (legacy-parity: Agent is modifiesState:true)", () => {
  const ctx = fakeHookCtx({ mode: "ask" });
  assert(!(filterTools("agent", READ_ONLY_DEF, ctx)));
  // skill carries no modifiesState and isn't name-excluded — legacy's own
  // Skill tool isn't modifiesState either, so no asymmetry to close there.
  assertEquals(filterTools("skill", READ_ONLY_DEF, ctx), true);
});

// Final review, Critical 2(a): ask mode was escapable in ONE tool call. Only
// the name "agent" was excluded; the five newer delegation built-ins
// (agent_spawn/agent_wait/agent_result/agent_stop/agent_send) carry no
// modifiesState field either — they are generic eve built-ins, not
// devx-authored ToolDefs — so they survived ask mode, and a read-only session
// could simply agent_spawn a fully write-capable child to do the writing.
Deno.test("filterTools: ask mode drops EVERY delegation built-in, not just 'agent'", () => {
  const ctx = fakeHookCtx({ mode: "ask" });
  for (const name of AGENT_TOOLS) {
    assert(!filterTools(name, READ_ONLY_DEF, ctx), `${name} must not survive ask mode`);
  }
  // The set must cover the delegation built-ins core registers TODAY. This
  // second literal is a hand-written list in the same file, so it catches a
  // name dropped from AGENT_TOOLS but not a built-in newly added to core —
  // see AGENT_TOOLS' own comment for what actually backstops that.
  for (
    const name of ["agent", "agent_spawn", "agent_list", "agent_wait", "agent_result", "agent_stop", "agent_send"]
  ) {
    assert(AGENT_TOOLS.has(name), `${name} is a core delegation built-in and must be in AGENT_TOOLS`);
  }
});

Deno.test("filterTools: plan mode only allows PLAN_MODE_TOOLS", () => {
  const ctx = fakeHookCtx({ mode: "plan" });
  for (const name of ["Read", "Glob", "Grep", "CodeSearch", "GitStatus", "GitLog", "GitBranchList", "WritePlan", "ExitPlanMode", "TaskGet", "TaskList", "CronList", "ToolSearch"]) {
    assertEquals(filterTools(name, READ_ONLY_DEF, ctx), true, `${name} should be allowed in plan mode`);
  }
  for (const name of ["Write", "Bash", "GitCommit", "DeleteFile", "agent", "skill"]) {
    assert(!filterTools(name, READ_ONLY_DEF, ctx), `${name} should be dropped in plan mode`);
  }
});

Deno.test("filterTools: build mode drops everything, including built-in tools", () => {
  const ctx = fakeHookCtx({ mode: "build" });
  assert(!(filterTools("Read", READ_ONLY_DEF, ctx)));
  assert(!(filterTools("Write", WRITE_DEF, ctx)));
  assert(!(filterTools("agent", READ_ONLY_DEF, ctx)));
  assert(!(filterTools("skill", READ_ONLY_DEF, ctx)));
});

Deno.test("filterTools: no metadata allows everything (agent-framework default)", () => {
  const ctx = fakeHookCtx(undefined);
  assertEquals(filterTools("Write", WRITE_DEF, ctx), true);
  assertEquals(filterTools("SomeRandomTool", READ_ONLY_DEF, ctx), true);
});

Deno.test("filterTools: unknown/invalid mode string allows everything (agent-framework default)", () => {
  const ctx = fakeHookCtx({ mode: "not-a-real-mode" });
  assertEquals(filterTools("Write", WRITE_DEF, ctx), true);
  assertEquals(filterTools("agent", READ_ONLY_DEF, ctx), true);
});

// ---------------------------------------------------------------------------
// The session-creation-time tool allowlist (V14). Security review holds the
// agent to a read-only toolset on legacy via commandOverride.allowed_tools;
// eve has no allowlist of its own, so this hook is where it survives.
// ---------------------------------------------------------------------------

Deno.test("filterTools: an allowlisted session keeps the allowlisted tool and drops every other", async () => {
  await loadSessionScope("s-allow", scopeSql({ tool_allowlist: ["Read", "Grep"], tool_allowlist_declared: true }));
  const ctx = fakeHookCtx(undefined, "s-allow");
  assertEquals(filterTools("Read", READ_ONLY_DEF, ctx), true);
  assertEquals(filterTools("Grep", READ_ONLY_DEF, ctx), true);
  assert(!filterTools("Write", WRITE_DEF, ctx), "a non-allowlisted tool must be dropped");
  // Built-ins reach filterTools in the same merged set, and delegation is the
  // one-call escape from any allowlist.
  assert(!filterTools("agent", READ_ONLY_DEF, ctx));
  assert(!filterTools("skill", READ_ONLY_DEF, ctx));
});

// The inverted-default trap: an empty declared allowlist is "no tools". Reading
// it as "no restriction" would silently hand a locked-down session everything.
Deno.test("filterTools: an EMPTY allowlist drops everything, it is not 'no allowlist'", async () => {
  await loadSessionScope("s-allow-empty", scopeSql({ tool_allowlist: [], tool_allowlist_declared: true }));
  const ctx = fakeHookCtx(undefined, "s-allow-empty");
  for (const name of ["Read", "Write", "Bash", "agent", "skill", "ToolSearch"]) {
    assert(!filterTools(name, READ_ONLY_DEF, ctx), `${name} must be dropped by an empty allowlist`);
  }
});

Deno.test("filterTools: an allowlist narrows a mode, it never widens one", async () => {
  await loadSessionScope("s-allow-mode", scopeSql({ tool_allowlist: ["Read", "Write"], tool_allowlist_declared: true }));
  // build mode drops every tool; being allowlisted must not bring one back.
  assert(!filterTools("Read", READ_ONLY_DEF, fakeHookCtx({ mode: "build" }, "s-allow-mode")));
  // ask mode drops modifiesState tools; being allowlisted must not bring one back.
  assert(!filterTools("Write", WRITE_DEF, fakeHookCtx({ mode: "ask" }, "s-allow-mode")));
  assertEquals(filterTools("Read", READ_ONLY_DEF, fakeHookCtx({ mode: "ask" }, "s-allow-mode")), true);
});

// The no-allowlist path must be byte-identical to today, including when the
// array column holds a value that was never declared.
Deno.test("filterTools: a session with no declared allowlist decides exactly as it does today", async () => {
  await loadSessionScope(
    "s-allow-absent",
    scopeSql({ tool_allowlist: ["Read"], tool_allowlist_declared: false, workspace_path: "" }),
  );
  const cases: Array<[string, ToolDef]> = [
    ["Read", READ_ONLY_DEF],
    ["Write", WRITE_DEF],
    ["Bash", WRITE_DEF],
    ["agent", READ_ONLY_DEF],
    ["skill", READ_ONLY_DEF],
    ["SomeRandomTool", READ_ONLY_DEF],
  ];
  for (const mode of [undefined, { mode: "ask" }, { mode: "plan" }, { mode: "build" }, { mode: "nonsense" }]) {
    for (const [name, def] of cases) {
      assertEquals(
        filterTools(name, def, fakeHookCtx(mode, "s-allow-absent")),
        filterTools(name, def, fakeHookCtx(mode, "s-1")),
        `${name} under ${JSON.stringify(mode)} must match the pre-allowlist decision`,
      );
    }
  }
});

// A cold cache means buildInstructions did not run first, i.e. the priming
// ordering broke. Failing the turn is filterTools' documented posture;
// answering "allow" would run a restricted session with no restriction.
Deno.test("filterTools: a session whose scope was never loaded fails loudly, it does not allow", () => {
  assertThrows(
    () => filterTools("Read", READ_ONLY_DEF, fakeHookCtx(undefined, `s-never-loaded-${crypto.randomUUID()}`)),
    Error,
    "scope",
  );
});
