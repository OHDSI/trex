import { assertEquals } from "jsr:@std/assert";
import { _handleJoin } from "./channel.ts";
import { _handleBroadcast, broadcastToTopic } from "./broadcast.ts";
import type { PhoenixMessage } from "./protocol.ts";

function fakeSocket() {
  const sent: PhoenixMessage[] = [];
  return { sent, claims: { role: "authenticated", sub: crypto.randomUUID(), exp: 9999999999 }, channels: new Map(), send: (m: PhoenixMessage) => sent.push(m) } as any;
}
async function join(sock: any, topic: string, cfg: any = {}) {
  await _handleJoin(sock, { topic, event: "phx_join", ref: "1", join_ref: "1", payload: { config: cfg } });
}

Deno.test("broadcast reaches other members, not sender by default", async () => {
  const a = fakeSocket(), b = fakeSocket();
  await join(a, "realtime:bc1"); await join(b, "realtime:bc1");
  await _handleBroadcast(a, { topic: "realtime:bc1", event: "broadcast", ref: "5",
    payload: { type: "broadcast", event: "cursor", payload: { x: 1 } } });
  assertEquals(b.sent.filter((m: any) => m.event === "broadcast").length, 1);
  assertEquals(a.sent.filter((m: any) => m.event === "broadcast").length, 0);
});

Deno.test("self:true echoes to sender; ack:true replies", async () => {
  const a = fakeSocket();
  await join(a, "realtime:bc2", { broadcast: { self: true, ack: true } });
  await _handleBroadcast(a, { topic: "realtime:bc2", event: "broadcast", ref: "9",
    payload: { type: "broadcast", event: "e", payload: {} } });
  assertEquals(a.sent.filter((m: any) => m.event === "broadcast").length, 1);
  assertEquals(a.sent.filter((m: any) => m.event === "phx_reply" && m.ref === "9").length, 1);
});

Deno.test("broadcastToTopic returns receiver count", async () => {
  const a = fakeSocket();
  await join(a, "realtime:bc3");
  assertEquals(broadcastToTopic("realtime:bc3", "sys", { hello: 1 }), 1);
  assertEquals(broadcastToTopic("realtime:none", "sys", {}), 0);
});

Deno.test("private channel: read-only sender (canWrite=false) broadcast is dropped", async () => {
  const a = fakeSocket(), b = fakeSocket();
  await join(a, "realtime:bcpriv1"); await join(b, "realtime:bcpriv1");
  // Simulate a private channel the sender joined with READ but not WRITE. The
  // authz join hook is DB-backed, so set the state the hook would have stashed.
  for (const s of [a, b]) {
    const ch = s.channels.get("realtime:bcpriv1");
    ch.isPrivate = true; ch.canWrite = false;
  }
  await _handleBroadcast(a, { topic: "realtime:bcpriv1", event: "broadcast", ref: "5",
    payload: { type: "broadcast", event: "cursor", payload: { x: 1 } } });
  assertEquals(b.sent.filter((m: any) => m.event === "broadcast").length, 0);
});

Deno.test("private channel: write-authorized sender (canWrite=true) broadcast is delivered", async () => {
  const a = fakeSocket(), b = fakeSocket();
  await join(a, "realtime:bcpriv2"); await join(b, "realtime:bcpriv2");
  for (const s of [a, b]) {
    const ch = s.channels.get("realtime:bcpriv2");
    ch.isPrivate = true; ch.canWrite = true;
  }
  await _handleBroadcast(a, { topic: "realtime:bcpriv2", event: "broadcast", ref: "6",
    payload: { type: "broadcast", event: "cursor", payload: { x: 1 } } });
  assertEquals(b.sent.filter((m: any) => m.event === "broadcast").length, 1);
});
