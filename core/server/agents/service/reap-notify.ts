// Tells the channel a reaped turn came from that it was reaped.
//
// Why this exists instead of the `publish(sessionId, {type: "turn.reaped"})`
// the sweep already does: publish() is stream.ts's in-memory fan-out, and the
// only subscriber that forwards to a platform is the TURN-SCOPED delivery
// channels/layer.ts registers while handling an inbound request
// (channels/delivery.ts). A reap happens in a background timer, or on the way
// in before any delivery is registered — in both cases there is no subscriber,
// so the event is published into nothing and the thread stays silent. That is
// precisely the case the notice matters in: nobody is watching, and without it
// the conversation just stops.
//
// So this path does not go through the stream at all. It reconstructs what the
// adapter needs from what is already persisted — the session's channel
// (agents.channel_sessions) and the reaped turn's own metadata, which is where
// channels/layer.ts recorded the delivery channel id when the turn started —
// and invokes the channel definition's own `turn.reaped` handler directly, so
// the adapter keeps owning the wording and the platform call.
import type { ChannelDef } from "../channels/types.ts";

export interface ReapedTurn {
  id: string;
  metadata: unknown;
}

export interface ReapNotifyDeps {
  channels: Record<string, ChannelDef>;
  channelForSession(sessionId: string): Promise<string | null>;
}

/** The delivery channel id channels/layer.ts stored on the turn's metadata. */
function deliveryChannelId(metadata: unknown): string | null {
  const id = (metadata as { channelId?: unknown } | null | undefined)?.channelId;
  return typeof id === "string" && id ? id : null;
}

/**
 * Best-effort notification that `reaped` turns on `sessionId` were abandoned.
 *
 * Never throws and never rejects: every caller is either a background timer or
 * the message-in path, and in both a delivery failure must not become the
 * caller's problem — the turns are already reaped either way.
 *
 * Returns true when a handler was actually invoked, which is what the tests
 * assert on (a "notified" that quietly did nothing is the bug this replaces).
 */
export async function notifyReaped(
  sessionId: string,
  reaped: ReapedTurn[],
  deps: ReapNotifyDeps,
): Promise<boolean> {
  if (reaped.length === 0) return false;
  try {
    const channelName = await deps.channelForSession(sessionId);
    if (!channelName) return false; // native session, no channel to notify
    const handler = deps.channels[channelName]?.events?.["turn.reaped"];
    if (!handler) return false;

    // Take the channel id from the most recent reaped turn that carries one.
    // Turns on one session can name different delivery channels over time (a
    // Discord thread is created per task), and the newest is the one the human
    // is actually looking at.
    const channelId = reaped.map((t) => deliveryChannelId(t.metadata)).filter(Boolean).at(-1);
    if (!channelId) return false;

    // The shape adapters read (discord.ts's stateOf: `channelCtx.state`). Built
    // here rather than via layer.ts's buildChannelCtx because that one is
    // request-scoped and there is no request.
    await handler({ count: reaped.length, reason: "stale" }, { state: { channelId } }, undefined);
    return true;
  } catch (e) {
    console.warn(`agents: reap notification failed for session ${sessionId} — swallowed:`, e);
    return false;
  }
}
