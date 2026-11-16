import { assert, assertEquals } from "jsr:@std/assert";
import { loadAgent } from "../../../core/server/agents/loader.ts";

const DIR = new URL("./", import.meta.url).pathname;

Deno.test("concept-mapper loads with instructions and a model resolver", async () => {
  const a = await loadAgent(DIR);
  assert(a.instructions.length > 0, "instructions.md must be non-empty");
  assert(typeof a.config.resolveModel === "function", "resolveModel hook must be configured");
});

Deno.test("concept-mapper exposes exactly its mapping tools", async () => {
  const a = await loadAgent(DIR);
  assertEquals(Object.keys(a.tools).sort(), [
    "concept_details",
    "export_run",
    "judge_candidates",
    "next_rows",
    "retrieve_candidates",
    "save_coding_systems",
    "save_row_result",
    "start_run",
    "web_search",
  ]);
});

Deno.test("concept-mapper ships the phase skills", async () => {
  const a = await loadAgent(DIR);
  assertEquals(a.skills.map((s) => s.name).sort(), [
    "coding-system-identification",
    "low-confidence-enrichment",
    "query-fanout",
  ]);
  assert(a.skills.every((s) => (s.description ?? "").length > 20), "every skill needs a description");
});

Deno.test("instructions reference every tool and skill they rely on", async () => {
  const a = await loadAgent(DIR);
  for (const name of [...Object.keys(a.tools), ...a.skills.map((s) => s.name)]) {
    assert(a.instructions.includes(name), `instructions.md should mention ${name}`);
  }
});
