import { assertEquals } from "jsr:@std/assert";
import { _handleJoin } from "./channel.ts";
import { _handlePresence } from "./presence.ts";
import type { PhoenixMessage } from "./protocol.ts";

function fakeSocket(sub: string) {
  const sent: PhoenixMessage[] = [];
  return { sent, claims: { role: "authenticated", sub, exp: 9999999999 }, channels: new Map(), send: (m: PhoenixMessage) => sent.push(m) } as any;
}
async function join(sock: any, topic: string) {
  await _handleJoin(sock, { topic, event: "phx_join", ref: "1", join_ref: "1", payload: { config: { presence: { key: "" } } } });
}

Deno.test("joiner receives presence_state; track broadcasts presence_diff", async () => {
  const a = fakeSocket("alice"), b = fakeSocket("bob");
  await join(a, "realtime:pr1");
  assertEquals(a.sent.filter((m: any) => m.event === "presence_state").length, 1);
  await _handlePresence(a, { topic: "realtime:pr1", event: "presence", ref: "2",
    payload: { type: "presence", event: "track", payload: { status: "online" } } });
  await join(b, "realtime:pr1");
  const state = b.sent.find((m: any) => m.event === "presence_state");
  assertEquals(Object.keys(state!.payload), ["alice"]);
  assertEquals(state!.payload.alice.metas[0].status, "online");
  const diff = a.sent.find((m: any) => m.event === "presence_diff");
  assertEquals(Object.keys(diff!.payload.joins), ["alice"]);
});

Deno.test("teardown emits leave diff to remaining members", async () => {
  const a = fakeSocket("a2"), b = fakeSocket("b2");
  await join(a, "realtime:pr2"); await join(b, "realtime:pr2");
  await _handlePresence(a, { topic: "realtime:pr2", event: "presence", ref: "2",
    payload: { type: "presence", event: "track", payload: {} } });
  a.channels.get("realtime:pr2").teardown();
  const diff = b.sent.filter((m: any) => m.event === "presence_diff").at(-1);
  assertEquals(Object.keys(diff!.payload.leaves), ["a2"]);
});
