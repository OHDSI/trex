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
import agent, { DEFERRED_TOOLS_NOTE, PLAN_MODE_TOOLS } from "../agent.ts";
import { DEFERRED_TOOL_CANDIDATES, rankDeferredTools } from "../tools/ToolSearch.ts";
import { DEFERRED_TOOLS } from "./deferred_tools.ts";
import { partitionTools } from "../../../../core/server/agents/service/context/toolsplit.ts";
import type { HookCtx, QueryFn, ToolDef } from "../../../../core/server/agents/eve-shim/types.ts";
import { loadSessionScope } from "./session_scope.ts";
import { REVIEW_TOOLSETS } from "../../functions/routes/review_tools.ts";

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
// The note is the ONLY thing that tells a model which families were withheld,
// so a deferred tool no category leads to is unreachable in practice: the
// model has no phrasing that would make it call ToolSearch for that tool.
// AddDependency was exactly that -- deferred, but matched by none of the
// note's categories.
//
// Parsed out of the note rather than restated here, so the assertion runs on
// the same list a model reads. Ranked with the real rankDeferredTools against
// the real DEFERRED_TOOL_CANDIDATES, so this fails when a tool joins
// DEFERRED_TOOLS without the note gaining a category that finds it.
function noteCategories(note: string): string[] {
  const between = note.match(/—([^—]+)—/);
  if (!between) return [];
  return between[1].split(",").map((s) => s.trim()).filter(Boolean);
}

Deno.test("every deferred tool is discoverable from a category named in DEFERRED_TOOLS_NOTE", () => {
  const categories = noteCategories(DEFERRED_TOOLS_NOTE);
  // Guards the parse itself: reshaping the note so the em-dash-delimited list
  // no longer parses would otherwise leave this test vacuously green.
  assert(categories.length >= 5, `expected the note to enumerate categories, parsed: ${JSON.stringify(categories)}`);

  const candidateNames = new Set(DEFERRED_TOOL_CANDIDATES.map((c) => c.name));
  assertEquals(
    DEFERRED_TOOLS.filter((n) => !candidateNames.has(n)),
    [],
    "a deferred tool with no TOOL_DEFINITIONS entry is not a ToolSearch candidate at all",
  );

  const reachable = new Set<string>();
  for (const category of categories) {
    for (const hit of rankDeferredTools(category, DEFERRED_TOOL_CANDIDATES)) reachable.add(hit.name);
  }
  assertEquals(
    DEFERRED_TOOLS.filter((n) => !reachable.has(n)),
    [],
    `deferred tools no note category leads to; add a category to DEFERRED_TOOLS_NOTE. Categories parsed: ${
      JSON.stringify(categories)
    }`,
  );
});

Deno.test("the deferred-tools note is not duplicated into instructions.md", async () => {
  const text = await Deno.readTextFile(new URL("../instructions.md", import.meta.url));
  assert(
    !text.includes("ToolSearch"),
    "instructions.md is discarded by buildInstructions on this loop; the note belongs only in the returned prompt",
  );
});

// 2026-08-27 orchestration Task 16: the six agent-orchestration built-ins
// (core/server/agents/service/toolset.ts) must never join DEFERRED_TOOLS.
// Deferred-tool activation only takes effect from the NEXT request
// (toolset.ts's cache-breakpoint ordering — see COMPAT.md divergence 18's
// "Deferred tools" note), but a model mid-fan-out needs agent_spawn/
// agent_wait/agent_list/agent_send/agent_stop (and the blocking `agent`)
// THIS turn, not next turn — deferring any of them would make them
// unreachable exactly when they're needed. Same tripwire shape as the
// ALWAYS_ON test above: currently trivially true (none of these names are
// devx tools, so none could accidentally land in DEFERRED_TOOLS today), but
// it guards against a future edit adding one by mistake.
Deno.test("the orchestration tools are never deferred", () => {
  const deferred = new Set(agent.context?.deferredTools);
  for (const name of ["agent", "agent_spawn", "agent_wait", "agent_list", "agent_send", "agent_stop"]) {
    assert(!deferred.has(name), `${name} must stay always-on: a model mid-fan-out cannot wait a turn for it`);
  }
});

Deno.test("the built-in subagents declare their reasoning effort", async () => {
  for (const name of ["code-reviewer", "code-explorer"]) {
    const edn = await Deno.readTextFile(
      new URL(`../subagents/${name}/agent.edn`, import.meta.url),
    );
    assert(edn.includes("reasoning-effort"), `${name} should declare :reasoning-effort`);
  }
});

