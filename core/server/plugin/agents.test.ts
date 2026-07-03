import { assert, assertEquals, assertRejects } from "jsr:@std/assert";
import { buildAgentWorkerConfig, normalizeAgentsValue } from "./agents.ts";

Deno.test("normalizeAgentsValue accepts array and single-object forms", () => {
  assertEquals(normalizeAgentsValue([{ name: "a", dir: "agent" }]), [{ name: "a", dir: "agent" }]);
  assertEquals(normalizeAgentsValue({ name: "a" }), [{ name: "a", dir: "agent" }]);
});

Deno.test("normalizeAgentsValue rejects entries without a name", () => {
  let threw = false;
  try { normalizeAgentsValue([{ dir: "agent" }]); } catch { threw = true; }
  assert(threw);
});

Deno.test("buildAgentWorkerConfig produces worker env and generated import map", async () => {
  const toyPlugin = new URL("../agents/testdata/toy-agent", import.meta.url).pathname;
  const cfg = await buildAgentWorkerConfig(toyPlugin, { name: "toy", dir: "agent" }, "@trex/toy-agent");
  assertEquals(cfg.source, "/toy");
  assert(cfg.servicePath.endsWith("/agents/service"));
  assertEquals(cfg.env.TREX_AGENT_DIR, `${toyPlugin}/agent`);
  assertEquals(cfg.env.TREX_AGENT_NAME, "toy");
  // import map exists on disk and maps "eve" to the shim
  const map = JSON.parse(await Deno.readTextFile(cfg.importMapPath));
  assert(map.imports["eve"].endsWith("/agents/eve-shim/mod.ts"));
  assertEquals(map.imports["ai"], "npm:ai@^6");
});

Deno.test("buildAgentWorkerConfig accepts EDN-only agent dirs (instructions.edn)", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.mkdir(`${tmp}/agent`);
  await Deno.writeTextFile(`${tmp}/agent/instructions.edn`, `"You are an EDN-configured agent."`);
  const cfg = await buildAgentWorkerConfig(tmp, { name: "ednagent", dir: "agent" }, "@trex/edn-agent");
  assertEquals(cfg.source, "/ednagent");
  assertEquals(cfg.env.TREX_AGENT_DIR, `${tmp}/agent`);
});

Deno.test("buildAgentWorkerConfig fails fast when instructions.md missing", async () => {
  const tmp = await Deno.makeTempDir();
  await Deno.mkdir(`${tmp}/agent`);
  await assertRejects(
    () => buildAgentWorkerConfig(tmp, { name: "x", dir: "agent" }, "@trex/x"),
    Error, "instructions.md",
  );
});
