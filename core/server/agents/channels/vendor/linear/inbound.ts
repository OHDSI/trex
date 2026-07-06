// Reimplemented from eve@0.19.0 dist/src/public/channels/linear/inbound.js
// (Apache-2.0). eve's `parseLinearWebhookEvent` is PURE (imports only
// `#shared/guards`/`#shared/json`), but it is shaped around Linear's **Agent
// Session** model (`AgentSessionEvent` → `agentActivity`); its non-session
// branch collapses every other delivery into an opaque `{ kind:"data", type,
// action, raw }`. The trex Linear channel follows the CLASSIC Comment/Issue
// webhook model (like the GitHub adapter), so this file keeps eve's data-webhook
// CLASSIFICATION (read `type`/`action`/`data`, the `Linear-Event`/
// `Linear-Delivery` headers, `organizationId`) but ADDS the comment/issue field
// extraction, the loop guard, the issue-id continuation token, and the context
// block that eve's agent-session path does NOT provide. The agent-session
// readers (`readAgentSession`/`readAgentActivity`/…) and eve's
// `agent-session:`-prefixed token are DROPPED (YAGNI — a different integration
// model). `#shared/guards`/`#shared/json` → the sibling `shared.ts`. See
// vendor/VENDOR.md.

import { isObject, type JsonObject, parseJsonObject } from "./shared.ts";

/** Raw inbound webhook the parser consumes: the raw body + request headers. */
export interface LinearWebhookInput {
  readonly body: string;
  readonly headers: Headers;
}

/** Delivery envelope from the `Linear-Event` / `Linear-Delivery` headers. */
export interface LinearDelivery {
  readonly event: string | undefined;
  readonly id: string | undefined;
}

/**
 * A parsed Linear data webhook: the resource `type` (`Comment`, `Issue`, …), the
 * `action` (`create`/`update`/`remove`), the resource `data` node, and the
 * delivery/org envelope. `raw` is the full payload (the loop guard reads the
 * top-level `actor` from it).
 */
export interface LinearInboundEvent {
  readonly type: string;
  readonly action: string;
  readonly data: JsonObject;
  readonly organizationId: string | undefined;
  readonly delivery: LinearDelivery;
  readonly webhookTimestamp: number | undefined;
  readonly raw: JsonObject;
}

/** A Linear user reference distilled from a webhook payload. */
export interface LinearUserRef {
  readonly id: string;
  readonly name?: string;
  readonly displayName?: string;
  readonly email?: string;
}

/** A Linear issue reference distilled from a webhook payload. */
export interface LinearIssueRef {
  readonly id: string;
  readonly identifier?: string;
  readonly title?: string;
  readonly url?: string;
}

/**
 * The continuation token addressing one Linear ISSUE THREAD as one agent session
 * — the RAW issue id (the runtime namespaces it with the channel id). An issue
 * thread === a session, so every comment on an issue continues the same session.
 */
export function linearContinuationToken(issueId: string): string {
  return issueId;
}

/**
 * Parses a raw Linear webhook delivery into a normalized data event, or null
 * when the payload is malformed or carries no `type`/`data`. Mirrors eve's
 * data-webhook classification (`type`, `action`, `data`, the `Linear-Event`/
 * `Linear-Delivery` headers, `organizationId`).
 */
export function parseLinearWebhookEvent(input: LinearWebhookInput): LinearInboundEvent | null {
  let raw: JsonObject;
  try {
    raw = parseJsonObject(JSON.parse(input.body));
  } catch {
    return null;
  }
  const type = readString(raw.type);
  const data = isObject(raw.data) ? parseJsonObject(raw.data) : null;
  if (type === undefined || data === null) return null;
  return {
    action: readString(raw.action) ?? "",
    data,
    delivery: {
      event: input.headers.get("linear-event") ?? undefined,
      id: input.headers.get("linear-delivery") ?? undefined,
    },
    organizationId: readString(raw.organizationId),
    raw,
    type,
    webhookTimestamp: typeof raw.webhookTimestamp === "number" ? raw.webhookTimestamp : undefined,
  };
}

