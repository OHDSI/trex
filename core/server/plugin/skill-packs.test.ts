import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import {
  _clearDeclaredSkillPacksForTest,
  normalizeSkillsValue,
  packsForAgent,
  packTargetsAgent,
  registerSkillPack,
  type SkillPackEntry,
} from "./skill-packs.ts";

function pack(over: Partial<SkillPackEntry> = {}): SkillPackEntry {
  return { name: "p1", dir: "pack", agents: ["toy"], srcDir: "/src/p1", pluginName: "@trex/a", ...over };
}

Deno.test("normalizeSkillsValue accepts array and single-object forms, defaults dir to 'pack'", () => {
  assertEquals(
    normalizeSkillsValue([{ name: "a", dir: "d", agents: ["toy"] }]),
    [{ name: "a", dir: "d", agents: ["toy"] }],
  );
  assertEquals(normalizeSkillsValue({ name: "a", agents: ["*"] }), [{ name: "a", dir: "pack", agents: ["*"] }]);
});

Deno.test("normalizeSkillsValue rejects bad names, '--', missing/empty/invalid agents, duplicates", () => {
  assertThrows(() => normalizeSkillsValue([{ name: "", agents: ["toy"] }]), Error, "needs a name");
  assertThrows(() => normalizeSkillsValue([{ name: "a--b", agents: ["toy"] }]), Error, "needs a name");
  assertThrows(() => normalizeSkillsValue([{ name: "a" }]), Error, "agents");
  assertThrows(() => normalizeSkillsValue([{ name: "a", agents: [] }]), Error, "agents");
  assertThrows(() => normalizeSkillsValue([{ name: "a", agents: ["bad name"] }]), Error, "agents");
  assertThrows(
    () => normalizeSkillsValue([{ name: "a", agents: ["toy"] }, { name: "a", agents: ["*"] }]),
    Error,
    "duplicate",
  );
});

Deno.test("registerSkillPack: new → true; identical re-registration → false; cross-plugin name clash → throws", () => {
  _clearDeclaredSkillPacksForTest();
  assertEquals(registerSkillPack(pack()), true);
  // The boot pre-pass records packs before dispatch; the dispatch pass
  // re-encountering the identical pack must be a silent no-op.
  assertEquals(registerSkillPack(pack()), false);
  assertThrows(
    () => registerSkillPack(pack({ pluginName: "@trex/b", srcDir: "/src/other" })),
    Error,
    "already declared",
  );
});

Deno.test("packTargetsAgent matches exact names and '*'", () => {
  assert(packTargetsAgent(pack({ agents: ["toy", "claw"] }), "toy"));
  assert(!packTargetsAgent(pack({ agents: ["toy"] }), "claw"));
  assert(packTargetsAgent(pack({ agents: ["*"] }), "anything"));
});

Deno.test("packsForAgent returns matching packs name-sorted (deterministic staging order)", () => {
  _clearDeclaredSkillPacksForTest();
  registerSkillPack(pack({ name: "zeta", agents: ["*"] }));
  registerSkillPack(pack({ name: "alpha", agents: ["toy"] }));
  registerSkillPack(pack({ name: "other", agents: ["claw"] }));
  assertEquals(packsForAgent("toy").map((p) => p.name), ["alpha", "zeta"]);
  assertEquals(packsForAgent("nobody").map((p) => p.name), ["zeta"]);
});
