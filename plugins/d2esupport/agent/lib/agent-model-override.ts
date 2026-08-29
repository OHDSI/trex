import { devxApiBase, mintToken } from "./devx-api.ts";
import type { ModelSpec } from "eve";

type EnvFn = (k: string) => string | undefined;

// `openai-compatible` is devx's name for "the OpenAI wire format at someone
// else's base URL" (Azure, vLLM, a gateway). It is not a distinct client: the
// runtime's buildModel routes it through the SAME createOpenAI as `openai`,
// differing only by baseURL — see core/server/agents/service/model.ts, whose
// openai branch is commented "openai and openai-compatible (custom base url)".
// So it is accepted here and normalised to `openai` below, because ModelSpec's
// provider union (eve-shim/types.ts) has no `openai-compatible` member.
const SUPPORT_MODEL_PROVIDERS = new Set(["anthropic", "openai", "google", "bedrock", "openai-compatible"]);

// Deliberately reads D2ESUPPORT_USER_ID through the injected `env`, not via
// devx-api.ts's own supportUserId() (which reads Deno.env directly) — this
// function must be testable by injecting `env`, and calling supportUserId()
// here would silently ignore that injection and read the real process
// environment instead.
export async function fetchSupportModelOverride(
  env: EnvFn,
  fetchImpl: typeof fetch = fetch,
  mintTokenFn: (userId: string) => Promise<string> = mintToken,
): Promise<ModelSpec | null> {
  const userId = env("D2ESUPPORT_USER_ID")?.trim();
  if (!userId) return null;

  let res: Response;
  try {
    const token = await mintTokenFn(userId);
    res = await fetchImpl(`${devxApiBase()}/agent-model/d2esupport`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
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

  if (!SUPPORT_MODEL_PROVIDERS.has(body.provider)) {
    throw new Error(
      `devx assigned d2esupport an unsupported provider "${body.provider}" — this should have been ` +
        "rejected when it was assigned; fix the assignment in devx Settings.",
    );
  }

  // Without a base URL an `openai-compatible` config silently falls through to
  // OPENAI_BASE_URL (or api.openai.com) and sends a private deployment name to
  // the wrong vendor, which fails as a confusing model-not-found rather than as
  // the misconfiguration it is. Refuse it here instead.
  if (body.provider === "openai-compatible" && !body.baseUrl) {
    throw new Error(
      `devx assigned d2esupport the "openai-compatible" provider with no base URL — ` +
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
