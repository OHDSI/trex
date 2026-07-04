import { assertEquals, assert } from "jsr:@std/assert";
import { channelsByTopic, _handleJoin, _handleLeave } from "./channel.ts";
import type { PhoenixMessage } from "./protocol.ts";

function fakeSocket() {
  const sent: PhoenixMessage[] = [];
  return {
    sent,
    claims: { role: "authenticated", sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 },
    channels: new Map(),
    send: (m: PhoenixMessage) => sent.push(m),
  } as any;
}

Deno.test("phx_join replies ok with assigned postgres_changes ids", async () => {
  const sock = fakeSocket();
  await _handleJoin(sock, {
    topic: "realtime:room1", event: "phx_join", ref: "1", join_ref: "1",
    payload: { config: { broadcast: { self: true, ack: false }, presence: { key: "" },
      postgres_changes: [{ event: "INSERT", schema: "public", table: "todos", filter: "id=eq.1" }], private: false } },
  });
  const r = sock.sent.find((m: PhoenixMessage) => m.event === "phx_reply");
  assertEquals(r.payload.status, "ok");
  const pcs = r.payload.response.postgres_changes;
  assertEquals(pcs.length, 1);
  assert(Number.isInteger(pcs[0].id));
  assertEquals(pcs[0].table, "todos");
  assert(channelsByTopic.get("realtime:room1")?.size === 1);
});

Deno.test("phx_join rejects wildcard (schema-wide) postgres_changes bindings visibly", async () => {
  const sock = fakeSocket();
  await _handleJoin(sock, {
    topic: "realtime:wild1", event: "phx_join", ref: "1", join_ref: "1",
    payload: { config: { postgres_changes: [
      { event: "*", schema: "public", table: "*" },          // explicit wildcard
      { event: "INSERT", schema: "public" },                  // table omitted → wildcard
      { event: "INSERT", schema: "public", table: "todos" },  // concrete, must survive
    ] } },
  });
  const r = sock.sent.find((m: PhoenixMessage) => m.event === "phx_reply");
  assertEquals(r.payload.status, "ok"); // join still succeeds
  const pcs = r.payload.response.postgres_changes;
  // Only the concrete-table binding is accepted; wildcards get no id and are absent.
  assertEquals(pcs.length, 1);
  assertEquals(pcs[0].table, "todos");
  assert(!pcs.some((b: any) => b.table === "*"));
  assert(channelsByTopic.get("realtime:wild1")?.size === 1);
});

Deno.test("phx_leave removes the channel", async () => {
  const sock = fakeSocket();
  await _handleJoin(sock, { topic: "realtime:r2", event: "phx_join", ref: "1", join_ref: "1", payload: { config: {} } });
  await _handleLeave(sock, { topic: "realtime:r2", event: "phx_leave", ref: "2", payload: {} });
  assertEquals(channelsByTopic.get("realtime:r2")?.size ?? 0, 0);
});

Deno.test("second join to same topic on same socket replaces the channel", async () => {
  const sock = fakeSocket();
  await _handleJoin(sock, { topic: "realtime:r3", event: "phx_join", ref: "1", join_ref: "1", payload: { config: {} } });
  await _handleJoin(sock, { topic: "realtime:r3", event: "phx_join", ref: "2", join_ref: "2", payload: { config: {} } });
  assertEquals(channelsByTopic.get("realtime:r3")?.size, 1);
});
