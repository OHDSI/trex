// Continuation-token namespacing. A channel's raw continuation token (the
// adapter owns its format — e.g. slackContinuationToken(...) joins the team /
// channel / user identity fields) is prefixed with the channel id before it is
// used as the `continuation_token` key in agents.channel_sessions. This keeps
// two channels that happen to mint the same raw token pointing at distinct
// sessions (eve parity — see spec §4.1).
export function namespacedToken(channel: string, rawToken: string): string {
  return `${channel}:${rawToken}`;
}
