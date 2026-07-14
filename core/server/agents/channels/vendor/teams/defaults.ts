// Vendored from eve@0.19.0 dist/src/public/channels/teams/defaults.js
// (Apache-2.0). Modified: ONLY the pure `defaultTeamsAuth` is vendored (its
// input narrowed to a `TeamsAuthInput`, its `#channel/types` `SessionAuthContext`
// return → the sibling `TeamsAuthContext`); de-minified. The auth-projection
// logic — `teams:{tenant}:{userId}` principal, `teams:{tenant}` issuer, the
// `teams-activity` authenticator, `bot` role → `service` — is unchanged. eve's
// `defaultOnMessage`, `defaultEvents`, and `teamsMentionUser` were intentionally
// NOT copied — they are shaped against eve's runtime channel handle
// (`ctx.thread`, `startTyping`) and its `#internal/logging` module, i.e. eve
// runtime code. The trex factory supplies its own `events` + dispatch against
// `ChannelRouteArgs`. See vendor/VENDOR.md.

import type { TeamsAuthContext } from "./shared.ts";

/** Inputs the default auth projection reads from a parsed Teams Activity. */
export interface TeamsAuthInput {
  readonly id: string;
  readonly scope: string;
  readonly conversation: { readonly id: string };
  readonly from: { readonly id: string; readonly name?: string; readonly role?: string; readonly aadObjectId?: string };
  readonly tenantId?: string;
  readonly teamId?: string;
  readonly teamsChannelId?: string;
}

/** Default auth projection for a Teams Activity actor (eve's, unchanged). */
export function defaultTeamsAuth(input: TeamsAuthInput): TeamsAuthContext {
  const tenantId = input.tenantId;
  const attributes: Record<string, string> = {
    activity_id: input.id,
    conversation_id: input.conversation.id,
    scope: input.scope,
    user_id: input.from.id,
  };
  if (input.from.name !== undefined) attributes.user_name = input.from.name;
  if (input.from.aadObjectId !== undefined) attributes.aad_object_id = input.from.aadObjectId;
  if (tenantId !== undefined) attributes.tenant_id = tenantId;
  if (input.teamId !== undefined) attributes.team_id = input.teamId;
  if (input.teamsChannelId !== undefined) attributes.channel_id = input.teamsChannelId;
  return {
    attributes,
    authenticator: "teams-activity",
    issuer: tenantId ? `teams:${tenantId}` : "teams",
    principalId: tenantId ? `teams:${tenantId}:${input.from.id}` : `teams:${input.from.id}`,
    principalType: input.from.role === "bot" ? "service" : "user",
    subject: input.from.aadObjectId,
  };
}
