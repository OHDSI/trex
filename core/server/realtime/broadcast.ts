import { channelsByTopic, type Channel } from "./channel.ts";
import { registerChannelEventHandler } from "./socket.ts";
import { reply, type PhoenixMessage } from "./protocol.ts";
import type { RealtimeSocket } from "./socket.ts";

/**
 * Relay `event`/`payload` to every channel subscribed to `topic` (full
 * "realtime:..." topic), optionally excluding one channel (the sender).
 * Returns the number of channels the message was delivered to. Reused by
 * broadcast-from-DB (Task 10).
 */
export function broadcastToTopic(topic: string, event: string, payload: any, opts: { except?: Channel } = {}): number {
  let n = 0;
  for (const ch of channelsByTopic.get(topic) ?? []) {
    if (ch === opts.except) continue;
    ch.send(event, payload);
    n++;
  }
  return n;
}

export async function _handleBroadcast(sock: RealtimeSocket, msg: PhoenixMessage): Promise<void> {
  const ch = sock.channels.get(msg.topic);
  if (!ch) return;
  // Private channels require WRITE authorization to broadcast. The authz join hook
  // stashes ch.canWrite; a READ-only member could otherwise join and fan a frame out
  // to everyone. Drop silently to match the HTTP POST /api/broadcast path (which also
  // silently drops unauthorized private messages) — don't error the socket.
  if (ch.isPrivate && !ch.canWrite) return;
  broadcastToTopic(msg.topic, "broadcast", msg.payload, ch.broadcastCfg.self ? {} : { except: ch });
  if (ch.broadcastCfg.ack) sock.send(reply(msg, "ok", {}));
}

registerChannelEventHandler("broadcast", _handleBroadcast);
