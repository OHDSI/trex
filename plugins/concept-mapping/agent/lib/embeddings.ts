// Embedding models for the local search index, as "provider/model-id"
// strings using the same credential env vars as the agents runtime. An
// OpenAI-compatible server (OPENAI_BASE_URL, e.g. Ollama, vLLM, TEI) keeps
// embedding fully on-premises.
import type { Env } from "./vocab.ts";

export type Embedder = (texts: string[]) => Promise<number[][]>;

export function parseEmbeddingModel(s: string): { provider: string; modelId: string } {
  const i = s.indexOf("/");
  if (i <= 0 || i === s.length - 1) throw new Error(`embedding model must be "provider/model-id", got "${s}"`);
  return { provider: s.slice(0, i), modelId: s.slice(i + 1) };
}

// deno-lint-ignore no-explicit-any
function embeddingModelOf(provider: any, modelId: string): any {
  for (const k of ["embedding", "textEmbeddingModel", "textEmbedding"]) {
    if (typeof provider?.[k] === "function") return provider[k](modelId);
  }
  throw new Error("provider has no embedding model factory");
}

/**
 * Provider options asking for `dims` dimensions. Models with a fixed size
 * (e.g. SapBERT behind a local OpenAI-compatible server) may reject the
 * parameter: CONCEPT_MAPPING_EMBEDDING_DIMENSIONS_PARAM=off omits it. The
 * returned vectors are still checked against `dims`.
 */
export function embeddingProviderOptions(provider: string, dims: number, env: Env): Record<string, Record<string, unknown>> {
  if (env("CONCEPT_MAPPING_EMBEDDING_DIMENSIONS_PARAM")?.trim().toLowerCase() === "off") return {};
  switch (provider) {
    case "openai":
      return { openai: { dimensions: dims } };
    case "azure":
      return { openai: { dimensions: dims }, azure: { dimensions: dims } };
    case "google":
      return { google: { outputDimensionality: dims } };
    case "bedrock":
      return { bedrock: { dimensions: dims } };
    default:
      return {};
  }
}

export async function resolveEmbedder(modelString: string, env: Env, dims: number): Promise<Embedder> {
  const { provider, modelId } = parseEmbeddingModel(modelString);
  // deno-lint-ignore no-explicit-any
  let model: any;
  switch (provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const baseURL = env("OPENAI_BASE_URL");
      model = embeddingModelOf(createOpenAI({ apiKey: env("OPENAI_API_KEY") ?? "none", ...(baseURL ? { baseURL } : {}) }), modelId);
      break;
    }
    case "azure": {
      const { createAzure } = await import("@ai-sdk/azure");
      const baseURL = env("AZURE_BASE_URL");
      model = embeddingModelOf(
        createAzure({ apiKey: env("AZURE_API_KEY"), ...(baseURL ? { baseURL } : { resourceName: env("AZURE_RESOURCE_NAME") }) }),
        modelId,
      );
      break;
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      model = embeddingModelOf(createGoogleGenerativeAI({ apiKey: env("GOOGLE_GENERATIVE_AI_API_KEY") }), modelId);
      break;
    }
    case "bedrock": {
      const { createAmazonBedrock } = await import("@ai-sdk/amazon-bedrock");
      const apiKey = env("AWS_BEARER_TOKEN_BEDROCK");
      model = embeddingModelOf(
        createAmazonBedrock({ region: env("AWS_REGION") || "us-east-1", ...(apiKey ? { apiKey } : {}) }),
        modelId,
      );
      break;
    }
    default:
      throw new Error(`unsupported embedding provider ${provider} (use openai, azure, google or bedrock)`);
  }
  const providerOptions = embeddingProviderOptions(provider, dims, env);
  const { embedMany } = await import("ai");
  return async (texts) => {
    const { embeddings } = await embedMany({ model, values: texts, providerOptions, maxRetries: 3 });
    for (const e of embeddings) {
      if (e.length !== dims) throw new Error(`${modelString} returned ${e.length} dimensions, expected ${dims}`);
    }
    return embeddings;
  };
}
