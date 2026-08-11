export interface FetchOpts { botToken: string; channelId: string; limit: number }

interface DiscordReaction { emoji?: { name?: string | null; id?: string | null }; count?: number; me?: boolean }
interface DiscordMessage { id?: string; author?: { username?: string }; content?: string; reactions?: DiscordReaction[] }

// Render an emoji for display AND for reaction-endpoint URLs: unicode emoji are
// the name itself; custom emoji are `name:id` (what Discord's reaction routes
// expect, sans the <:...> message-markup wrapper).
export function reactionEmojiKey(e: { name?: string | null; id?: string | null } | undefined): string {
  if (!e?.name) return "";
  return e.id ? `${e.name}:${e.id}` : e.name;
}

// Accept the forms a model plausibly passes — "👍", "name:id", "<:name:id>",
// "<a:name:id>" — and normalize to what the reaction endpoints want.
export function normalizeEmojiInput(emoji: string): string {
  const m = emoji.trim().match(/^<a?:([^:>]+):(\d+)>$/);
  return m ? `${m[1]}:${m[2]}` : emoji.trim();
}

export interface HistoryMessage {
  id: string;
  author: string;
  content: string;
  // Present only when someone reacted, e.g. [{ emoji: "👍", count: 2 }].
  reactions?: { emoji: string; count: number }[];
}

export async function fetchRecentMessages(
  fetchFn: typeof fetch,
  opts: FetchOpts,
): Promise<HistoryMessage[]> {
  const url = `https://discord.com/api/v10/channels/${opts.channelId}/messages?limit=${opts.limit}`;
  const res = await fetchFn(url, { headers: { Authorization: `Bot ${opts.botToken}` } });
  if (!res.ok) throw new Error(`discord history fetch failed: ${res.status}`);
  const raw = (await res.json()) as DiscordMessage[];
  return raw.map((m) => {
    const reactions = (m.reactions ?? [])
      .map((r) => ({ emoji: reactionEmojiKey(r.emoji), count: r.count ?? 0 }))
      .filter((r) => r.emoji);
    return {
      id: m.id ?? "",
      author: m.author?.username ?? "unknown",
      content: m.content ?? "",
      ...(reactions.length ? { reactions } : {}),
    };
  });
}

// Add the bot's reaction to a message (PUT .../reactions/{emoji}/@me → 204).
export async function addMessageReaction(
  fetchFn: typeof fetch,
  opts: { botToken: string; channelId: string; messageId: string; emoji: string },
): Promise<void> {
  const emoji = encodeURIComponent(normalizeEmojiInput(opts.emoji));
  const url =
    `https://discord.com/api/v10/channels/${opts.channelId}/messages/${opts.messageId}/reactions/${emoji}/@me`;
  const res = await fetchFn(url, { method: "PUT", headers: { Authorization: `Bot ${opts.botToken}` } });
  if (!res.ok) throw new Error(`discord reaction add failed: ${res.status} ${await res.text()}`);
}

// Read a message's reactions, with the users behind each emoji (capped).
export async function fetchMessageReactions(
  fetchFn: typeof fetch,
  opts: { botToken: string; channelId: string; messageId: string },
): Promise<{ emoji: string; count: number; users: string[] }[]> {
  const base = `https://discord.com/api/v10/channels/${opts.channelId}/messages/${opts.messageId}`;
  const headers = { Authorization: `Bot ${opts.botToken}` };
  const msgRes = await fetchFn(base, { headers });
  if (!msgRes.ok) throw new Error(`discord message fetch failed: ${msgRes.status}`);
  const msg = (await msgRes.json()) as DiscordMessage;
  const out: { emoji: string; count: number; users: string[] }[] = [];
  for (const r of (msg.reactions ?? []).slice(0, 10)) {
    const key = reactionEmojiKey(r.emoji);
    if (!key) continue;
    let users: string[] = [];
    try {
      const uRes = await fetchFn(`${base}/reactions/${encodeURIComponent(key)}?limit=25`, { headers });
      if (uRes.ok) {
        users = ((await uRes.json()) as { username?: string }[]).map((u) => u.username ?? "unknown");
      }
    } catch { /* per-emoji user list is best-effort; the count still reports */ }
    out.push({ emoji: key, count: r.count ?? 0, users });
  }
  return out;
}

export interface AttachmentUpload { name: string; bytes: Uint8Array; contentType?: string }

// Post one channel message: plain text, rich embeds, file attachments, or any
// combination. With files it goes as multipart/form-data (payload_json naming
// each attachment by index + one files[i] part each — up to 10 files / 25 MB on
// a default guild); without files it's a plain JSON post.
// Explicit <@id> user mentions in content must actually PING. The default
// allowed_mentions {parse: []} suppresses everything, so a correctly-written
// <@123> rendered as a mention but notified nobody. Allow exactly the users
// literally mentioned — parse stays [], keeping @everyone/@here/roles
// suppressed. An explicit allowedMentions option wins.
export function mentionedUserIds(content: string | undefined): string[] {
  if (!content) return [];
  return [...new Set([...content.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]))].slice(0, 25);
}

export async function postChannelMessage(
  fetchFn: typeof fetch,
  opts: {
    botToken: string;
    channelId: string;
    content?: string;
    embeds?: unknown[];
    components?: unknown[];
    files?: AttachmentUpload[];
    allowedMentions?: { users?: string[] };
  },
): Promise<{ id: string }> {
  const url = `https://discord.com/api/v10/channels/${opts.channelId}/messages`;
  const contentUsers = mentionedUserIds(opts.content);
  const payload: Record<string, unknown> = {
    allowed_mentions: opts.allowedMentions ??
      (contentUsers.length ? { parse: [], users: contentUsers } : { parse: [] }),
  };
  if (opts.content) payload.content = opts.content;
  if (opts.embeds?.length) payload.embeds = opts.embeds;
  if (opts.components?.length) payload.components = opts.components;

  let res: Response;
  if (opts.files?.length) {
    payload.attachments = opts.files.map((f, i) => ({ id: i, filename: f.name }));
    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    opts.files.forEach((f, i) => {
      form.append(`files[${i}]`, new Blob([f.bytes], { type: f.contentType ?? "application/octet-stream" }), f.name);
    });
    res = await fetchFn(url, { method: "POST", headers: { Authorization: `Bot ${opts.botToken}` }, body: form });
  } else {
    res = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bot ${opts.botToken}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  if (!res.ok) throw new Error(`discord message post failed: ${res.status} ${await res.text()}`);
  const json = await res.json().catch(() => ({}));
  return { id: String((json as { id?: string }).id ?? "") };
}

// Start a public thread from an existing message (POST /channels/:id/messages/:mid/threads).
export async function startThreadFromMessage(
  fetchFn: typeof fetch,
  opts: { botToken: string; channelId: string; messageId: string; name: string },
): Promise<{ threadId: string }> {
  const url = `https://discord.com/api/v10/channels/${opts.channelId}/messages/${opts.messageId}/threads`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: { Authorization: `Bot ${opts.botToken}`, "content-type": "application/json" },
    body: JSON.stringify({ name: opts.name.slice(0, 100) }),
  });
  if (!res.ok) throw new Error(`discord thread create failed: ${res.status} ${await res.text()}`);
  const json = await res.json() as { id?: string };
  return { threadId: String(json.id ?? "") };
}
