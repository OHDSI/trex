// @ts-nocheck
// Which provider claw asserts on the coder account before a turn.
//
// Historically claw PUT `provider: "claude-code"` on EVERY turn, so the coder
// could only ever run on the OAuth sidecar engine — and when that token's
// refresh grant died (2026-08-17) there was no way to move the coder onto
// another engine without editing code. Now the account's own configuration is
// authoritative by default, and the env vars exist only for headless
// deployments that have no one to click through the devx Settings UI.
//
// Returning null means "assert nothing": leave whatever the account has.
export interface CoderProviderIntent {
  provider: string;
  model?: string;
}

export function resolveCoderProviderIntent(
  env: (k: string) => string | undefined,
): CoderProviderIntent | null {
  // Empty string counts as unset: the manifest's `${CLAW_CODER_PROVIDER:-}`
  // substitution bakes "" into the worker env when the host var is absent —
  // the same trap effectiveUserId() documents for CLAW_CODE_USER_ID.
  const provider = env("CLAW_CODER_PROVIDER")?.trim();
  if (!provider) return null;
  const model = env("CLAW_CODER_MODEL")?.trim();
  return model ? { provider, model } : { provider };
}