// ---------------------------------------------------------------------------
// Phase 3, whole-branch review must-fix 1. A session that declares an allowlist
// (routes/review_tools.ts) gets no second chance at a deferred tool: filterTools
// runs at toolset.ts:914 and deferral at :934, and ToolSearch — the only way
// back — is itself dropped for not being allowlisted. A QA review would run with
// Read/Glob/Grep/GitDiff and report "no issues" from static reading alone.
//
// The fix is that an explicit allowlist outranks deferral: eve_run.ts's
// writeSessionScope pre-activates the declared set on agents.sessions
// (activated_tools), before the turn is posted, so partitionTools keeps exactly
// those tools. This composes the two real hooks — devx's filterTools and core's
// partitionTools — over the real tool inventory and asserts, per review type,
// that the tools the route allowlists are the tools the turn actually gets.
// Disjointness is deliberately NOT the assertion here: Browser* SHOULD stay
// deferred for ordinary chats, and pre-activation is what makes that safe.
const filterToolsHook = agent.filterTools ?? (() => true);
const A_DEF: ToolDef = { description: "a tool", inputSchema: { type: "object" } };

/** Every devx tool the loader would offer, read off disk like the loader does. */
async function allDevxToolNames(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(new URL("../tools/", import.meta.url))) {
    if (entry.isFile && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      names.push(entry.name.slice(0, -3));
    }
  }
  return names.sort();
}

/**
 * The tool names a turn really ends up with: filterTools (toolset.ts Step 4)
 * then deferral (Step 6), with the allowlist pre-activated exactly as
 * writeSessionScope stores it.
 */
async function turnToolNames(sessionId: string, allowlist: readonly string[], inventory: string[]): Promise<string[]> {
  const sql: QueryFn = () =>
    Promise.resolve({ rows: [{ tool_allowlist: [...allowlist], tool_allowlist_declared: true, workspace_path: "" }] });
  const ctx: HookCtx = { sessionId, env: () => undefined, sql, metadata: {} };
  await loadSessionScope(sessionId, sql, ctx);

  const survived: Record<string, true> = {};
  for (const name of inventory) {
    if (filterToolsHook(name, A_DEF, ctx)) survived[name] = true;
  }
  const { core, activated } = partitionTools(survived, [...allowlist], DEFERRED_TOOLS);
  return [...core.map(([n]) => n), ...activated.map(([n]) => n)].sort();
}

Deno.test("every review type's turn gets exactly the tools its route allowlists", async () => {
  const inventory = await allDevxToolNames();
  for (const [reviewType, allowlist] of Object.entries(REVIEW_TOOLSETS)) {
    // Guards the inventory itself: an allowlisted name that is not a devx tool
    // would otherwise make the comparison below vacuously "missing everywhere".
    const unknown = allowlist.filter((n) => !inventory.includes(n));
    assertEquals(unknown, [], `${reviewType} allowlists tools devx does not have: ${unknown.join(", ")}`);

    assertEquals(
      await turnToolNames(`s-review-${reviewType}`, allowlist, inventory),
      [...allowlist].sort(),
      `${reviewType} does not get the tools it declared`,
    );
  }
});

// The specific loss the review found: both browser-driven reviews allowlist six
// (QA) and five (design) Browser* tools, every one of them deferred.
Deno.test("the browser-driven reviews keep their whole browser surface", async () => {
  const inventory = await allDevxToolNames();
  for (const reviewType of ["qa-test", "design-review"]) {
    const allowlist = REVIEW_TOOLSETS[reviewType];
    const browser = allowlist.filter((n) => n.startsWith("Browser"));
    assert(browser.length >= 5, `${reviewType} should allowlist the browser tools`);
    const got = new Set(await turnToolNames(`s-browser-${reviewType}`, allowlist, inventory));
    for (const name of browser) {
      assert(got.has(name), `${reviewType} lost ${name} to deferral — a browser review with no browser`);
    }
  }
});

// ToolSearch cannot be the safety net: it is not allowlisted (so filterTools
// drops it), and activation only takes effect on the NEXT turn while a review
// is a single turn. Stated as a test so a future "just add ToolSearch" fix is
// recognised as no fix at all.
Deno.test("no review allowlist relies on ToolSearch to recover a deferred tool", () => {
  for (const [reviewType, allowlist] of Object.entries(REVIEW_TOOLSETS)) {
    assert(
      !allowlist.includes("ToolSearch"),
      `${reviewType} must not depend on ToolSearch: activation lands on the next turn, and a review has only one`,
    );
  }
});
