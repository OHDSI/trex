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
import agent from "../agent.ts";
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
  assert(deferred.has("KBSearch"));
  assert(deferred.has("FigmaPullMockups"));
  assert(deferred.size >= 25, `expected ~30 deferred tools, got ${deferred.size}`);
});

Deno.test("agent.ts's deferredTools is exactly lib/deferred_tools.ts's DEFERRED_TOOLS (single source of truth)", () => {
  assertEquals(agent.context?.deferredTools, DEFERRED_TOOLS);
});

Deno.test("instructions.md tells the model the tool list is partial", async () => {
  const text = await Deno.readTextFile(new URL("../instructions.md", import.meta.url));
  assert(text.includes("ToolSearch"), "instructions must mention ToolSearch");
  assert(text.toLowerCase().includes("partial"), "instructions must say the tool list is partial");
});
