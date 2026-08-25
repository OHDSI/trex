// claw's model.ts stays pure/sync-testable; this file owns the one piece of
// I/O that resolveClawModel needs — the loopback call into devx to see
// whether a human has assigned claw a specific provider config in the
// Settings UI. See docs/superpowers/plans/2026-08-24-agent-provider-config-ui.md.
import { apiBase, mintToken } from "./code-stream.ts";
import { effectiveUserId } from "../tools/askCodeAgent.ts";
import type { ModelSpec } from "eve";

type EnvFn = (k: string) => string | undefined;

const CLAW_MODEL_PROVIDERS = new Set(["anthropic", "openai", "google", "bedrock"]);

export async function fetchClawModelOverride(
  env: EnvFn,
  ctxUserId: string | undefined,
  fetchImpl: typeof fetch = fetch,
  mintTokenFn: (userId: string) => Promise<string> = mintToken,
): Promise<ModelSpec | null> {
  // Same identity claw already uses to scope the coder hand-off
  // (askCodeAgent.ts) — reused here rather than re-derived, so claw's model
  // assignment and its coder delegation always agree on "which devx user".
  const userId = effectiveUserId(ctxUserId, env);
  if (!userId) return null;

  let res: Response;
  try {
    const token = await mintTokenFn(userId);
    res = await fetchImpl(`${apiBase()}/agent-model/claw`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // devx unreachable (not loaded in this deployment, or a transient
    // network hiccup) — this is a topology fact, not a credential problem,
    // so fall back to the legacy env-based config.
    return null;
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 500) {
      throw new Error(body?.error || `devx agent-model lookup failed with status ${res.status}`);
    }
    // Any other non-ok status (404 devx not loaded, 401 bad token, etc.) means
    // devx can't answer this — a deployment fact, not a credential problem —
    // so fall back to the legacy env-based config, same as a transport failure.
    return null;
  }
  if (!body.configured) return null;

  if (!CLAW_MODEL_PROVIDERS.has(body.provider)) {
    throw new Error(
      `devx assigned claw an unsupported provider "${body.provider}" — this should have been rejected ` +
        "when it was assigned (see provider_support.ts's assertProviderAllowedForAgent); fix the assignment in devx Settings.",
    );
  }

  return {
    provider: body.provider,
    modelId: body.model,
    apiKey: body.apiKey ?? undefined,
    baseURL: body.baseUrl ?? undefined,
  };
}
