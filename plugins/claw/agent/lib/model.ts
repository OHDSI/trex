import { fetchClawModelOverride } from "./agent-model-override.ts";

export type EnvFn = (k: string) => string | undefined;

export interface ModelSpec {
  provider: "anthropic" | "openai" | "google" | "bedrock";
  modelId: string;
  apiKey?: string;
  baseURL?: string;
}

export async function resolveClawModel(
  env: EnvFn,
  ctxUserId?: string,
  fetchOverride: typeof fetchClawModelOverride = fetchClawModelOverride,
): Promise<ModelSpec> {
  // A devx-assigned override always wins when one is configured; its
  // rejection propagates rather than falling back to env (see this plan's
  // Global Constraints — wrong-account risk).
  const override = await fetchOverride(env, ctxUserId);
  if (override) return override;

  const p = env("CLAW_MODEL_PROVIDER") ?? "anthropic";
  const provider = (p === "openai" || p === "google" || p === "bedrock") ? p : "anthropic";
  const modelId = env("CLAW_MODEL_ID") ?? "claude-sonnet-5";
  const apiKey = env("CLAW_API_KEY");
  if (!apiKey) throw new Error("claw: CLAW_API_KEY must be set");
  return { provider, modelId, apiKey, baseURL: env("CLAW_MODEL_BASE_URL") };
}
