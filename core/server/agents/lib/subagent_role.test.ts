// Task 14: per-subagent reasoning_effort and skills — REDUCING ONLY. Ported
// from codex's role.rs: a role may narrow a child's capabilities, never
// grant it something its parent does not have. See loader.ts's
// resolveChildSkills/resolveAgentRole and their allowlist/EDN-map, which
// follow resolveContextConfig's pattern exactly (lib/context_config.test.ts) —
// a key missing from that allowlist is what silently dropped two ContextConfig
// fields in the previous cycle of work on this runtime.
import { assertEquals } from "jsr:@std/assert";
import { resolveAgentRole, resolveChildSkills } from "../loader.ts";

Deno.test("a subagent's skills intersect its parent's, never union", () => {
  const effective = resolveChildSkills(["a", "b"], ["b", "c"]);
  assertEquals(effective, ["b"]);
});

Deno.test("a subagent declaring no skills inherits its parent's", () => {
  assertEquals(resolveChildSkills(["a", "b"], undefined), ["a", "b"]);
});

Deno.test("a subagent cannot grant itself a skill its parent lacks", () => {
  // The invariant stated directly: declaring MORE than the parent has never
  // raises the effective set above the parent's.
  assertEquals(resolveChildSkills([], ["anything"]), []);
});

Deno.test("reasoning_effort round-trips through both key forms", () => {
  assertEquals(resolveAgentRole({ reasoningEffort: "high" }).reasoningEffort, "high");
  assertEquals(resolveAgentRole({ "reasoning-effort": "low" } as never).reasoningEffort, "low");
});

Deno.test("skills round-trips through both key forms", () => {
  assertEquals(resolveAgentRole({ skills: ["a"] }).skills, ["a"]);
  assertEquals(resolveAgentRole({ "skills": ["b"] } as never).skills, ["b"]);
});

Deno.test("resolveAgentRole ignores unknown keys", () => {
  const role = resolveAgentRole({ bogus: 1, reasoningEffort: "low" } as never);
  assertEquals(role.reasoningEffort, "low");
  assertEquals("bogus" in role, false);
});

Deno.test("resolveAgentRole returns an empty object when unconfigured", () => {
  assertEquals(resolveAgentRole(undefined), {});
});
