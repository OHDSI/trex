// Task 5: server-initiated outbound delivery. registerDelivery subscribes a
// channel's `events` handlers to a session's live event stream and runs the
// whole subscription under an injected waitUntil so replies reach the platform
// after the HTTP response returns.
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert";
import { registerDelivery } from "./delivery.ts";
import type { ChannelDef } from "./types.ts";
import type { AgentEvent } from "../service/events.ts";

// A fake live stream: registerDelivery subscribes, and the test drives events
// through emit(). Records whether the subscription was released.
function fakeStream() {
  let listener: ((e: AgentEvent) => void) | null = null;
  let unsubscribed = false;
  const subscribe = (_sid: string, fn: (e: AgentEvent) => void) => {
    listener = fn;
    return () => { unsubscribed = true; listener = null; };
  };
  return {
    subscribe,
    emit(e: AgentEvent) { listener?.(e); },
    get unsubscribed() { return unsubscribed; },
    get active() { return listener !== null; },
  };
}

// A fan-out stream: many deliveries subscribe to the SAME session and every
// emit reaches all of them (mirrors stream.ts's per-session fan-out). Needed to
// exercise two concurrent turns on one session.
function fakeMultiStream() {
  const listeners = new Set<(e: AgentEvent) => void>();
  const subscribe = (_sid: string, fn: (e: AgentEvent) => void) => {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  };
  return {
    subscribe,
    emit(e: AgentEvent) { for (const l of [...listeners]) l(e); },
    get active() { return listeners.size; },
  };
}

const CHANNEL_CTX = { kind: "channel-ctx" };
const CTX = { kind: "runtime-ctx" };

Deno.test("registerDelivery: runs the matching events handler with (eventData, channelCtx, ctx), under the injected waitUntil, and unsubscribes on turn.completed", async () => {
  const stream = fakeStream();
  const waited: Promise<unknown>[] = [];

  const calls: Array<{ data: unknown; cctx: unknown; ctx: unknown }> = [];
  const channel: ChannelDef = {
    __trexChannel: true,
    routes: [],
    events: {
      "message.completed": (data: any, cctx: any, ctx: any) => { calls.push({ data, cctx, ctx }); },
    },
  };

  registerDelivery({
    channel,
    sessionId: "sess-1",
    turnId: "t1",
    subscribe: stream.subscribe,
    waitUntil: (p) => waited.push(p),
    buildChannelCtx: () => ({ channelCtx: CHANNEL_CTX, ctx: CTX }),
  });

  // The whole subscription runs under exactly one waitUntil.
  assertEquals(waited.length, 1);
  assert(stream.active, "should have subscribed to the live stream");

  // An event with no handler is ignored.
  stream.emit({ type: "turn.started", data: { turnId: "t1", sequence: 0 } });
  assertEquals(calls.length, 0);

  // The matching handler fires with the event's DATA payload + both ctx args.
  stream.emit({ type: "message.completed", data: { turnId: "t1", message: "hello back", finishReason: "stop" } });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].data, { turnId: "t1", message: "hello back", finishReason: "stop" });
  assertStrictEquals(calls[0].cctx, CHANNEL_CTX);
  assertStrictEquals(calls[0].ctx, CTX);

  // turn.completed releases the subscription.
  assert(!stream.unsubscribed);
  stream.emit({ type: "turn.completed", data: { turnId: "t1" } });
  assert(stream.unsubscribed, "should unsubscribe on turn.completed");

  // The lifetime promise handed to waitUntil resolves once the turn ends.
  await waited[0];
});

Deno.test("registerDelivery: a throwing handler is caught per-event and does not stop later events", async () => {
  const stream = fakeStream();
  const waited: Promise<unknown>[] = [];
  const delivered: string[] = [];

  const channel: ChannelDef = {
    __trexChannel: true,
    routes: [],
    events: {
      "message.appended": () => { throw new Error("boom in appended"); },
      "message.completed": (data: any) => { delivered.push(data.message); },
    },
  };

  registerDelivery({
    channel,
    sessionId: "sess-2",
    turnId: "t1",
    subscribe: stream.subscribe,
    waitUntil: (p) => waited.push(p),
    buildChannelCtx: () => ({ channelCtx: null }),
  });

  stream.emit({ type: "message.appended", data: { turnId: "t1", messageDelta: "he", messageSoFar: "he" } });
  // The throw above must not prevent the next handler from running.
  stream.emit({ type: "message.completed", data: { turnId: "t1", message: "survived", finishReason: "stop" } });
  assertEquals(delivered, ["survived"]);

  stream.emit({ type: "turn.completed", data: { turnId: "t1" } });
  await waited[0];
});

