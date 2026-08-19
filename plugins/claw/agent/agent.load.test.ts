// plugins/claw/agent/agent.load.test.ts
import { assert, assertEquals } from "jsr:@std/assert";
import { loadAgent } from "../../../core/server/agents/loader.ts";

const DIR = new URL("./", import.meta.url).pathname;

Deno.test("claw agent loads with instructions and a model", async () => {
  const a = await loadAgent(DIR);
  assert(a.instructions.length > 0, "instructions.md must be non-empty");
  assert(a.config.model || a.config.resolveModel, "a model or resolveModel must be configured");
});

Deno.test("claw agent exposes its facilitator tools", async () => {
  const a = await loadAgent(DIR);
  const names = Object.keys(a.tools);
  assertEquals(names.includes("askCodeAgent"), true);
  assertEquals(names.includes("fetchChannelHistory"), true);
  // Fix round 1 (claw-devx-reliability): recordDecision must be loaded so
  // claw can actually call it per facilitate-coding-task.md's instruction.
  assertEquals(names.includes("recordDecision"), true);
  // the old plan/build/ship tools are gone
  assertEquals(names.includes("dispatchToCode"), false);
  assertEquals(names.includes("shipIt"), false);
});

Deno.test("claw agent loads the facilitate-coding-task skill", async () => {
  const a = await loadAgent(DIR);
  const skill = a.skills.find((s) => s.name === "facilitate-coding-task");
  assert(skill, "facilitate-coding-task skill must be present");
  assert(skill!.description.length > 0, "facilitate-coding-task skill must have a non-empty description");
});

Deno.test("claw agent loads the support tools and skill", async () => {
  const a = await loadAgent(DIR);
  const names = Object.keys(a.tools);
  for (const t of ["lookupDiscordIds", "postDevSummary", "getSupportTask", "updateSupportTask", "replyToSupport"]) {
    assertEquals(names.includes(t), true, `missing tool ${t}`);
  }
  const skill = a.skills.find((s) => s.name === "handle-support-task");
  assert(skill, "handle-support-task skill must be present");
});
