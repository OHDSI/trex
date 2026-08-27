import { assertEquals } from "jsr:@std/assert";
import { notifyReaped } from "./reap-notify.ts";

type Call = { data: unknown; channelCtx: unknown };

function deps(opts: { channel?: string | null; handler?: (c: Call) => void } = {}) {
  const calls: Call[] = [];
  const events = opts.handler === undefined && opts.channel === undefined
    ? undefined
    : {
      "turn.reaped": (data: unknown, channelCtx: unknown) => {
        const call = { data, channelCtx };
        calls.push(call);
        opts.handler?.(call);
      },
    };
  return {
    calls,
    deps: {
      channels: { discord: { events } } as never,
      channelForSession: async () => (opts.channel === undefined ? "discord" : opts.channel),
    },
  };
}

Deno.test("notifyReaped: calls the channel's handler with the count and the turn's delivery channel", async () => {
  const { calls, deps: d } = deps({ handler: () => {} });
  const ok = await notifyReaped("s-1", [
    { id: "t-1", metadata: { channelId: "111" } },
    { id: "t-2", metadata: { channelId: "222" } },
  ], d);
  assertEquals(ok, true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].data, { count: 2, reason: "stale" });
  // The newest reaped turn's channel wins: a Discord thread is created per
  // task, and the newest is the one the human is actually looking at.
  // The shape is what adapters/discord.ts's stateOf() reads.
  assertEquals(calls[0].channelCtx, { state: { channelId: "222" } });
});

Deno.test("notifyReaped: nothing reaped means nothing sent", async () => {
  const { calls, deps: d } = deps({ handler: () => {} });
  assertEquals(await notifyReaped("s-1", [], d), false);
  assertEquals(calls.length, 0);
});

Deno.test("notifyReaped: a session with no channel is a native session — no notification, no throw", async () => {
  const { calls, deps: d } = deps({ channel: null, handler: () => {} });
  assertEquals(await notifyReaped("s-1", [{ id: "t-1", metadata: { channelId: "111" } }], d), false);
  assertEquals(calls.length, 0);
});

Deno.test("notifyReaped: turns with no delivery channel on their metadata are skipped, not guessed at", async () => {
  const { calls, deps: d } = deps({ handler: () => {} });
  assertEquals(await notifyReaped("s-1", [{ id: "t-1", metadata: null }], d), false);
  assertEquals(await notifyReaped("s-1", [{ id: "t-1", metadata: { channelId: 42 } }], d), false);
  assertEquals(calls.length, 0);
});

Deno.test("notifyReaped: falls back to an older turn's channel when the newest has none", async () => {
  const { calls, deps: d } = deps({ handler: () => {} });
  assertEquals(
    await notifyReaped("s-1", [
      { id: "t-1", metadata: { channelId: "111" } },
      { id: "t-2", metadata: null },
    ], d),
    true,
  );
  assertEquals(calls[0].channelCtx, { state: { channelId: "111" } });
});

Deno.test("notifyReaped: a channel with no turn.reaped handler is a no-op", async () => {
  const d = {
    channels: { discord: { events: { "turn.started": () => {} } } } as never,
    channelForSession: async () => "discord",
  };
  assertEquals(await notifyReaped("s-1", [{ id: "t-1", metadata: { channelId: "1" } }], d), false);
});

Deno.test("notifyReaped: a throwing handler is swallowed — the turns are already reaped either way", async () => {
  const d = {
    channels: { discord: { events: { "turn.reaped": () => { throw new Error("discord 500"); } } } } as never,
    channelForSession: async () => "discord",
  };
  assertEquals(await notifyReaped("s-1", [{ id: "t-1", metadata: { channelId: "1" } }], d), false);
});

Deno.test("notifyReaped: a failing channel lookup is swallowed", async () => {
  const d = {
    channels: {} as never,
    channelForSession: async () => { throw new Error("db down"); },
  };
  assertEquals(await notifyReaped("s-1", [{ id: "t-1", metadata: { channelId: "1" } }], d), false);
});
