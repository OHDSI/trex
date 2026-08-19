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

// The fallback below forwards an UNCLASSIFIED raw error straight to Discord —
// unlike the SENTENCES above (fixed, reviewed copy), this is whatever text
// the upstream provider/coder
// happened to produce, which can be arbitrarily long and can contain a
// credential the provider echoed back in its own error message (an API key
// or bearer token quoted in a 401/403 body is common). Cap the length and
// scrub the obvious secret shapes before it reaches the channel.
const MAX_DETAIL_LEN = 300;

function scrubSecrets(detail: string): string {
  return detail
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\btoken=\S+/gi, "token=[redacted]")
    .replace(/\bkey=\S+/gi, "key=[redacted]");
}

export function describeCoderError(code: string | undefined, raw: string | undefined): string {
  // Object.hasOwn (not a truthy index): `code: "constructor"` (or any other
  // inherited Object.prototype key) must not resolve to a function via
  // SENTENCES[code] — it falls through to the raw-message branch instead,
  // same as any other unrecognized code.
  if (code && Object.hasOwn(SENTENCES, code)) return SENTENCES[code];
  const detail = raw?.trim();
  if (detail) {
    const safe = scrubSecrets(detail).slice(0, MAX_DETAIL_LEN);
    return `The coding session failed: ${safe}`;
  }
  return "The coding session failed without reporting a reason. Nothing was changed.";
}
