import { assertEquals, assertRejects } from "jsr:@std/assert";
import { parseEmbeddingModel, resolveEmbedder } from "./embeddings.ts";

Deno.test("parses provider/model-id, keeping slashes in the model id", () => {
  assertEquals(parseEmbeddingModel("openai/text-embedding-3-large"), { provider: "openai", modelId: "text-embedding-3-large" });
  assertEquals(parseEmbeddingModel("openai/BAAI/bge-m3"), { provider: "openai", modelId: "BAAI/bge-m3" });
});

Deno.test("an unsupported provider is refused with the supported list", async () => {
  await assertRejects(
    () => resolveEmbedder("anthropic/x", () => undefined, 1024),
    Error,
    "unsupported embedding provider anthropic (use openai, azure, google or bedrock)",
  );
});
