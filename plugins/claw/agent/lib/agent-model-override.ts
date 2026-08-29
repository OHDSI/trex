// claw's model.ts stays pure/sync-testable; this file owns the one piece of
// I/O that resolveClawModel needs — the loopback call into devx to see
// whether a human has assigned claw a specific provider config in the
// Settings UI. See docs/superpowers/plans/2026-08-24-agent-provider-config-ui.md.
import { apiBase, mintToken } from "./code-stream.ts";
import { effectiveUserId } from "../tools/askCodeAgent.ts";
import type { ModelSpec } from "eve";

type EnvFn = (k: string) => string | undefined;

// `openai-compatible` is devx's name for "the OpenAI wire format at someone
// else's base URL" (Azure, vLLM, a gateway). It is not a distinct client: the
// runtime's buildModel routes it through the SAME createOpenAI as `openai`,
// differing only by baseURL — see core/server/agents/service/model.ts, whose
// openai branch is commented "openai and openai-compatible (custom base url)".
// So it is accepted here and normalised to `openai` below, because ModelSpec's
// provider union (eve-shim/types.ts) has no `openai-compatible` member.
const CLAW_MODEL_PROVIDERS = new Set(["anthropic", "openai", "google", "bedrock", "openai-compatible"]);

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

  // Without a base URL an `openai-compatible` config silently falls through to
  // OPENAI_BASE_URL (or api.openai.com) and sends a private deployment name to
  // the wrong vendor, which fails as a confusing model-not-found rather than as
  // the misconfiguration it is. Refuse it here instead.
  if (body.provider === "openai-compatible" && !body.baseUrl) {
    throw new Error(
      `devx assigned claw the "openai-compatible" provider with no base URL — ` +
        "set the base URL on that provider config in devx Settings.",
    );
  }

  return {
    // Normalised, not passed through: ModelSpec.provider has no
    // `openai-compatible` member, and the client is the same either way.
    provider: body.provider === "openai-compatible" ? "openai" : body.provider,
    modelId: body.model,
    apiKey: body.apiKey ?? undefined,
    baseURL: body.baseUrl ?? undefined,
  };
}
