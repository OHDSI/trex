// Unit tests for agent.ts's filterTools hook (task-v3-brief.md): port of
// functions/tools/registry.ts's buildToolSet mode-filtering (registry.ts:
// 180-221), minus the legacy "never" consent branch (now core's sticky
// consent store, see toolset.ts's authoredTool).
import { assert, assertEquals } from "jsr:@std/assert";
import type { HookCtx, ToolDef } from "../../../../core/server/agents/eve-shim/types.ts";
import agentConfig, { AGENT_TOOLS } from "../agent.ts";

const filterTools = agentConfig.filterTools!;

function fakeHookCtx(metadata?: unknown): HookCtx {
  return { sessionId: "s-1", env: () => undefined, sql: () => Promise.resolve({ rows: [] }), metadata };
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
