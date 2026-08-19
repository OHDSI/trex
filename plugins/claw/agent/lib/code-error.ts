// Turns a devx error frame into ONE channel-ready sentence that names the
// repair action. The codes come from plugins/devx/functions/error_codes.ts;
// an unrecognized code falls through to the raw message rather than swallowing
// it — "unknown" in the channel is what this module exists to prevent.
const SENTENCES: Record<string, string> = {
  auth_expired:
    "The coding session's credentials expired, so I could not reach the workspace. Someone needs to re-authenticate the devx workspace, then I will pick this straight back up.",
  workspace_boot_failed:
    "The workspace runtime failed to start (its dependency cache is broken), so no command ran. This is a platform problem, not a problem in your repository.",
  rate_limited: "The model provider rate-limited this turn. I will retry shortly.",
  quota: "The model account's quota is exhausted, so the turn could not run.",
  model_not_found: "The configured coder model is not available. The model name in devx settings needs fixing.",
  invalid_key: "The coder's API key was rejected. It needs to be corrected in devx settings.",
};

export function describeCoderError(code: string | undefined, raw: string | undefined): string {
  if (code && SENTENCES[code]) return SENTENCES[code];
  const detail = raw?.trim();
  if (detail) return `The coding session failed: ${detail}`;
  return "The coding session failed without reporting a reason. Nothing was changed.";
}
