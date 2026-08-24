import { devxApiBase, mintToken } from "./devx-api.ts";
import type { ModelSpec } from "eve";

type EnvFn = (k: string) => string | undefined;

const SUPPORT_MODEL_PROVIDERS = new Set(["anthropic", "openai", "google", "bedrock"]);

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

  return {
    provider: body.provider,
    modelId: body.model,
    apiKey: body.apiKey ?? undefined,
    baseURL: body.baseUrl ?? undefined,
  };
}