Deno.test("registerDelivery: async handler rejection is isolated and the lifetime waits for in-flight deliveries", async () => {
  const stream = fakeStream();
  const waited: Promise<unknown>[] = [];
  const order: string[] = [];
  let resolveSlow!: () => void;
  const slow = new Promise<void>((r) => { resolveSlow = r; });

  const channel: ChannelDef = {
    __trexChannel: true,
    routes: [],
    events: {
      // rejects — must not break the subscription
      "message.appended": () => Promise.reject(new Error("async boom")),
      // still in-flight when the turn ends — lifetime must await it
      "message.completed": async () => { await slow; order.push("delivered"); },
    },
  };

  registerDelivery({
    channel,
    sessionId: "sess-3",
    turnId: "t1",
    subscribe: stream.subscribe,
    waitUntil: (p) => waited.push(p),
    buildChannelCtx: () => ({ channelCtx: null }),
  });

  stream.emit({ type: "message.appended", data: { turnId: "t1", messageDelta: "x", messageSoFar: "x" } });
  stream.emit({ type: "message.completed", data: { turnId: "t1", message: "y", finishReason: "stop" } });
  stream.emit({ type: "turn.completed", data: { turnId: "t1" } });
  assert(stream.unsubscribed, "unsubscribes immediately on terminal event");

  // The lifetime promise is still pending because message.completed hasn't finished.
  let settled = false;
  waited[0].then(() => { settled = true; });
  await Promise.resolve();
  assertEquals(settled, false);

  resolveSlow();
  await waited[0];
  assertEquals(order, ["delivered"]);
});

Deno.test("registerDelivery: concurrent turns on one session are turn-scoped — a sibling turn's terminal does NOT tear this delivery down (Task 19)", async () => {
  const stream = fakeMultiStream();
  const waitedA: Promise<unknown>[] = [];
  const waitedB: Promise<unknown>[] = [];
  const deliveredA: string[] = [];
  const deliveredB: string[] = [];

  const channelA: ChannelDef = {
    __trexChannel: true,
    routes: [],
    events: { "message.completed": (d: any) => { deliveredA.push(d.message); } },
  };
  const channelB: ChannelDef = {
    __trexChannel: true,
    routes: [],
    events: { "message.completed": (d: any) => { deliveredB.push(d.message); } },
  };

  // Two overlapping turns (A, B) on ONE session, each its own delivery.
  registerDelivery({
    channel: channelA, sessionId: "sess", turnId: "A",
    subscribe: stream.subscribe, waitUntil: (p) => waitedA.push(p),
    buildChannelCtx: () => ({ channelCtx: null }),
  });
  registerDelivery({
    channel: channelB, sessionId: "sess", turnId: "B",
    subscribe: stream.subscribe, waitUntil: (p) => waitedB.push(p),
    buildChannelCtx: () => ({ channelCtx: null }),
  });
  assertEquals(stream.active, 2, "both deliveries subscribed to the shared session stream");

  // Interleaved events for both turns on the shared stream.
  stream.emit({ type: "message.completed", data: { turnId: "A", message: "a1", finishReason: "stop" } });
  stream.emit({ type: "message.completed", data: { turnId: "B", message: "b1", finishReason: "stop" } });

  // Turn A completes. THE regression: this must tear down ONLY A, not B.
  stream.emit({ type: "turn.completed", data: { turnId: "A" } });
  assertEquals(stream.active, 1, "A's terminal tore down A only — B is still subscribed");
  await waitedA[0]; // A's lifetime resolves once A is drained.

  // B still delivers AFTER A completed (would have been dropped by the bug).
  stream.emit({ type: "message.completed", data: { turnId: "B", message: "b2", finishReason: "stop" } });
  stream.emit({ type: "turn.completed", data: { turnId: "B" } });
  assertEquals(stream.active, 0, "B tore down on its OWN terminal event");
  await waitedB[0];

  assertEquals(deliveredA, ["a1"], "A handled only turnA events");
  assertEquals(deliveredB, ["b1", "b2"], "B handled its own events, including the one after A completed");
});

Deno.test("registerDelivery: session.failed (session-level, no turnId) tears the delivery down (Task 19)", async () => {
  const stream = fakeStream();
  const waited: Promise<unknown>[] = [];

  const channel: ChannelDef = {
    __trexChannel: true,
    routes: [],
    events: { "message.completed": () => {} },
  };

  registerDelivery({
    channel, sessionId: "sess-f", turnId: "t1",
    subscribe: stream.subscribe, waitUntil: (p) => waited.push(p),
    buildChannelCtx: () => ({ channelCtx: null }),
  });
  assert(stream.active, "subscribed");

  // session.failed carries a sessionId, not a turnId — it must still tear down.
  stream.emit({ type: "session.failed", data: { sessionId: "sess-f", message: "kaboom" } });
  assert(stream.unsubscribed, "session.failed tears down the delivery even without a turnId");
  await waited[0];
});

Deno.test("registerDelivery: no events handlers -> no subscription, no waitUntil (does not hold the isolate open)", () => {
  const stream = fakeStream();
  const waited: Promise<unknown>[] = [];

  registerDelivery({
    channel: { __trexChannel: true, routes: [] },
    sessionId: "sess-4",
    turnId: "t1",
    subscribe: stream.subscribe,
    waitUntil: (p) => waited.push(p),
    buildChannelCtx: () => ({ channelCtx: null }),
  });

  assertEquals(waited.length, 0);
  assert(!stream.active, "must not subscribe when the channel has no events");
});
