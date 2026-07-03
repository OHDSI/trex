import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { loadAgent } from "./loader.ts";

const TOY = new URL("./testdata/toy-agent/agent", import.meta.url).pathname;

Deno.test("loadAgent loads instructions, config and tools from an eve-layout dir", async () => {
  const a = await loadAgent(TOY);
  assert(a.instructions.includes("toy demo agent"));
  assertEquals(a.config.model, "anthropic/claude-sonnet-5");
  assertEquals(Object.keys(a.tools).sort(), ["echo", "propose_card"]);
  assertEquals(a.tools.propose_card.clientOnly, true);
});

Deno.test("loadAgent parses skill metadata (frontmatter description)", async () => {
  const a = await loadAgent(TOY);
  assertEquals(a.skills.length, 1);
  assertEquals(a.skills[0].name, "greeting-style");
  assert(a.skills[0].description.includes("chipper"));
  assert(a.skills[0].path.endsWith("skills/greeting-style.md"));
});

Deno.test("loadAgent parses SKILL.md dir layout and first-line fallback description", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmp}/instructions.md`, "hi");
  await Deno.mkdir(`${tmp}/skills/refunds`, { recursive: true });
  await Deno.writeTextFile(`${tmp}/skills/refunds/SKILL.md`, "# Refunds\nHandle refund requests step by step.\n");
  const a = await loadAgent(tmp);
  assertEquals(a.skills[0].name, "refunds");
  assertEquals(a.skills[0].description, "Handle refund requests step by step.");
});

Deno.test("loadAgent accepts EDN alternatives, with eve-native files winning", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmp}/instructions.edn`, `{:instructions "from edn"}`);
  await Deno.writeTextFile(`${tmp}/agent.edn`, `{:model "bedrock/us.anthropic.claude-sonnet-4-6" :max-steps 7}`);
  await Deno.mkdir(`${tmp}/skills`);
  await Deno.writeTextFile(`${tmp}/skills/tips.edn`, `{:description "EDN tips" :content "Do the thing."}`);
  const a = await loadAgent(tmp);
  assertEquals(a.instructions, "from edn");
  assertEquals(a.config.model, "bedrock/us.anthropic.claude-sonnet-4-6");
  assertEquals(a.config.maxSteps, 7);
  assertEquals(a.skills[0].content, "Do the thing.");
  assertEquals(a.skills[0].description, "EDN tips");
  // eve-native files win over their EDN twins
  await Deno.writeTextFile(`${tmp}/instructions.md`, "from md");
  await Deno.writeTextFile(`${tmp}/skills/tips.md`, "MD tips.\n");
  const b = await loadAgent(tmp);
  assertEquals(b.instructions, "from md");
  assertEquals(b.skills.length, 1);
  assertEquals(b.skills[0].description, "MD tips.");
});

Deno.test("SKILL.md dir form wins over an EDN skill twin", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmp}/instructions.md`, "hi");
  await Deno.mkdir(`${tmp}/skills/foo`, { recursive: true });
  await Deno.writeTextFile(`${tmp}/skills/foo/SKILL.md`, "From SKILL.md dir form.\n");
  await Deno.writeTextFile(`${tmp}/skills/foo.edn`, `{:description "from edn" :content "edn body"}`);
  const a = await loadAgent(tmp);
  assertEquals(a.skills.length, 1);
  assertEquals(a.skills[0].name, "foo");
  assertEquals(a.skills[0].description, "From SKILL.md dir form.");
  assert(a.skills[0].path.endsWith("skills/foo/SKILL.md"));
});

Deno.test("loadAgent loads subagents one level deep", async () => {
  const a = await loadAgent(TOY);
  assertEquals(Object.keys(a.subagents), ["shouter"]);
  assertEquals(Object.keys(a.subagents.shouter.tools), ["shout"]);
  assert(a.subagents.shouter.instructions.includes("shouter subagent"));
  // depth guard: a subagent's own subagents/ dir is ignored
  assertEquals(Object.keys(a.subagents.shouter.subagents).length, 0);
});

Deno.test("loadAgent surfaces malformed skill EDN as an error", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmp}/instructions.md`, "hi");
  await Deno.mkdir(`${tmp}/skills`);
  await Deno.writeTextFile(`${tmp}/skills/bad.edn`, `{:description "x" :content`);
  await assertRejects(() => loadAgent(tmp), Error, "bad.edn");
});

Deno.test("nested subagents beyond one level are ignored with a log", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmp}/instructions.md`, "hi");
  await Deno.mkdir(`${tmp}/subagents/inner/subagents/deep`, { recursive: true });
  await Deno.writeTextFile(`${tmp}/subagents/inner/instructions.md`, "inner agent");
  await Deno.writeTextFile(`${tmp}/subagents/inner/subagents/deep/instructions.md`, "too deep");
  const a = await loadAgent(tmp);
  assertEquals(Object.keys(a.subagents), ["inner"]);
  assertEquals(Object.keys(a.subagents.inner.subagents).length, 0);
});

Deno.test("loadAgent fails without instructions.md", async () => {
  const tmp = await Deno.makeTempDir();
  await assertRejects(() => loadAgent(tmp), Error, "instructions.md");
});

Deno.test("loadAgent tolerates missing agent.ts, tools, skills and subagents dirs", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmp}/instructions.md`, "hi");
  const a = await loadAgent(tmp);
  assertEquals(a.config.maxSteps, 25);
  assertEquals(Object.keys(a.tools).length, 0);
  assertEquals(a.skills.length, 0);
  assertEquals(Object.keys(a.subagents).length, 0);
});

Deno.test("loadAgent ignores eve dirs we don't support, without failing", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.writeTextFile(`${tmp}/instructions.md`, "hi");
  await Deno.mkdir(`${tmp}/channels`);
  await Deno.mkdir(`${tmp}/sandbox`);
  const a = await loadAgent(tmp); // must not throw
  assertEquals(a.instructions, "hi");
});
