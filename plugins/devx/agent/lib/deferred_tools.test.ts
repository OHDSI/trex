// Task 16: devx's own deferred-tool list, wired into agent.ts's
// `context.deferredTools` (lib/deferred_tools.ts's DEFERRED_TOOLS).
//
// Deviation from task-16-brief.md (RULING 2 applied): the brief's sample
// asserts on `agent.config.context.deferredTools` from the default-imported
// agent module. That shape does not exist on the RAW module: eve-shim's
// `defineAgent(config: AgentConfig): AgentConfig` (mod.ts) returns the
// AgentConfig object itself, `{ maxSteps: 25, ...config }` — there is no
// `.config` wrapper at this layer. `LoadedAgent.config` (loader.ts) is a
// SEPARATE, later-constructed shape: the loader imports this same module,
// merges its default export into its own `config` field, and only THERE
// resolves `context` via resolveContextConfig. Importing agent.ts directly
// (as this file does, no loader involved) gives the RAW, unresolved
// `Partial<ContextConfig>` exactly as authored — `agent.context.deferredTools`,
// not `agent.config.context.deferredTools`.
import { assert, assertEquals } from "jsr:@std/assert";
import agent, { PLAN_MODE_TOOLS } from "../agent.ts";
import { DEFERRED_TOOLS } from "./deferred_tools.ts";

const ALWAYS_ON = [
  "Read", "Write", "Edit", "SearchReplace", "Bash", "Grep", "Glob", "CodeSearch",
  "GitStatus", "GitDiff", "GitCommit",
  "TaskCreate", "TaskGet", "TaskList", "TaskUpdate", "TaskStop",
  "Skill", "Agent", "AskUserQuestion", "TodoWrite", "ToolSearch",
];

Deno.test("devx defers the long tail but never the always-on core tools", () => {
  const deferred = new Set(agent.context?.deferredTools);
  for (const name of ALWAYS_ON) {
    assert(!deferred.has(name), `${name} must stay always-on`);
  }
  assert(deferred.has("BrowserNavigate"));
  assert(deferred.has("FigmaPullMockups"));
  // Exact, not a floor with a message naming a different number. The list is
  // hand-maintained and small enough to state; a floor of 25 with a message
  // claiming ~30 described neither the code nor the intent, and would have
  // stayed green through the nine-tool removal below.
  assertEquals(deferred.size, 16);
  assertEquals(DEFERRED_TOOLS.length, deferred.size, "DEFERRED_TOOLS contains a duplicate");
});

// Deferral runs AFTER filterTools (toolset.ts Step 4 then Step 6), so a tool
// that is both plan-mode allowlisted and deferred is dropped from plan mode
// entirely. Nine tools -- the eight KB* tools and CronList -- were in both
// lists, costing plan mode its whole knowledge-base surface. ToolSearch could
// not recover it within the turn either: activation only takes effect on the
// NEXT turn, because handler.ts reads activated tools once, before runTurn.
Deno.test("no plan-mode tool is deferred (deferral runs after filterTools, so both lists means neither)", () => {
  const deferred = new Set(agent.context?.deferredTools);
  const overlap = [...PLAN_MODE_TOOLS].filter((name) => deferred.has(name));
  assertEquals(overlap, [], `plan mode would lose these tools entirely: ${overlap.join(", ")}`);
});

Deno.test("plan mode keeps its knowledge-base surface", () => {
  const deferred = new Set(agent.context?.deferredTools);
  for (const name of ["KBListRepos", "KBInit", "KBUpdate", "KBRead", "KBSearch", "KBListFiles", "KBOverview", "KBFindSymbols", "CronList"]) {
    assert(PLAN_MODE_TOOLS.has(name), `${name} should be plan-mode allowlisted`);
    assert(!deferred.has(name), `${name} is plan-mode allowlisted and must not be deferred`);
  }
});

Deno.test("agent.ts's deferredTools is exactly lib/deferred_tools.ts's DEFERRED_TOOLS (single source of truth)", () => {
  assertEquals(agent.context?.deferredTools, DEFERRED_TOOLS);
});

// The deferred-tools note deliberately does NOT live in instructions.md.
// buildInstructions discards its own `base` argument (the resolved
// instructions.md text) in favour of buildCoderContext's systemPrompt, so on
// this loop no model ever reads that file -- a rule there would be a second
// source of truth nothing consults. lib/prompt_parity.test.ts asserts the
// note on the REAL returned prompt instead, which is the only place it can
// actually reach a model.
Deno.test("the deferred-tools note is not duplicated into instructions.md", async () => {
  const text = await Deno.readTextFile(new URL("../instructions.md", import.meta.url));
  assert(
    !text.includes("ToolSearch"),
    "instructions.md is discarded by buildInstructions on this loop; the note belongs only in the returned prompt",
  );
});
