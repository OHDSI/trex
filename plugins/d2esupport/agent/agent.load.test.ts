import { assert, assertEquals } from "jsr:@std/assert";
import { loadAgent } from "../../../core/server/agents/loader.ts";

const DIR = new URL("./", import.meta.url).pathname;

Deno.test("d2esupport agent loads with instructions and a model", async () => {
  const a = await loadAgent(DIR);
  assert(a.instructions.length > 0, "instructions.md must be non-empty");
  assert(a.config.model || a.config.resolveModel, "a model or resolveModel must be configured");
});

Deno.test("d2esupport agent exposes its tools", async () => {
  const a = await loadAgent(DIR);
  const names = Object.keys(a.tools);
  assertEquals(names.includes("forwardToClaw"), true);
  assertEquals(names.includes("postSlackReply"), true);
});
