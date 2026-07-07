// Task 5: server-initiated outbound delivery. A channel turn is started by
// send() and the HTTP response returns immediately, but the agent keeps
// emitting events afterwards (message.completed, turn.completed, …). To post the
// reply BACK to the platform (Discord/Slack/…) the adapter's `events` handlers
// have to run AFTER the response — as a background subscriber on the session's
// live event stream.
//
// registerDelivery subscribes those handlers to stream.ts's per-session fan-out
// (the same `subscribe` the live-tail /stream route uses) and wraps the whole
// subscription in a single waitUntil(lifetime) call. The Task-0 spike
// (specs/008-agents-channels/spike-channels.md) verified EdgeRuntime.waitUntil
// keeps a background fetch alive past the response; that is the default executor
// wired at the call site (layer.ts). registerDelivery itself is agnostic —
// waitUntil is injected, so a test can pass a fake and drive delivery
// synchronously — which is why this file never touches EdgeRuntime directly.
//
// Durability: waitUntil keeps the *isolate* alive, not delivery across a
// crash/redeploy. The spec's optional `delivery_pending` net (write-before /
// clear-on-success) can layer on top of this without changing the interface.

import type { ChannelDef } from "./types.ts";
import type { AgentEvent } from "../service/events.ts";

export interface RegisterDeliveryOpts {
  channel: ChannelDef;
  sessionId: string;
  // The turn THIS delivery belongs to. A session can run two turns at once (two
  // rapid messages on one continuation token), and every turn-scoped event on
  // the shared session stream carries its own `data.turnId`. Scoping to turnId
  // is what stops a sibling turn's terminal event from tearing this delivery
  // down (and stops us from re-delivering the sibling's replies).
  turnId: string;
  // stream.ts's live fan-out: (sessionId, fn) -> unsubscribe. Mirrors how
  // handler.ts's /stream route subscribes for the live tail.
  subscribe: (sessionId: string, fn: (e: AgentEvent) => void) => () => void;
  // Keeps the background subscription alive past the HTTP response. Injected so
  // tests substitute a fake; defaults to EdgeRuntime.waitUntil (see layer.ts).
  waitUntil: (p: Promise<unknown>) => void;
  // Builds the (channelCtx, ctx) an events handler receives as its 2nd/3rd
  // args. Called once per registration; the adapter owns what these carry.
  buildChannelCtx: () => { channelCtx: unknown; ctx?: unknown };
}

function isThenable(v: unknown): v is Promise<unknown> {
  return !!v && typeof (v as { then?: unknown }).then === "function";
}

export function registerDelivery(opts: RegisterDeliveryOpts): void {
  const { channel, sessionId, turnId, subscribe, waitUntil, buildChannelCtx } = opts;
  const events = channel.events;
  // No events handlers → nothing to deliver; don't subscribe or hold the
  // isolate open with a waitUntil that would never resolve.
  if (!events || Object.keys(events).length === 0) return;

  const { channelCtx, ctx } = buildChannelCtx();

  // In-flight handler promises. A handler's platform fetch can still be running
  // when the turn ends, so the lifetime promise (which is what keeps the
  // isolate alive) only resolves once the subscription is closed AND every
  // handler settled — otherwise waitUntil could let the isolate be reclaimed
  // mid-delivery.
  const pending = new Set<Promise<unknown>>();
  let done = false;
  let resolveLifetime!: () => void;
  const lifetime = new Promise<void>((resolve) => { resolveLifetime = resolve; });
  // Exactly one waitUntil for the entire subscription — survives past the
  // response, resolves when the turn's delivery is fully drained.
  waitUntil(lifetime);

  const track = (p: Promise<unknown>) => {
    pending.add(p);
    void p.finally(() => pending.delete(p));
  };

  const unsub = subscribe(sessionId, (event) => {
    // Sibling-turn isolation: turn-scoped events carry `data.turnId`. An event
    // for a DIFFERENT turn belongs to that turn's own delivery — ignore it
    // entirely (don't invoke handlers, don't tear down). Turn-agnostic events
    // (tool.event, session.waiting, session.failed) carry no turnId and fall
    // through so their handlers still run and session.failed can tear down.
    const evTurnId = (event.data as { turnId?: string } | undefined)?.turnId;
    if (evTurnId !== undefined && evTurnId !== turnId) return;

    const handler = events[event.type];
    if (handler) {
      // Per-event isolation: a handler that throws synchronously OR rejects
      // asynchronously is logged and MUST NOT stop delivery of later events in
      // the same turn.
      try {
        const r = handler(event.data, channelCtx, ctx);
        if (isThenable(r)) {
          track(r.catch((e) =>
            console.error(`agents: channel delivery handler '${event.type}' failed:`, e)
          ));
        }
      } catch (e) {
        console.error(`agents: channel delivery handler '${event.type}' failed:`, e);
      }
    }
    // Close the delivery window on MY turn's terminal event, or on any
    // session-level failure (session.failed has no turnId → tears down every
    // delivery on the session). A sibling turn's terminal event was already
    // filtered out above, so it can never cross-cancel this delivery.
    if (
      ((event.type === "turn.completed" || event.type === "turn.failed") && evTurnId === turnId) ||
      event.type === "session.failed"
    ) {
      finish();
    }
  });

  function finish() {
    if (done) return;
    done = true;
    unsub();
    // Resolve the lifetime only after in-flight handler deliveries settle, so
    // waitUntil holds the isolate until the last reply has reached the platform.
    void Promise.allSettled([...pending]).then(() => resolveLifetime());
  }
}
