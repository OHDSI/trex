import { assertEquals, assertThrows } from "jsr:@std/assert";
import { parseArgs } from "./build-index.ts";

Deno.test("defaults: embed with the configured model at 1024 dimensions", () => {
  assertEquals(parseArgs([], (k) => (k === "CONCEPT_MAPPING_EMBEDDING_MODEL" ? "openai/text-embedding-3-large" : undefined)), {
    embed: true, dims: 1024, batch: 256, model: "openai/text-embedding-3-large",
  });
});

Deno.test("--lexical-only builds without embeddings or a model", () => {
  assertEquals(parseArgs(["--lexical-only"], () => undefined), { embed: false, dims: 1024, batch: 256, model: "" });
});

Deno.test("embedding without a model is refused", () => {
  assertThrows(() => parseArgs([], () => undefined), Error, "set CONCEPT_MAPPING_EMBEDDING_MODEL or pass --lexical-only");
});

Deno.test("--dims and --batch are parsed and validated", () => {
  const env = () => "openai/m";
  assertEquals(parseArgs(["--dims", "512", "--batch", "64"], env), { embed: true, dims: 512, batch: 64, model: "openai/m" });
  assertThrows(() => parseArgs(["--dims", "0"], env), Error, "--dims");
});
