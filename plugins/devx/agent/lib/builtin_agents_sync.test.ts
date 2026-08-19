// Built-in agents are defined ONCE, as eve-layout subagent dirs under
// agent/subagents/. The agents loop loads them through loadAgent's subagents
// scan; functions/skills/sync.ts registers the same dirs as the legacy loop's
// built-in devx.agents rows. These tests pin that single-source contract
// against the REAL directories, so the two loops cannot drift apart again.
//
// The regression they guard: agents/*.md used to carry a hand-written
// `allowed-tools` frontmatter list of SOURCE FILENAMES ("read_file",
// "code_search"). buildToolSet filters on the registered tool NAME
// (registry.ts's `allowSet.has(tool.name)` — "Read", "CodeSearch"), so no
// entry ever matched and both built-in subagents spawned with an EMPTY tool
// set. Deriving allowed_tools from the tools/ filenames — which is the
// loader's "filename = tool name" contract — makes the two agree by
// construction.
import { assert, assertEquals } from "jsr:@std/assert";
import { resetSync, syncBuiltins } from "../../functions/skills/sync.ts";
import { TOOL_DEFINITIONS } from "../../functions/tools/registry.ts";

const PLUGIN_BASE = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");
const SUBAGENTS = `${PLUGIN_BASE}/agent/subagents`;

interface AgentRow {
  name: string;
  description: string;
  body: string;
  allowedTools: string[] | null;
  model: string;
  maxSteps: number;
}

// Runs the real sync against the real plugin dir with a recording fake db.
// Every SELECT returns no rows, so each agent takes the INSERT branch.
async function syncedAgents(): Promise<Map<string, AgentRow>> {
  const rows = new Map<string, AgentRow>();
  resetSync();
  await syncBuiltins(PLUGIN_BASE, (query: string, params: unknown[] = []) => {
    if (query.includes("INSERT INTO devx.agents")) {
      const [name, description, body, allowedTools, model, maxSteps] = params as
        [string, string, string, string[] | null, string, number];
      rows.set(name, { name, description, body, allowedTools, model, maxSteps });
    }
    return Promise.resolve({ rows: [] });
  });
  resetSync();
  return rows;
}

Deno.test("built-in agents sync from agent/subagents/, one dir per agent", async () => {
  const agents = await syncedAgents();

  const onDisk: string[] = [];
  for await (const entry of Deno.readDir(SUBAGENTS)) {
    if (entry.isDirectory) onDisk.push(entry.name);
  }
  assert(onDisk.length > 0, "expected at least one subagent dir");

  for (const name of onDisk) {
    const row = agents.get(name);
    assert(row, `subagent "${name}" was not registered as a built-in agent`);
    assertEquals(
      row!.body,
      await Deno.readTextFile(`${SUBAGENTS}/${name}/instructions.md`),
      `"${name}" body must be its instructions.md verbatim`,
    );
    assert(row!.description.length > 0, `"${name}" needs a :description in agent.edn`);
    assertEquals(row!.model, "inherit", `"${name}" should inherit the parent model`);
    assert(row!.maxSteps > 0, `"${name}" needs a positive :max-steps`);
  }
});

// The actual bug guard: an allowed_tools entry that is not a registered tool
// name silently strips the tool, leaving the subagent unable to do anything.
Deno.test("every built-in agent's allowed_tools names a real registered tool", async () => {
  const agents = await syncedAgents();
  const registered = new Set(TOOL_DEFINITIONS.map((t) => t.name));

  for (const [name, row] of agents) {
    assert(row.allowedTools?.length, `"${name}" has no allowed_tools — it would spawn with every tool`);
    for (const tool of row.allowedTools!) {
      assert(
        registered.has(tool),
        `"${name}" allows "${tool}", which is not in TOOL_DEFINITIONS — buildToolSet would drop it`,
      );
    }
  }
});

// allowed_tools is derived from tools/, so the two cannot disagree; assert it
// rather than trusting the derivation to stay in place.
Deno.test("allowed_tools matches the agent dir's tools/ filenames", async () => {
  const agents = await syncedAgents();

  for (const [name, row] of agents) {
    const files: string[] = [];
    for await (const entry of Deno.readDir(`${SUBAGENTS}/${name}/tools`)) {
      if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      files.push(entry.name.replace(/\.ts$/, ""));
    }
    assertEquals(row.allowedTools, files.sort(), `"${name}" allowed_tools must mirror tools/`);
  }
});
