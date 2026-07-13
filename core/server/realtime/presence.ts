import { onJoinHooks, onLeaveHooks, type Channel } from "./channel.ts";
import { registerChannelEventHandler, type RealtimeSocket } from "./socket.ts";
import { broadcastToTopic } from "./broadcast.ts";
import { reply, type PhoenixMessage } from "./protocol.ts";

type Meta = Record<string, unknown> & { phx_ref: string };
// topic -> key -> metas
const presence = new Map<string, Map<string, Meta[]>>();
// channel -> its tracked key (so teardown knows what to remove)
const trackedKey = new WeakMap<Channel, string>();

function stateOf(topic: string): Record<string, { metas: Meta[] }> {
  const out: Record<string, { metas: Meta[] }> = {};
  for (const [key, metas] of presence.get(topic) ?? []) out[key] = { metas };
  return out;
}

onJoinHooks.push(async (ch) => {
  ch.send("presence_state", stateOf(ch.topic));
});

onLeaveHooks.push(async (ch) => {
  const key = trackedKey.get(ch);
  if (key === undefined) return;
  removeKey(ch, key);
});

function removeKey(ch: Channel, key: string): void {
  const topicMap = presence.get(ch.topic);
  const metas = topicMap?.get(key);
  if (!topicMap || !metas) return;
  topicMap.delete(key);
  if (topicMap.size === 0) presence.delete(ch.topic);
  trackedKey.delete(ch);
  broadcastToTopic(ch.topic, "presence_diff", { joins: {}, leaves: { [key]: { metas } } });
}

export async function _handlePresence(sock: RealtimeSocket, msg: PhoenixMessage): Promise<void> {
  const ch = sock.channels.get(msg.topic);
  if (!ch) return;
  const kind = msg.payload?.event;
  if (kind === "track") {
    const key = ch.presenceKey;
    const meta: Meta = { ...(msg.payload?.payload ?? {}), phx_ref: crypto.randomUUID().slice(0, 12) };
    let topicMap = presence.get(ch.topic);
    if (!topicMap) presence.set(ch.topic, topicMap = new Map());
    const prev = topicMap.get(key);
    topicMap.set(key, [meta]);
    trackedKey.set(ch, key);
    broadcastToTopic(ch.topic, "presence_diff", {
      joins: { [key]: { metas: [meta] } },
      leaves: prev ? { [key]: { metas: prev } } : {},
    });
  } else if (kind === "untrack") {
    const key = trackedKey.get(ch);
    if (key !== undefined) removeKey(ch, key);
  }
  sock.send(reply(msg, "ok", {}));
}

registerChannelEventHandler("presence", _handlePresence);
