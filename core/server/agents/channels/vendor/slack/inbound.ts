// Vendored from eve@0.19.0 dist/src/public/channels/slack/inbound.js (Apache-2.0).
// Modified: (1) eve's `slackMrkdwnToGfm` (from the sibling `mrkdwn.js`) is a
// wrapper over `#compiled/@chat-adapter/slack/format.js` runtime primitives that
// are NOT vendorable, so the `markdown` field passes the raw Slack `text`
// through unchanged (the trex factory prompts on `text` regardless); (2) the
// legacy `slackMessageFromWebhookPayload` (shaped against the chat-SDK webhook
// payload) is dropped — the trex factory parses raw Slack event envelopes with
// `parseAppMentionEvent` / `parseDirectMessageEvent`. Envelope-parsing logic
// otherwise unchanged. Types added from inbound.d.ts. See vendor/VENDOR.md.

/** Author metadata for an inbound Slack message. */
export interface SlackAuthor {
  readonly userId: string;
  readonly userName: string | undefined;
  readonly fullName: string | undefined;
  readonly isBot: boolean;
  readonly isMe: boolean;
}

/** Inbound Slack file attachment. */
export interface SlackAttachment {
  readonly id: string;
  readonly type: "image" | "file" | "video" | "audio";
  readonly url: string | undefined;
  readonly name: string | undefined;
  readonly mimeType: string | undefined;
  readonly size: number | undefined;
}

/** Channel-owned representation of one inbound Slack message. */
export interface SlackMessage {
  readonly text: string;
  /** {@link text} intended as GFM markdown for the agent. Passthrough of `text` in this vendor. */
  readonly markdown: string;
  readonly ts: string;
  /** Thread parent ts (root). Equals {@link ts} for non-thread events. */
  readonly threadTs: string;
  readonly channelId: string;
  readonly teamId: string | undefined;
  readonly author: SlackAuthor | undefined;
  readonly attachments: readonly SlackAttachment[];
  readonly raw: Record<string, unknown>;
}

/** Slack webhook envelope for an `event_callback`. */
export interface SlackEventCallback {
  readonly type: "event_callback";
  readonly team_id?: string;
  readonly event?: { readonly type?: string } & Record<string, unknown>;
  readonly event_id?: string;
  readonly event_time?: number;
  readonly [key: string]: unknown;
}

/**
 * Parses a Slack `app_mention` event into a {@link SlackMessage}. Returns `null`
 * when the envelope is not an `app_mention` event or required fields are missing.
 */
export function parseAppMentionEvent(envelope: SlackEventCallback): SlackMessage | null {
  if (envelope.type !== "event_callback") return null;
  const event = envelope.event;
  if (!event || event.type !== "app_mention") return null;
  return buildSlackMessage(event, envelope.team_id);
}

/**
 * Parses a Slack IM `message` event into a {@link SlackMessage}. Returns `null`
 * when the envelope is not an IM `message` event, required fields are missing,
 * the message carries a system `subtype` other than `file_share`, or the message
 * was posted by a bot (prevents the bot's own DM replies from re-triggering).
 */
/**
 * A human reply INSIDE an existing channel/group thread (message event with a
 * thread_ts different from its own ts). Used by the adapter's thread-following
 * mode; the adapter must gate dispatch on the session already existing, so
 * plain channel chatter never starts sessions.
 */
export function parseThreadMessageEvent(envelope: SlackEventCallback): SlackMessage | null {
  if (envelope.type !== "event_callback") return null;
  const event = envelope.event;
  if (!event || event.type !== "message") return null;
  const msg = event as Record<string, unknown>;
  const subtype = msg.subtype;
  const botId = msg.bot_id;
  const channelType = msg.channel_type;
  const threadTs = msg.thread_ts;
  if (
    (channelType !== "channel" && channelType !== "group") ||
    typeof threadTs !== "string" || threadTs.length === 0 || threadTs === msg.ts ||
    (typeof subtype === "string" && subtype.length > 0 && subtype !== "file_share") ||
    (typeof botId === "string" && botId.length > 0)
  ) {
    return null;
  }
  return buildSlackMessage(msg, envelope.team_id);
}

export function parseDirectMessageEvent(envelope: SlackEventCallback): SlackMessage | null {
  if (envelope.type !== "event_callback") return null;
  const event = envelope.event;
  if (!event || event.type !== "message") return null;
  const msg = event as Record<string, unknown>;
  const subtype = msg.subtype;
  const botId = msg.bot_id;
  if (
    msg.channel_type !== "im" ||
    (typeof subtype === "string" && subtype.length > 0 && subtype !== "file_share") ||
    (typeof botId === "string" && botId.length > 0)
  ) {
    return null;
  }
  return buildSlackMessage(msg, envelope.team_id);
}

function buildSlackMessage(event: Record<string, unknown>, teamId: unknown): SlackMessage | null {
  const channelId = typeof event.channel === "string" ? event.channel : "";
  const ts = typeof event.ts === "string" ? event.ts : "";
  if (!channelId || !ts) return null;
  const text = typeof event.text === "string" ? event.text : "";
  const threadTs = typeof event.thread_ts === "string" ? event.thread_ts : ts;
  return {
    text,
    markdown: text, // passthrough — see file header
    ts,
    threadTs,
    channelId,
    teamId: typeof teamId === "string" ? teamId : undefined,
    author: parseAuthor(event),
    attachments: parseAttachments(event.files),
    raw: event,
  };
}

function parseAuthor(event: Record<string, unknown>): SlackAuthor | undefined {
  const userId = typeof event.user === "string" ? event.user : "";
  if (!userId) return undefined;
  return {
    userId,
    userName: typeof event.username === "string" ? event.username : undefined,
    fullName: undefined,
    isBot: typeof event.bot_id === "string" && (event.bot_id as string).length > 0,
    isMe: false,
  };
}

function parseAttachments(files: unknown): SlackAttachment[] {
  return Array.isArray(files) ? files.map(toAttachment) : [];
}

function toAttachment(file: Record<string, unknown>): SlackAttachment {
  const mimeType = typeof file.mimetype === "string" ? file.mimetype : undefined;
  return {
    id: typeof file.id === "string" ? file.id : "",
    type: inferAttachmentType(mimeType),
    url: typeof file.url_private === "string" ? file.url_private : undefined,
    name: typeof file.name === "string" ? file.name : undefined,
    mimeType,
    size: typeof file.size === "number" ? file.size : undefined,
  };
}

function inferAttachmentType(mimeType: string | undefined): SlackAttachment["type"] {
  if (mimeType === undefined) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return "file";
}
