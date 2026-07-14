// plugins/claw/agent/agent.load.test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { loadAgent } from "../../../core/server/agents/loader.ts";

const DIR = new URL("./", import.meta.url).pathname;

Deno.test("claw agent loads with instructions and a model", async () => {
  const a = await loadAgent(DIR);
  assert(a.instructions.length > 0, "instructions.md must be non-empty");
  assert(a.config.model || a.config.resolveModel, "a model or resolveModel must be configured");
});

Deno.test("claw agent exposes no tools yet", async () => {
  const a = await loadAgent(DIR);
  assertEquals(Object.keys(a.tools).length, 0);
});
