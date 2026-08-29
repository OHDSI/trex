// Derives a NON-SECRET credential-shape hint from a stored api_key, so the
// GET /provider-configs and GET /settings responses can tell the frontend
// WHAT KIND of credential is on file without ever revealing the credential
// itself (both routes mask api_key — LEFT(...,8)||'...'||RIGHT(...,4) — which
// is exactly why the client cannot derive this on its own: by the time
// useEffectiveLoop.ts sees api_key it is never valid JSON, so any client-side
// shape sniffing is dead code; see final-007 merge-gate re-review).
//
// Not a loop gate: useEffectiveLoop.ts does NOT branch on this value (only
// provider === "claude-code" forces the legacy loop). It is a display-only
// hint — GET /settings and GET /provider-configs attach it so the frontend
// can show what kind of credential is on file (see src/hooks/useSettings.ts
// and src/lib/types.ts) alongside key_status/is_plaintext. IAM-shaped
// bedrock credentials are simply unsupported: the agents loop's resolveModel
// (plugins/devx/agent/agent.ts) only implements bearer-token bedrock auth
// and throws a clear, actionable error for IAM-shaped creds.
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
