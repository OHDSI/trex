import type { RealtimeSocket } from "./socket.ts";
import { registerChannelEventHandler } from "./socket.ts";
import { reply, type PhoenixMessage } from "./protocol.ts";

export interface PgChangesBinding {
  id: number;
  event: string;   // INSERT | UPDATE | DELETE | *
  schema: string;
  table: string;
  filter?: string; // e.g. "id=eq.1"
}

let nextBindingId = 1;
// Schemas we've already warned about for rejected wildcard bindings (one warn each).
const warnedWildcardSchemas = new Set<string>();

export const channelsByTopic = new Map<string, Set<Channel>>();
export const onJoinHooks: Array<(ch: Channel) => Promise<void>> = [];
export const onLeaveHooks: Array<(ch: Channel) => Promise<void>> = [];

export class Channel {
  topic: string;
  subTopic: string; // topic without the "realtime:" prefix — used by broadcast-from-DB and realtime.topic()
  joinRef: string | null;
  isPrivate: boolean;
  // Write permission for a private channel, resolved by the authz join hook and
  // read by the WS broadcast handler to gate fan-out. Undefined for public channels.
  canWrite?: boolean;
  broadcastCfg: { self: boolean; ack: boolean };
  presenceKey: string;
  bindings: PgChangesBinding[] = [];
  subscriptionIds: string[] = []; // uuids of realtime.subscription rows (Task 7)

  constructor(public socket: RealtimeSocket, msg: PhoenixMessage) {
    this.topic = msg.topic;
    this.subTopic = msg.topic.replace(/^realtime:/, "");
    this.joinRef = msg.join_ref ?? msg.ref;
    const cfg = msg.payload?.config ?? {};
    this.isPrivate = cfg.private === true;
    this.broadcastCfg = { self: cfg.broadcast?.self === true, ack: cfg.broadcast?.ack === true };
    this.presenceKey = typeof cfg.presence?.key === "string" && cfg.presence.key !== ""
      ? cfg.presence.key
      : (("sub" in socket.claims ? socket.claims.sub : undefined) ?? crypto.randomUUID());
    for (const pc of cfg.postgres_changes ?? []) {
      const schema = pc.schema ?? "public";
      const table = pc.table ?? "*";
      // Schema-wide subscriptions (table omitted → "*") are intentionally NOT
      // supported (realtime.subscription.entity is a concrete regclass). Reject
      // the binding VISIBLY: it gets no id and is excluded from the phx_join reply's
      // postgres_changes, so a realtime-js client sees it was not accepted rather
      // than believing it subscribed and silently receiving no events. One warn per
      // schema keeps the log from flooding on repeated joins.
      if (table === "*") {
        if (!warnedWildcardSchemas.has(schema)) {
          warnedWildcardSchemas.add(schema);
          console.warn(
            `[realtime] schema-wide postgres_changes subscriptions are not supported; rejecting binding for "${schema}".* (omit no table)`,
          );
        }
        continue;
      }
      this.bindings.push({
        id: nextBindingId++,
        event: pc.event ?? "*",
        schema,
        table,
        filter: pc.filter,
      });
    }
  }

  send(event: string, payload: any): void {
    this.socket.send({ topic: this.topic, event, payload, ref: null, join_ref: this.joinRef });
  }

  teardown(): void {
    channelsByTopic.get(this.topic)?.delete(this);
    this.socket.channels.delete(this.topic);
    for (const hook of onLeaveHooks) void hook(this).catch((e) => console.error("[realtime] leave hook:", e));
  }
}

export async function _handleJoin(sock: RealtimeSocket, msg: PhoenixMessage): Promise<void> {
  sock.channels.get(msg.topic)?.teardown(); // rejoin replaces
  const ch = new Channel(sock, msg);
  try {
    for (const hook of onJoinHooks) await hook(ch);
  } catch (e) {
    sock.send(reply(msg, "error", { reason: e instanceof Error ? e.message : String(e) }));
    return;
  }
  let set = channelsByTopic.get(ch.topic);
  if (!set) channelsByTopic.set(ch.topic, set = new Set());
  set.add(ch);
  sock.channels.set(ch.topic, ch);
  sock.send(reply(msg, "ok", { postgres_changes: ch.bindings }));
}

export async function _handleLeave(sock: RealtimeSocket, msg: PhoenixMessage): Promise<void> {
  sock.channels.get(msg.topic)?.teardown();
  sock.send(reply(msg, "ok", {}));
}

registerChannelEventHandler("phx_join", _handleJoin);
registerChannelEventHandler("phx_leave", _handleLeave);
