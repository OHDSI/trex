// Stable machine-readable classification for coder-turn failures. The `safe`
// string is what the devx browser UI shows; the `code` is what claw maps to a
// channel-ready sentence with a repair action (plugins/claw/agent/lib/code-error.ts).
// Keep the two vocabularies in sync — a new code needs a claw-side sentence.
export type CoderErrorCode =
  | "auth_expired"
  | "workspace_boot_failed"
  | "rate_limited"
  | "quota"
  | "model_not_found"
  | "invalid_key"
  | "unclassified";

const GENERIC = "An error occurred while generating a response. Check the server logs for details.";

export function classifyCoderError(raw: string): { code: CoderErrorCode; safe: string } {
  const msg = (raw ?? "").trim();
  const lower = msg.toLowerCase();

  if (lower.includes("oauth") && lower.includes("expired")) {
    return { code: "auth_expired", safe: "The coding session's credentials expired. Re-authenticate to continue." };
  }
  if (lower.includes("brotli error") || lower.includes("failed to bootstrap runtime") || lower.includes("worker boot error")) {
    return { code: "workspace_boot_failed", safe: "The workspace runtime failed to start. Its dependency cache needs repair." };
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return { code: "rate_limited", safe: "Rate limit exceeded. Please wait and try again." };
  }
  if (lower.includes("api quota")) {
    return { code: "quota", safe: "API quota exhausted for this account." };
  }
  if (lower.includes("404") || lower.includes("not_found") || lower.includes("not found")) {
    return { code: "model_not_found", safe: "Model not found. Check the model name in Settings." };
  }
  if (lower.includes("401") || lower.includes("authentication") || (lower.includes("invalid") && lower.includes("key"))) {
    return { code: "invalid_key", safe: "Invalid API key. Please check your API key in Settings." };
  }
  return { code: "unclassified", safe: GENERIC };
}
