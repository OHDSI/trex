// Thread-per-task support for the Discord adapter (NOT vendored — trex code).
// A Discord thread IS a channel with its own id, so the channels layer needs
// nothing new: keying the continuation token to a freshly created thread id
// gives every task its own session, and parallel threads are parallel
// sessions. These helpers cover the two Discord-specific bits: reading the
// interaction's channel kind (threads must not spawn threads) and creating
// the task thread via REST.

import { callDiscordApi, type DiscordApiOptions } from "../vendor/discord/api.ts";

// Discord channel types that are threads: 10 = announcement thread,
// 11 = public thread, 12 = private thread.
const THREAD_CHANNEL_TYPES: ReadonlySet<number> = new Set([10, 11, 12]);

export interface InteractionChannelInfo {
  type?: number;
  parentId?: string;
}

/** Reads the (partial) channel object Discord attaches to every interaction. */
export function interactionChannelInfo(raw: Record<string, unknown>): InteractionChannelInfo {
  const ch = raw.channel as { type?: unknown; parent_id?: unknown } | undefined;
  return {
    ...(typeof ch?.type === "number" ? { type: ch.type } : {}),
    ...(typeof ch?.parent_id === "string" ? { parentId: ch.parent_id } : {}),
  };
}

export function isThreadChannel(info: InteractionChannelInfo): boolean {
  return info.type !== undefined && THREAD_CHANNEL_TYPES.has(info.type);
}

// Discord caps thread names at 100 chars; keep headroom for the ellipsis.
const THREAD_NAME_MAX = 90;

/** Derives a thread name from the task ask (single line, length-capped). */
export function threadNameForTask(message: string): string {
  const line = message.replace(/\s+/g, " ").trim();
  if (!line) return "task";
  return line.length > THREAD_NAME_MAX ? `${line.slice(0, THREAD_NAME_MAX - 1)}…` : line;
}

/**
 * Creates a public thread (type 11) in a channel, standalone (not anchored to
 * a message — an anchor would need the deferred response to already exist,
 * which is only true in gateway mode). Requires the bot permissions
 * "Create Public Threads" + "Send Messages in Threads".
 */
export async function createDiscordThread(
  input: DiscordApiOptions & { readonly channelId: string; readonly name: string },
): Promise<{ id: string }> {
  const result = await callDiscordApi({
    apiBaseUrl: input.apiBaseUrl,
    body: { auto_archive_duration: 1440, name: input.name, type: 11 },
    botToken: input.credentials?.botToken,
    fetch: input.fetch,
    path: `/channels/${encodeURIComponent(input.channelId)}/threads`,
  });
  if (!result.ok) throw new Error(`Discord thread create failed with HTTP ${result.status}.`);
  const id = (result.body as { id?: unknown })?.id;
  if (typeof id !== "string" || !id) throw new Error("Discord thread create returned no id.");
  return { id };
}
