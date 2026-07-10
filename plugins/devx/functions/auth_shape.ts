// Derives a NON-SECRET credential-shape hint from a stored api_key, so the
// GET /provider-configs and GET /settings responses can tell the frontend
// WHAT KIND of credential is on file without ever revealing the credential
// itself (both routes mask api_key — LEFT(...,8)||'...'||RIGHT(...,4) — which
// is exactly why the client cannot derive this on its own: by the time
// useEffectiveLoop.ts sees api_key it is never valid JSON, so any client-side
// shape sniffing is dead code; see final-007 merge-gate re-review).
//
// The one consumer that gates on this today: useEffectiveLoop.ts forces the
// legacy loop when provider === "bedrock" && auth_shape === "iam", because
// the agents loop's resolveModel (plugins/devx/agent/agent.ts) only
// implements bearer-token bedrock auth and throws for IAM-shaped creds.
//
// Must be computed from the UNMASKED api_key server-side, BEFORE masking.
export type AuthShape = "bearer" | "iam" | "plain" | "none";

export function deriveAuthShape(apiKey: string | null | undefined): AuthShape {
  if (!apiKey) return "none";
  let parsed: unknown;
  try {
    parsed = JSON.parse(apiKey);
  } catch {
    // Not JSON: an ordinary opaque key (anthropic/openai/google/etc.).
    return "plain";
  }
  if (typeof parsed !== "object" || parsed === null) {
    // Valid JSON but a scalar ("null", numbers, bare strings) — no
    // recognizable credential structure. Same bucket as plain: the gate
    // only cares about "iam", and resolveModel treats this as absent.
    return "plain";
  }
  const creds = parsed as { bearerToken?: unknown; accessKeyId?: unknown; secretAccessKey?: unknown };
  if (creds.bearerToken) return "bearer";
  if (creds.accessKeyId || creds.secretAccessKey) return "iam";
  return "plain";
}
