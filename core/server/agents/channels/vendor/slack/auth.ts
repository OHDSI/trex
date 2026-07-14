// Vendored from eve@0.19.0 dist/src/public/channels/slack/auth.js (Apache-2.0).
// Modified: de-minified; the type-only `#channel/types` SessionAuthContext is
// replaced by the sibling `SlackAuthContext` shape in `./shared.ts`. Auth-context
// derivation logic unchanged. See vendor/VENDOR.md.

import type { SlackAuthContext } from "./shared.ts";

export interface SlackAuthContextInput {
  readonly channelId: string;
  readonly fullName?: string;
  readonly isBot?: boolean;
  readonly teamId?: string | null;
  readonly threadTs: string;
  readonly userId: string;
  readonly userName?: string;
}

/** Returns the Slack user id carried by a Slack-derived auth context. */
export function slackUserIdFromAuthContext(auth: SlackAuthContext | null): string | undefined {
  if (auth?.authenticator !== "slack-webhook") return undefined;
  const userId = auth.attributes.user_id;
  return typeof userId === "string" && userId.length > 0 ? userId : undefined;
}

/**
 * Builds the Slack-derived session auth context used by inbound messages and
 * signed interactivity callbacks. `principalId` is team-scoped when the envelope
 * carried a team id, and `principalType` is `service` for bot actors.
 */
export function buildSlackAuthContext(input: SlackAuthContextInput): SlackAuthContext {
  const isBot = input.isBot === true;
  const principalId = input.teamId
    ? (isBot ? `slack:${input.teamId}:bot:${input.userId}` : `slack:${input.teamId}:${input.userId}`)
    : (isBot ? `slack:bot:${input.userId}` : `slack:${input.userId}`);
  const attributes: Record<string, string> = {
    author_type: isBot ? "bot" : "user",
    channel_id: input.channelId,
    thread_ts: input.threadTs,
    user_id: input.userId,
  };
  if (input.userName) attributes.user_name = input.userName;
  if (input.fullName) attributes.full_name = input.fullName;
  if (input.teamId) attributes.team_id = input.teamId;
  return {
    attributes,
    authenticator: "slack-webhook",
    issuer: input.teamId ? `slack:${input.teamId}` : "slack",
    principalId,
    principalType: isBot ? "service" : "user",
  };
}
