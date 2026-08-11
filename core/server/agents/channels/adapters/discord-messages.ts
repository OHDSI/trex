// MESSAGE_CREATE support for the Discord adapter (NOT vendored — trex code).
// Gateway-mode only: Discord never POSTs regular messages to a webhook, so
// this path is fed exclusively by the host gateway client's signed loopback.

import { isNonEmptyString, isObject } from "../vendor/discord/shared.ts";
import { callDiscordApi, type DiscordApiOptions } from "../vendor/discord/api.ts";

export interface DiscordMessageAttachment {
  name: string;
  url: string;
  contentType?: string;
  size?: number;
}

export interface DiscordMessageEvent {
  id: string;
  channelId: string;
  guildId?: string;
  author: { id: string; bot: boolean; username: string };
  content: string;
  mentionIds: readonly string[];
  // Role ids mentioned by the message (Discord's `mention_roles`). A user typing
  // "@trex" often hits the bot's auto-created managed role, not the bot user.
  mentionRoleIds: readonly string[];
  // Files attached to the message (screenshots etc.). CDN urls are signed and
  // expire, so consumers must download promptly, not store the url. Absent for
  // events built by test helpers / other callers.
  attachments?: readonly DiscordMessageAttachment[];
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
    mentionRoleIds: (Array.isArray(value.mention_roles) ? value.mention_roles : [])
      .filter((id): id is string => isNonEmptyString(id)),
    attachments: (Array.isArray(value.attachments) ? value.attachments : [])
      .filter((a): a is Record<string, unknown> => isObject(a))
      .filter((a) => isNonEmptyString(a.url) && isNonEmptyString(a.filename))
      .map((a) => ({
        name: a.filename as string,
        url: a.url as string,
        ...(isNonEmptyString(a.content_type) ? { contentType: a.content_type } : {}),
        ...(typeof a.size === "number" ? { size: a.size } : {}),
      })),
    ...(typeof value.type === "number" ? { type: value.type } : {}),
  };
}

/**
 * Renders message attachments as a structured block for the agent turn. The
 * block carries METADATA ONLY (name/url/type) — never file content — so the
 * orchestrator can relay the files (e.g. via askCodeAgent's `attachments`)
 * without describing or embedding them. Empty string when there are none.
 */
export function formatAttachmentsBlock(attachments: readonly DiscordMessageAttachment[] | undefined): string {
  if (!attachments || attachments.length === 0) return "";
  const entries = attachments.map((a) => ({
    name: a.name,
    url: a.url,
    ...(a.contentType ? { contentType: a.contentType } : {}),
  }));
  return `<attachments>\n${JSON.stringify(entries)}\n</attachments>`;
}

const mentionPattern = (applicationId: string) => new RegExp(`<@!?${applicationId}>`, "g");

export function mentionsBot(event: DiscordMessageEvent, applicationId: string, botRoleId?: string): boolean {
  return event.mentionIds.includes(applicationId) ||
    (botRoleId !== undefined && event.mentionRoleIds.includes(botRoleId)) ||
    mentionPattern(applicationId).test(event.content);
}

const roleMentionPattern = (roleId: string) => new RegExp(`<@&${roleId}>`, "g");

