export type EnvFn = (k: string) => string | undefined;

export interface ModelSpec {
  provider: "anthropic" | "openai" | "google" | "bedrock";
  modelId: string;
  apiKey?: string;
  baseURL?: string;
}

export function resolveSupportModel(env: EnvFn): ModelSpec {
  const p = env("D2ESUPPORT_MODEL_PROVIDER") ?? "anthropic";
  const provider = (p === "openai" || p === "google" || p === "bedrock") ? p : "anthropic";
  const modelId = env("D2ESUPPORT_MODEL_ID") ?? "claude-sonnet-5";
  const apiKey = env("D2ESUPPORT_API_KEY");
  if (!apiKey) throw new Error("d2esupport: D2ESUPPORT_API_KEY must be set");
  return { provider, modelId, apiKey, baseURL: env("D2ESUPPORT_MODEL_BASE_URL") };
}
