// @ts-nocheck - Deno edge function
// Does this turn run without a human at the other end?
//
// The OAuth sidecar engine answers this structurally: it runs its SDK with
// permissionMode "bypassPermissions", so nothing it does can ever raise a
// prompt. The ai-sdk engine has no such switch — it gates each state-changing
// tool on requireConsent(), which emits a consent_request and polls
// devx.pending_consents for 5 minutes before defaulting to DENY. A chat-channel
// turn has no consent UI to answer it, so without this the coder's first Write
// stalls for five minutes and is then denied.
//
// Deliberately strict about `=== true`: `remoteChannel` arrives from a request
// body (index.ts reads `body.remoteChannel === true` for exactly this reason),
// and a truthy string must never widen an approval gate.
export function runsUnattended(opts: {
  remoteChannel?: boolean;
  userAutoApprove?: boolean;
}): boolean {
  if (opts.remoteChannel === true) return true;
  return opts.userAutoApprove === true;
}
