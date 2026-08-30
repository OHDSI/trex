// @ts-nocheck - Deno edge function
// Does this turn run without a human at the other end?
//
// Both engines now route through devx's own consent path: the OAuth sidecar's
// canUseTool asks answerPermissionRequest/decidePermission, and the ai-sdk
// engine's requireConsent() does the same, each polling devx.pending_consents
// for 5 minutes before defaulting to DENY. A chat-channel turn has no consent
// UI to answer it, so without this the coder's first tool call stalls for five
// minutes and is then denied.
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
