// Reimplemented from eve@0.19.0 dist/src/public/channels/linear/defaults.js
// (Apache-2.0). eve's `defaultLinearAuth` projects an **Agent Session** actor
// (`agentSession.creator` / `agentActivity.user`) — its shape does not fit the
// classic comment webhook the trex channel consumes — so the auth PROJECTION is
// reimplemented against a Comment/Issue actor (`linear:${userId}` principal,
// `linear:${orgId}` issuer, the same `authenticator`/`principalType` posture).
// eve's `createDefaultEvents` (Agent Activity progress/response handlers) and
// `defaultOnAgentSession` are NOT copied — they are shaped against eve's Agent
// Session runtime handle. The trex factory supplies its own `events` + dispatch
// against `ChannelRouteArgs`. See vendor/VENDOR.md.

import type { LinearAuthContext } from "./shared.ts";
import type { LinearIssueRef, LinearUserRef } from "./inbound.ts";

/** Inputs the default auth projection reads from a parsed comment/issue event. */
export interface LinearAuthInput {
  readonly type: string;
  readonly action: string;
  readonly actor: LinearUserRef | undefined;
  readonly issueId: string;
  readonly issue?: LinearIssueRef;
  readonly commentId?: string;
  readonly organizationId?: string;
  readonly deliveryId?: string;
}

/** Default auth projection for a Linear webhook actor. */
export function defaultLinearAuth(input: LinearAuthInput): LinearAuthContext {
  const actorId = input.actor?.id ?? "unknown";
  const attributes: Record<string, string> = {
    action: input.action,
    issue_id: input.issueId,
    type: input.type,
  };
  if (input.deliveryId !== undefined) attributes.delivery_id = input.deliveryId;
  if (input.commentId !== undefined) attributes.comment_id = input.commentId;
  if (input.organizationId !== undefined) attributes.organization_id = input.organizationId;
  if (input.issue?.identifier !== undefined) attributes.issue_identifier = input.issue.identifier;
  const label = linearUserLabel(input.actor);
  if (label !== undefined) attributes.user = label;
  return {
    attributes,
    authenticator: "linear-webhook",
    issuer: input.organizationId ? `linear:${input.organizationId}` : "linear",
    principalId: `linear:${actorId}`,
    principalType: "user",
    subject: actorId,
  };
}

function linearUserLabel(user: LinearUserRef | undefined): string | undefined {
  return user?.displayName ?? user?.name ?? user?.email;
}