/**
 * The actor that authored an inbound event — used for the LOOP GUARD and auth
 * projection. Prefers the resource's own author (`data.user`/`data.userId` for a
 * comment, `data.creator`/`data.creatorId` for an issue) and falls back to the
 * top-level webhook `actor` (the user who triggered an update).
 */
export function readLinearActor(event: LinearInboundEvent): LinearUserRef | undefined {
  return readUser(event.data.user) ??
    idOnlyUser(event.data.userId) ??
    readUser(event.data.creator) ??
    idOnlyUser(event.data.creatorId) ??
    readUser(event.raw.actor);
}

/**
 * Decides whether an inbound comment/event should ignore-and-drop rather than
 * start a turn — the LOOP GUARD. True when the actor is the bot itself
 * (`actorId === botUserId`) or the body carries the trex HITL marker. Without
 * this the agent would answer its OWN commentCreate deliveries forever (Linear
 * echoes the bot's comments back as `Comment.create` webhooks).
 */
export function isIgnoredLinearEvent(body: string, actorId: string | undefined, botUserId?: string): boolean {
  if (body.includes(LINEAR_TREX_MARKER)) return true;
  if (!actorId || !botUserId) return false;
  return actorId === botUserId;
}

/** Hidden marker stamped on agent-authored comments as a belt-and-braces loop guard. */
export const LINEAR_TREX_MARKER = "<!-- trex:linear:agent -->";

/** Renders an opened issue's `title\n\ndescription` from its raw data node. */
export function linearIssueBody(data: JsonObject): string {
  const title = readString(data.title) ?? "";
  const description = readString(data.description) ?? "";
  return [title, description].filter((s) => s.length > 0).join("\n\n");
}

/** Identity + response guidance for the model-visible context block. */
export interface LinearContextInput {
  readonly type: string;
  readonly action: string;
  readonly issueId: string;
  readonly issue?: LinearIssueRef;
  readonly commentId?: string;
  readonly organizationId?: string;
  readonly deliveryId?: string;
}

/** Renders one `<linear_context>` block with issue/thread/actor identity. */
export function formatLinearContextBlock(context: LinearContextInput): string {
  return [
    "<linear_context>",
    `type: ${context.type}`,
    `action: ${context.action}`,
    `issue_id: ${context.issueId}`,
    ...(context.issue?.identifier ? [`issue_identifier: ${context.issue.identifier}`] : []),
    ...(context.issue?.title ? [`issue_title: ${context.issue.title}`] : []),
    ...(context.issue?.url ? [`issue_url: ${context.issue.url}`] : []),
    ...(context.commentId ? [`comment_id: ${context.commentId}`] : []),
    ...(context.organizationId ? [`organization_id: ${context.organizationId}`] : []),
    ...(context.deliveryId ? [`delivery_id: ${context.deliveryId}`] : []),
    "response_medium: linear_comment",
    "</linear_context>",
  ].join("\n");
}

// ---- payload readers (mirror eve's `readUser`/`readIssue`/`readString`) -----

export function readLinearIssueRef(v: unknown): LinearIssueRef | undefined {
  if (!isObject(v) || typeof v.id !== "string") return undefined;
  const ref: { id: string; identifier?: string; title?: string; url?: string } = { id: v.id };
  if (typeof v.identifier === "string") ref.identifier = v.identifier;
  if (typeof v.title === "string") ref.title = v.title;
  if (typeof v.url === "string") ref.url = v.url;
  return ref;
}

function readUser(v: unknown): LinearUserRef | undefined {
  if (!isObject(v) || typeof v.id !== "string") return undefined;
  const user: { id: string; name?: string; displayName?: string; email?: string } = { id: v.id };
  if (typeof v.name === "string") user.name = v.name;
  if (typeof v.displayName === "string") user.displayName = v.displayName;
  if (typeof v.email === "string") user.email = v.email;
  return user;
}

function idOnlyUser(v: unknown): LinearUserRef | undefined {
  return typeof v === "string" && v.length > 0 ? { id: v } : undefined;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
