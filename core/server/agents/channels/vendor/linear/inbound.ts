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

/**
 * Raw inbound webhook the parser consumes: the request headers plus EITHER an
 * already-parsed `payload` (the signature path parses once and threads it) or a
 * raw `body` string to parse (the verifier path / a rewritten body).
 */
export interface LinearWebhookInput {
  readonly body?: string;
  readonly payload?: JsonObject;
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
  if (input.payload !== undefined) {
    raw = input.payload;
  } else {
    try {
      raw = parseJsonObject(JSON.parse(input.body ?? ""));
    } catch {
      return null;
    }
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
 * projection. Prefers the resource's HUMAN author (`data.user`/`data.userId` for
 * a comment, `data.creator`/`data.creatorId` for an issue, then the top-level
 * webhook `actor`) and falls back to `data.botActor` — the app/agent identity
 * Linear attributes a comment to when it was posted with an OAuth agent/app token
 * (in that case `data.user` is null). Used for auth attribution; the loop guard
 * uses `readLinearHumanActor` + the botActor presence check directly.
 */
export function readLinearActor(event: LinearInboundEvent): LinearUserRef | undefined {
  return readLinearHumanActor(event) ?? readUser(event.data.botActor);
}

/** The HUMAN author of an event (excludes `data.botActor`). */
function readLinearHumanActor(event: LinearInboundEvent): LinearUserRef | undefined {
  return readUser(event.data.user) ??
    idOnlyUser(event.data.userId) ??
    readUser(event.data.creator) ??
    idOnlyUser(event.data.creatorId) ??
    readUser(event.raw.actor);
}

/**
 * Decides whether an inbound comment/event should ignore-and-drop rather than
 * start a turn — the LOOP GUARD. Without it the agent answers its OWN
 * commentCreate deliveries forever (Linear echoes the bot's comments back as
 * `Comment.create` webhooks). Drops when ANY of:
 *   1) the body carries the trex marker we stamp on every outgoing comment — a
 *      CONFIG-FREE guard that needs no bot-id configuration;
 *   2) the event is APP-AUTHORED — `data.botActor` is present with no human
 *      author — i.e. posted by our OAuth agent/app token (also config-free);
 *   3) (optional) the human actor id equals a configured `botUserId`.
 */
export function isIgnoredLinearEvent(event: LinearInboundEvent, body: string, botUserId?: string): boolean {
  // 1) our own marker — config-free.
  if (body.includes(LINEAR_TREX_MARKER)) return true;
  // 2) app/agent-token authored (botActor present, no human) — config-free.
  if (isObject(event.data.botActor) && readLinearHumanActor(event) === undefined) return true;
  // 3) explicit bot user id, when configured.
  const actorId = readLinearHumanActor(event)?.id;
  if (botUserId && actorId && actorId === botUserId) return true;
  return false;
}

/**
 * Hidden marker stamped on EVERY outgoing agent comment (see the adapter's
 * delivery path) so Linear's echo of our own comment always carries it and the
 * loop guard drops it — a self-loop guard that works with NO bot-id config.
 */
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
