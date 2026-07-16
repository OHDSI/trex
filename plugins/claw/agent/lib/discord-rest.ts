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

export interface AttachmentUpload { name: string; bytes: Uint8Array; contentType?: string }

// Post one channel message: plain text, rich embeds, file attachments, or any
// combination. With files it goes as multipart/form-data (payload_json naming
// each attachment by index + one files[i] part each — up to 10 files / 25 MB on
// a default guild); without files it's a plain JSON post.
export async function postChannelMessage(
  fetchFn: typeof fetch,
  opts: {
    botToken: string;
    channelId: string;
    content?: string;
    embeds?: unknown[];
    components?: unknown[];
    files?: AttachmentUpload[];
  },
): Promise<void> {
  const url = `https://discord.com/api/v10/channels/${opts.channelId}/messages`;
  const payload: Record<string, unknown> = { allowed_mentions: { parse: [] } };
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
}
