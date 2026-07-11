import { assertEquals } from "jsr:@std/assert";
import { handleMessagesInsert } from "./broadcast-db.ts";
import { channelsByTopic, type Channel } from "./channel.ts";
import type { Wal2JsonChange } from "./wal-shape.ts";

// Register a fake channel on a topic that records what broadcastToTopic delivers.
// broadcastToTopic only touches ch.send / identity, so a minimal stub suffices.
function spyChannel(topic: string): Array<{ event: string; payload: unknown }> {
  const calls: Array<{ event: string; payload: unknown }> = [];
  const ch = { send: (event: string, payload: unknown) => calls.push({ event, payload }) };
  let set = channelsByTopic.get(topic);
  if (!set) channelsByTopic.set(topic, set = new Set());
  set.add(ch as unknown as Channel);
  return calls;
}

function insert(cols: Record<string, unknown>): Wal2JsonChange {
  return {
    action: "I",
    schema: "realtime",
    table: "messages",
    columns: Object.entries(cols).map(([name, value]) => ({ name, type: "text", value })),
  };
}

Deno.test("handleMessagesInsert fans out a broadcast row to its topic", async () => {
  const calls = spyChannel("realtime:room1");
  try {
    await handleMessagesInsert(insert({
      topic: "room1",
      extension: "broadcast",
      event: "cursor",
      payload: { x: 1 },
    }));
    assertEquals(calls.length, 1);
    assertEquals(calls[0].event, "broadcast");
    assertEquals(calls[0].payload, { type: "broadcast", event: "cursor", payload: { x: 1 } });
  } finally {
    channelsByTopic.delete("realtime:room1");
  }
});

Deno.test("handleMessagesInsert parses a jsonb payload delivered as a string", async () => {
  const calls = spyChannel("realtime:room1");
  try {
    await handleMessagesInsert(insert({
      topic: "room1",
      extension: "broadcast",
      event: "cursor",
      payload: JSON.stringify({ x: 2 }),
    }));
    assertEquals(calls.length, 1);
    assertEquals(calls[0].payload, { type: "broadcast", event: "cursor", payload: { x: 2 } });
  } finally {
    channelsByTopic.delete("realtime:room1");
  }
});

Deno.test("handleMessagesInsert does not throw on a malformed payload string", async () => {
  const calls = spyChannel("realtime:room1");
  try {
    // A single bad row must not throw out of the WAL consumer loop; fall back to raw.
    await handleMessagesInsert(insert({
      topic: "room1",
      extension: "broadcast",
      event: "cursor",
      payload: "{not valid json",
    }));
    assertEquals(calls.length, 1);
    assertEquals(calls[0].payload, { type: "broadcast", event: "cursor", payload: "{not valid json" });
  } finally {
    channelsByTopic.delete("realtime:room1");
  }
});

Deno.test("handleMessagesInsert drops non-broadcast and authz-probe rows", async () => {
  const calls = spyChannel("realtime:room1");
  try {
    // Wrong extension → never fanned out.
    await handleMessagesInsert(insert({ topic: "room1", extension: "presence", event: "join" }));
    // authz probe → never fanned out even on the broadcast extension.
    await handleMessagesInsert(insert({ topic: "room1", extension: "broadcast", event: "authz-probe" }));
    assertEquals(calls.length, 0);
  } finally {
    channelsByTopic.delete("realtime:room1");
  }
});
