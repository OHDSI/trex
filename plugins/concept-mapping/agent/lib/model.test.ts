import { assertEquals, assertThrows } from "jsr:@std/assert";
import { resolveConceptMappingModel } from "./model.ts";

const envOf = (vars: Record<string, string>) => (k: string) => vars[k];

Deno.test("CONCEPT_MAPPING_MODEL wins", () => {
  assertEquals(
    resolveConceptMappingModel(envOf({ CONCEPT_MAPPING_MODEL: "openai/gpt-5", TREX_AGENTS_DEFAULT_MODEL: "google/gemini-3" })),
    "openai/gpt-5",
  );
});

Deno.test("falls back to TREX_AGENTS_DEFAULT_MODEL when the agent var is blank", () => {
  assertEquals(
    resolveConceptMappingModel(envOf({ CONCEPT_MAPPING_MODEL: "  ", TREX_AGENTS_DEFAULT_MODEL: "google/gemini-3" })),
    "google/gemini-3",
  );
});

Deno.test("throws when no model is configured", () => {
  assertThrows(() => resolveConceptMappingModel(envOf({})), Error, "no model configured");
});
