import { assert, assertEquals } from "jsr:@std/assert";
import { createChannelStore } from "./store.ts";
import { namespacedToken } from "./continuation.ts";
import type { ChannelAuth } from "./types.ts";

function fakeQuery(responses: Array<{ rows: unknown[] }>) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const fn = (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    return Promise.resolve(responses.shift() ?? { rows: [] });
  };
  return { fn, calls };
}

Deno.test("getSessionByToken returns the mapped session id", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ session_id: "s-1" }] }]);
  const store = createChannelStore(fn as never);
  assertEquals(await store.getSessionByToken("discord", "discord:u1"), "s-1");
  assert(calls[0].sql.includes("FROM agents.channel_sessions"));
  assertEquals(calls[0].params, ["discord", "discord:u1"]);
});

Deno.test("getSessionByToken returns null when no mapping exists", async () => {
  const { fn } = fakeQuery([{ rows: [] }]);
  const store = createChannelStore(fn as never);
  assertEquals(await store.getSessionByToken("discord", "discord:u1"), null);
});

Deno.test("resolveOrCreateSession returns existing session on a token hit", async () => {
  const { fn, calls } = fakeQuery([{ rows: [{ session_id: "s-1" }] }]);
  const store = createChannelStore(fn as never);
  const auth: ChannelAuth = {
    authenticator: "discord",
    principalType: "user",
    principalId: "u1",
    attributes: {},
  };
  const res = await store.resolveOrCreateSession("discord", "discord:u1", "toy-agent", "toy", auth);
  assertEquals(res, { sessionId: "s-1", created: false });
  // Only the lookup runs — no session/mapping INSERT on a hit.
  assertEquals(calls.length, 1);
  assert(calls[0].sql.includes("SELECT session_id FROM agents.channel_sessions"));
  assertEquals(calls[0].params, ["discord", "discord:u1"]);
});

Deno.test("resolveOrCreateSession creates a session and mapping on a miss, populating principal columns", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [] }, // lookup miss
    { rows: [{ id: "s-new" }] }, // sessions INSERT ... RETURNING id
    { rows: [{ session_id: "s-new" }] }, // channel_sessions INSERT ... RETURNING -> we won
  ]);
  const store = createChannelStore(fn as never);
  const auth: ChannelAuth = {
    authenticator: "discord",
    principalType: "user",
    principalId: "u42",
    attributes: {},
  };
  const res = await store.resolveOrCreateSession("discord", "discord:u42", "toy-agent", "toy", auth);
  assertEquals(res, { sessionId: "s-new", created: true });
  assertEquals(calls.length, 3);

  // 2nd call: insert the session with principal columns populated from auth.
  assert(calls[1].sql.includes("INSERT INTO agents.sessions"));
  assert(calls[1].sql.includes("principal_type"));
  assert(calls[1].sql.includes("principal_id"));
  assert(calls[1].sql.includes("authenticator"));
  assertEquals(calls[1].params, ["toy-agent", "toy", null, "user", "u42", "discord"]);

  // 3rd call: record the channel -> session mapping.
  assert(calls[2].sql.includes("INSERT INTO agents.channel_sessions"));
  assertEquals(calls[2].params, ["discord", "discord:u42", "s-new"]);
});

Deno.test("resolveOrCreateSession loses the PK race: deletes orphan session and adopts the winner", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [] }, // lookup miss
    { rows: [{ id: "s-mine" }] }, // sessions INSERT ... RETURNING id
    { rows: [] }, // channel_sessions INSERT ... ON CONFLICT DO NOTHING RETURNING -> no row (lost)
    { rows: [] }, // DELETE orphan session
    { rows: [{ session_id: "s-winner" }] }, // re-SELECT the winner's mapping
  ]);
  const store = createChannelStore(fn as never);
  const res = await store.resolveOrCreateSession("discord", "discord:u1", "toy-agent", "toy", null);
  assertEquals(res, { sessionId: "s-winner", created: false });
  assertEquals(calls.length, 5);

  // mapping INSERT is a conflict-tolerant upsert-guard.
  assert(calls[2].sql.includes("INSERT INTO agents.channel_sessions"));
  assert(calls[2].sql.includes("ON CONFLICT"));
  assert(calls[2].sql.includes("DO NOTHING"));
  assert(calls[2].sql.includes("RETURNING session_id"));

  // orphan cleanup: our own just-created session is deleted.
  assert(calls[3].sql.includes("DELETE FROM agents.sessions"));
  assertEquals(calls[3].params, ["s-mine"]);

  // re-select the winner's mapping.
  assert(calls[4].sql.includes("SELECT session_id FROM agents.channel_sessions"));
  assertEquals(calls[4].params, ["discord", "discord:u1"]);
});

Deno.test("resolveOrCreateSession leaves principal columns null when principal is null", async () => {
  const { fn, calls } = fakeQuery([
    { rows: [] },
    { rows: [{ id: "s-anon" }] },
    { rows: [{ session_id: "s-anon" }] }, // channel_sessions INSERT ... RETURNING -> we won
  ]);
  const store = createChannelStore(fn as never);
  const res = await store.resolveOrCreateSession("web", "web:anon", "toy-agent", "toy", null);
  assertEquals(res, { sessionId: "s-anon", created: true });
  assertEquals(calls[1].params, ["toy-agent", "toy", null, null, null, null]);
});

Deno.test("setContinuationToken re-keys a session via upsert", async () => {
  const { fn, calls } = fakeQuery([{ rows: [] }]);
  const store = createChannelStore(fn as never);
  await store.setContinuationToken("discord", "discord:u1", "s-1");
  assert(calls[0].sql.includes("INSERT INTO agents.channel_sessions"));
  assert(calls[0].sql.includes("ON CONFLICT"));
  assert(calls[0].sql.includes("UPDATE"));
  assertEquals(calls[0].params, ["discord", "discord:u1", "s-1"]);
});

Deno.test("namespacedToken joins channel and raw token with a colon", () => {
  assertEquals(namespacedToken("discord", "u1"), "discord:u1");
  assertEquals(namespacedToken("slack", "T1/C1/U1"), "slack:T1/C1/U1");
});
