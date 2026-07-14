export interface FetchOpts { botToken: string; channelId: string; limit: number }

interface DiscordMessage { author?: { username?: string }; content?: string }

export async function fetchRecentMessages(
  fetchFn: typeof fetch,
  opts: FetchOpts,
): Promise<{ author: string; content: string }[]> {
  const url = `https://discord.com/api/v10/channels/${opts.channelId}/messages?limit=${opts.limit}`;
  const res = await fetchFn(url, { headers: { Authorization: `Bot ${opts.botToken}` } });
  if (!res.ok) throw new Error(`discord history fetch failed: ${res.status}`);
  const raw = (await res.json()) as DiscordMessage[];
  return raw.map((m) => ({ author: m.author?.username ?? "unknown", content: m.content ?? "" }));
}