export function stripBotMention(content: string, applicationId: string, botRoleId?: string): string {
  let out = content.replace(mentionPattern(applicationId), " ");
  if (botRoleId !== undefined) out = out.replace(roleMentionPattern(botRoleId), " ");
  return out.replace(/\s+/g, " ").trim();
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
  /** The bot's managed integration role id, so "@trex" (the role) counts as a mention. */
  botRoleId?: string;
}): MessageTrigger {
  const { event, applicationId, channel, botRoleId } = input;
  if (event.author.bot) return { kind: "ignore" };
  // System/notice messages (pin-add, thread-created, …) and anything but a
  // plain message or a reply carry no user turn — never worth a model turn.
  if (event.type !== undefined && event.type !== 0 && event.type !== 19) return { kind: "ignore" };
  const isThread = channel.type !== undefined && THREAD_TYPES.has(channel.type);
  if (isThread) {
    if (channel.ownerId === applicationId) {
      // Embed-only posts arrive with empty content — nothing to prompt with.
      // But an attachment-only post (a screenshot dropped into the thread with
      // no caption) IS a turn: the <attachments> block carries the payload.
      if (event.content.trim() === "" && !(event.attachments && event.attachments.length > 0)) {
        return { kind: "ignore" };
      }
      return { kind: "thread-turn" };
    }
    if (mentionsBot(event, applicationId, botRoleId)) return { kind: "mention-in-thread" };
    return { kind: "ignore" };
  }
  if (mentionsBot(event, applicationId, botRoleId) && stripBotMention(event.content, applicationId, botRoleId) !== "") {
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

/**
 * Resolves the bot's own managed integration role (auto-created and named after
 * the bot when it joins a guild), or null if the guild has none. Cached per
 * guild — a managed role's id is stable for the bot's lifetime in the guild.
 * Lets a "@trex" role mention drive the bot the same as an @user mention.
 */
export async function resolveBotManagedRoleId(
  api: DiscordApiOptions,
  guildId: string,
  applicationId: string,
  cache?: Map<string, string | null>,
): Promise<string | null> {
  const hit = cache?.get(guildId);
  if (hit !== undefined) return hit;
  const result = await callDiscordApi({
    apiBaseUrl: api.apiBaseUrl,
    botToken: api.credentials?.botToken,
    fetch: api.fetch,
    method: "GET",
    path: `/guilds/${encodeURIComponent(guildId)}/roles`,
  });
  if (!result.ok) throw new Error(`Discord guild roles lookup failed with HTTP ${result.status}.`);
  const rows = Array.isArray(result.body) ? result.body : [];
  let roleId: string | null = null;
  for (const r of rows) {
    if (!isObject(r)) continue;
    const tags = isObject(r.tags) ? r.tags : {};
    if (r.managed === true && tags.bot_id === applicationId && isNonEmptyString(r.id)) {
      roleId = r.id;
      break;
    }
  }
  cache?.set(guildId, roleId);
  return roleId;
}

export interface HistoryMessage {
  author: string;
  bot: boolean;
  content: string;
  // Files attached to the historical message. Kept so a mention-triggered turn
  // can still relay a screenshot posted a few messages earlier — without this,
  // "please reattach the file" loops were the only recovery. CDN urls are
  // signed with ~24h validity, so recent-history relays still resolve.
  attachments?: readonly DiscordMessageAttachment[];
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
      const attachments = (Array.isArray(m.attachments) ? m.attachments : [])
        .filter((a): a is Record<string, unknown> => isObject(a))
        .filter((a) => isNonEmptyString(a.url) && isNonEmptyString(a.filename))
        .map((a) => ({
          name: a.filename as string,
          url: a.url as string,
          ...(isNonEmptyString(a.content_type) ? { contentType: a.content_type } : {}),
        }));
      return {
        author: isNonEmptyString(author.username) ? author.username : "unknown",
        bot: author.bot === true,
        content: typeof m.content === "string" ? m.content : "",
        ...(attachments.length > 0 ? { attachments } : {}),
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
    // Attachment metadata (name/url) after the text, NOT truncated with it —
    // the url must survive intact for the agent to relay it (askCodeAgent).
    const att = (m.attachments ?? [])
      .map((a) => ` [attachment: ${JSON.stringify({ name: a.name, url: a.url, ...(a.contentType ? { contentType: a.contentType } : {}) })}]`)
      .join("");
    return `${label} ${content.replace(/\n/g, " ")}${att}`;
  });
  return [`<${tag}>`, ...lines, `</${tag}>`].join("\n");
}

function isPipeRow(line: string | undefined): boolean {
  return typeof line === "string" && line.includes("|") && line.trim() !== "";
}

function splitTableCells(row: string): string[] {
  let s = row.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isSeparatorRow(line: string | undefined): boolean {
  if (!isPipeRow(line)) return false;
  const cells = splitTableCells(line as string);
  return cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c));
}

function renderMonospaceTable(rows: string[]): string {
  const header = splitTableCells(rows[0]);
  const data = rows.slice(2).map(splitTableCells); // rows[1] is the separator
  const cols = header.length;
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(header[c]?.length ?? 0, ...data.map((r) => r[c]?.length ?? 0)));
  const fmt = (r: string[]) => r.map((cell, c) => (cell ?? "").padEnd(widths[c])).join("  ").replace(/\s+$/, "");
  const sep = widths.map((w) => "-".repeat(Math.max(w, 3))).join("  ");
  return ["```", fmt(header), sep, ...data.map(fmt), "```"].join("\n");
}

/**
 * Discord renders no Markdown tables (pipes show as raw text), but text inside a
 * ``` code block is monospace, so a space-aligned table lines up. Rewrite each
 * GitHub-flavored Markdown table (header row + `---` separator + rows) as a
 * fenced, column-aligned plain-text table; leave everything else — including
 * tables already inside a code fence — untouched.
 */
export function markdownTablesToCodeBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    if (/^\s*```/.test(lines[i])) {
      inFence = !inFence;
      out.push(lines[i]);
      i++;
      continue;
    }
    if (!inFence && isPipeRow(lines[i]) && isSeparatorRow(lines[i + 1])) {
      const block: string[] = [];
      while (i < lines.length && isPipeRow(lines[i])) {
        block.push(lines[i]);
        i++;
      }
      out.push(renderMonospaceTable(block));
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
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
    `response_instructions: Reply for Discord in concise Markdown. Markdown tables are fine — they are auto-rendered as aligned monospace, so keep them to a few columns. Avoid mass mentions and messages that need more than a few short posts.`,
    `user_id: ${ctx.userId}`,
    ...(ctx.username ? [`username: ${ctx.username}`] : []),
    `channel_id: ${ctx.channelId}`,
    ...(ctx.guildId ? [`guild_id: ${ctx.guildId}`] : []),
    `message_id: ${ctx.messageId}`,
    `</discord_context>`,
  ].join("\n");
}
