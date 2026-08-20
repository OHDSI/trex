// The four dispatch paths (claude-code agent, ai-sdk agent, copilot agent,
// and the raw-provider chat dispatch in index.ts) must not assemble prompts
// themselves. Before the shared coder context existed they each did, and
// drifted: the channel profile reached only claude-code, the skills and
// commit-hygiene rules only claude-code, and the component-selection
// sentence was worded three different ways. index.ts drifted the same way
// for the raw-provider (anthropic/google/bedrock/openai) build/ask turns
// until it was converted too. This test fails when a future edit
// reintroduces per-path assembly.
import { assertEquals } from "jsr:@std/assert";

const ENGINES = [
  "plugins/devx/functions/agent.ts",
  "plugins/devx/functions/claude_code_agent.ts",
  "plugins/devx/functions/copilot_agent.ts",
  "plugins/devx/functions/index.ts",
];

Deno.test("no dispatch path mutates the system prompt after building the coder context", async () => {
  for (const path of ENGINES) {
    const src = await Deno.readTextFile(path);
    const mutations = src.split("\n").filter((l) =>
      /^\s*systemPrompt\s*(\+=|=[^=])/.test(l)
    );
    assertEquals(mutations, [], `${path} assembles the prompt itself; use buildCoderContext`);
  }
});

Deno.test("every dispatch path builds its context through the shared builder", async () => {
  for (const path of ENGINES) {
    const src = await Deno.readTextFile(path);
    assertEquals(src.includes("buildCoderContext("), true, `${path} does not call buildCoderContext`);
  }
});

Deno.test("no dispatch path constructs the base prompt directly", async () => {
  for (const path of ENGINES) {
    const src = await Deno.readTextFile(path);
    assertEquals(
      src.includes("constructSystemPrompt("), false,
      `${path} calls constructSystemPrompt directly; that belongs to coder_context.ts`,
    );
  }
});
