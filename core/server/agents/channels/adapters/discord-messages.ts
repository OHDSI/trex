// MESSAGE_CREATE support for the Discord adapter (NOT vendored — trex code).
// Gateway-mode only: Discord never POSTs regular messages to a webhook, so
// this path is fed exclusively by the host gateway client's signed loopback.

import { isNonEmptyString, isObject } from "../vendor/discord/shared.ts";
import { callDiscordApi, type DiscordApiOptions } from "../vendor/discord/api.ts";

export interface DiscordMessageEvent {
  id: string;
  channelId: string;
  guildId?: string;
  author: { id: string; bot: boolean; username: string };
  content: string;
  mentionIds: readonly string[];
  // Discord message type (0 = DEFAULT, 19 = REPLY, 6 = pin-add notice, …).
  // Absent for events built by test helpers / other callers.
  type?: number;
}

/** Parses one gateway MESSAGE_CREATE `d` payload. Null on anything unusable. */
export function parseDiscordMessageEvent(value: unknown): DiscordMessageEvent | null {
  if (!isObject(value)) return null;
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.channel_id)) return null;
  const author = value.author;
  if (!isObject(author) || !isNonEmptyString(author.id) || !isNonEmptyString(author.username)) return null;
  const mentions = Array.isArray(value.mentions) ? value.mentions : [];
  return {
    id: value.id,
    channelId: value.channel_id,
    guildId: isNonEmptyString(value.guild_id) ? value.guild_id : undefined,
    author: { id: author.id, bot: author.bot === true, username: author.username },
    // Without the MESSAGE_CONTENT intent Discord sends content: "" — tolerate it.
    content: typeof value.content === "string" ? value.content : "",
    mentionIds: mentions
      .filter((m): m is Record<string, unknown> => isObject(m))
      .map((m) => m.id)
      .filter((id): id is string => isNonEmptyString(id)),
    ...(typeof value.type === "number" ? { type: value.type } : {}),
  };
}

const mentionPattern = (applicationId: string) => new RegExp(`<@!?${applicationId}>`, "g");

export function mentionsBot(event: DiscordMessageEvent, applicationId: string): boolean {
  return event.mentionIds.includes(applicationId) || mentionPattern(applicationId).test(event.content);
}

export function stripBotMention(content: string, applicationId: string): string {
  return content.replace(mentionPattern(applicationId), " ").replace(/\s+/g, " ").trim();
}

/** The slice of GET /channels/{id} the trigger decision needs. */
export interface DiscordChannelSnapshot {
  type?: number;
  parentId?: string;
  ownerId?: string;
}

// 10 = announcement thread, 11 = public thread, 12 = private thread.
const THREAD_TYPES: ReadonlySet<number> = new Set([10, 11, 12]);

export type MessageTrigger =
  | { kind: "thread-turn" }
  | { kind: "mention-in-thread" }
  | { kind: "mention-in-channel" }
  | { kind: "ignore" };

export function decideMessageTrigger(input: {
  event: DiscordMessageEvent;
  applicationId: string;
  channel: DiscordChannelSnapshot;
}): MessageTrigger {
  const { event, applicationId, channel } = input;
  if (event.author.bot) return { kind: "ignore" };
  // System/notice messages (pin-add, thread-created, …) and anything but a
  // plain message or a reply carry no user turn — never worth a model turn.
  if (event.type !== undefined && event.type !== 0 && event.type !== 19) return { kind: "ignore" };
  const isThread = channel.type !== undefined && THREAD_TYPES.has(channel.type);
  if (isThread) {
    if (channel.ownerId === applicationId) {
      // Image-only / embed-only posts arrive with empty content — nothing to prompt with.
      if (event.content.trim() === "") return { kind: "ignore" };
      return { kind: "thread-turn" };
    }
    if (mentionsBot(event, applicationId)) return { kind: "mention-in-thread" };
    return { kind: "ignore" };
  }
  if (mentionsBot(event, applicationId) && stripBotMention(event.content, applicationId) !== "") {
    return { kind: "mention-in-channel" };
  }
  return { kind: "ignore" };
}

