// Parity test (task-v2-brief.md / task-v2b): asserts the ported agent dir's
// tool-name set equals the legacy TOOL_DEFINITIONS name set, MODULO an
// explicit, documented exclusion list. This is the "honest accounting" the
// plan calls for — only once both batches (A: fs/workspace/bash/git/github,
// 25 entries; B: db/web/planning/tasks/app-control/kb/playwright/cron/
// messaging/tool-search, 41 entries) exist does this equation close:
//
//   TOOL_DEFINITIONS names  ==  loadAgent(devx/agent).tools keys  ∪  EXCLUDED
//
// EXCLUDED tools are legacy-loop-internal: they reach into the AI-SDK
// chat-completion loop's own plumbing (streamAgentChat, devx.messages/
// devx.compacted_contexts row shapes the loop itself reads back) in a way
// that has no eve/agents equivalent, or are no-op stubs never meant to be
// load-bearing. Each entry below cites the file:line evidence.
import { assert, assertEquals } from "jsr:@std/assert";
import { loadAgent } from "../../../../core/server/agents/loader.ts";
import { TOOL_DEFINITIONS } from "../../functions/tools/registry.ts";

const AGENT_DIR = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// name -> reason, with file:line evidence.
const EXCLUDED: Record<string, string> = {
  // functions/tools/skill_tool.ts:27-29 — execute() is a hardcoded string
  // template ("Skill '${args.skill}' invoked with args: ...") with no
  // dispatch to any real skill runner. A legacy no-op stub; nothing to port.
  "Skill": "legacy no-op stub — execute() returns a canned string, never invokes anything (functions/tools/skill_tool.ts:27-29)",

  // functions/tools/compact_context.ts:20-49 — reads/writes devx.messages
  // and devx.compacted_contexts directly, and its own doc comment
  // (line 51) says the result is consulted by "future requests" — meaning
  // the legacy AI-SDK loop's own history-building code, which the eve/agents
  // loop does not have or use. Legacy-loop-internal.
  "CompactContext": "legacy-loop-internal — manipulates devx.messages/devx.compacted_contexts, tables only the legacy AI-SDK history builder reads back (functions/tools/compact_context.ts:20-49)",

  // functions/tools/spawn_agent.ts:83-84,118-135 — dynamically imports
  // `streamAgentChat` from the legacy ../agent.ts loop and re-enters it
  // recursively to run a subagent turn. Superseded by eve's own built-in
  // Agent/subagent tool support; the legacy recursive-streamAgentChat
  // mechanism has no meaning inside the new loop.
  "Agent": "replaced by the built-in agent tool — legacy execute() dynamically imports and re-enters streamAgentChat (functions/tools/spawn_agent.ts:83-84, :118)",
};

Deno.test("parity: ported tool-name set equals legacy TOOL_DEFINITIONS minus the documented exclusion list", async () => {
  const agent = await loadAgent(AGENT_DIR);
  const portedNames = new Set(Object.keys(agent.tools));
  const legacyNames = new Set(TOOL_DEFINITIONS.map((t) => t.name));
  const excludedNames = new Set(Object.keys(EXCLUDED));

  // Every excluded name must actually exist in the legacy registry (guards
  // against a stale exclusion list referring to a renamed/removed tool).
  for (const name of excludedNames) {
    assert(legacyNames.has(name), `excluded tool "${name}" is not in TOOL_DEFINITIONS — stale exclusion?`);
  }

  // Nothing ported should also be excluded (mutually exclusive sets).
  for (const name of excludedNames) {
    assert(!portedNames.has(name), `"${name}" is both ported and excluded — pick one`);
  }

  const expectedPorted = new Set([...legacyNames].filter((n) => !excludedNames.has(n)));

  const missing = [...expectedPorted].filter((n) => !portedNames.has(n));
  const unexpected = [...portedNames].filter((n) => !expectedPorted.has(n));

  assertEquals(missing, [], `tools in TOOL_DEFINITIONS but not ported (and not excluded): ${missing.join(", ")}`);
  assertEquals(unexpected, [], `ported tools not present in TOOL_DEFINITIONS: ${unexpected.join(", ")}`);
  assertEquals(portedNames.size, expectedPorted.size);
});

// A and B are the historical port batches and are closed. Tools added to the
// legacy registry afterwards get their own term, so a later addition surfaces
// here as a distinct number instead of silently inflating a closed batch.
Deno.test("parity: registry total accounts for exactly batch A (25) + batch B (41) + Figma (2) + exclusions (3)", () => {
  assertEquals(TOOL_DEFINITIONS.length, 25 + 41 + 2 + 3);
});
