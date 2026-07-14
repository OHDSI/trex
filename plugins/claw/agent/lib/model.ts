export type EnvFn = (k: string) => string | undefined;

export interface ModelSpec {
  provider: "anthropic" | "openai" | "google" | "bedrock";
  modelId: string;
  apiKey?: string;
  baseURL?: string;
}

export function resolveClawModel(env: EnvFn): ModelSpec {
  const p = env("CLAW_MODEL_PROVIDER") ?? "anthropic";
  const provider = (p === "openai" || p === "google" || p === "bedrock") ? p : "anthropic";
  const modelId = env("CLAW_MODEL_ID") ?? "claude-sonnet-5";
  const apiKey = env("CLAW_API_KEY");
  if (!apiKey) throw new Error("claw: CLAW_API_KEY must be set");
  return { provider, modelId, apiKey, baseURL: env("CLAW_MODEL_BASE_URL") };
}