/** Fetches the channel snapshot (thread kind / parent / owner) with a small cache. */
export async function getChannelSnapshot(
  api: DiscordApiOptions,
  channelId: string,
  cache?: Map<string, DiscordChannelSnapshot>,
): Promise<DiscordChannelSnapshot> {
  const hit = cache?.get(channelId);
  if (hit) return hit;
  const result = await callDiscordApi({
    apiBaseUrl: api.apiBaseUrl,
    botToken: api.credentials?.botToken,
    fetch: api.fetch,
    method: "GET",
    path: `/channels/${encodeURIComponent(channelId)}`,
  });
  if (!result.ok) throw new Error(`Discord channel lookup failed with HTTP ${result.status}.`);
  const body = result.body as { type?: unknown; parent_id?: unknown; owner_id?: unknown };
  const snapshot: DiscordChannelSnapshot = {
    ...(typeof body?.type === "number" ? { type: body.type } : {}),
    ...(isNonEmptyString(body?.parent_id) ? { parentId: body.parent_id } : {}),
    ...(isNonEmptyString(body?.owner_id) ? { ownerId: body.owner_id } : {}),
  };
  cache?.set(channelId, snapshot);
  return snapshot;
}

export interface HistoryMessage {
  author: string;
  bot: boolean;
  content: string;
}

/** Fetches up to `limit` messages (before `before` when given), returned OLDEST-first. */
export async function fetchMessagesBefore(
  api: DiscordApiOptions,
  channelId: string,
  opts: { before?: string; limit: number },
): Promise<HistoryMessage[]> {
  const beforeParam = opts.before !== undefined ? `&before=${encodeURIComponent(opts.before)}` : "";
  const result = await callDiscordApi({
    apiBaseUrl: api.apiBaseUrl,
    botToken: api.credentials?.botToken,
    fetch: api.fetch,
    method: "GET",
    path: `/channels/${encodeURIComponent(channelId)}/messages?limit=${opts.limit}${beforeParam}`,
  });
  if (!result.ok) throw new Error(`Discord message history fetch failed with HTTP ${result.status}.`);
  const rows = Array.isArray(result.body) ? result.body : [];
  // Discord returns newest-first; reverse for a chronological context block.
  return rows
    .filter((m): m is Record<string, unknown> => isObject(m))
    .map((m) => {
      const author = isObject(m.author) ? m.author : {};
      return {
        author: isNonEmptyString(author.username) ? author.username : "unknown",
        bot: author.bot === true,
        content: typeof m.content === "string" ? m.content : "",
      };
    })
    .reverse();
}

const HISTORY_CONTENT_MAX = 500;

/** Renders a history context block; empty input renders to "" (no block). */
export function formatMessagesBlock(
  tag: "thread_messages" | "channel_messages",
  messages: readonly HistoryMessage[],
): string {
  if (messages.length === 0) return "";
  const lines = messages.map((m) => {
    const label = m.bot ? `[bot:${m.author}]` : `[${m.author}]`;
    const content = m.content.length > HISTORY_CONTENT_MAX ? `${m.content.slice(0, HISTORY_CONTENT_MAX)}…` : m.content;
    return `${label} ${content.replace(/\n/g, " ")}`;
  });
  return [`<${tag}>`, ...lines, `</${tag}>`].join("\n");
}

/** Message-flavored <discord_context> (mirrors the interaction block, no interaction fields). */
export function formatDiscordMessageContextBlock(ctx: {
  userId: string;
  username?: string;
  channelId: string;
  guildId?: string;
  messageId: string;
}): string {
  return [
    `<discord_context>`,
    `response_medium: discord`,
    `response_instructions: Reply for Discord in concise Markdown. Avoid mass mentions, long tables, and messages that need more than a few short posts.`,
    `user_id: ${ctx.userId}`,
    ...(ctx.username ? [`username: ${ctx.username}`] : []),
    `channel_id: ${ctx.channelId}`,
    ...(ctx.guildId ? [`guild_id: ${ctx.guildId}`] : []),
    `message_id: ${ctx.messageId}`,
    `</discord_context>`,
  ].join("\n");
}
