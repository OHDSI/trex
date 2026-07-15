import { assertEquals } from "jsr:@std/assert";
import { channelAllows, envAllowList } from "./allow.ts";

Deno.test("channelAllows: no config admits everyone", () => {
  assertEquals(channelAllows(undefined, { userId: "u1" }), true);
  assertEquals(channelAllows({}, {}), true);
});

Deno.test("channelAllows: users list gates userId", () => {
  assertEquals(channelAllows({ users: ["u1"] }, { userId: "u1" }), true);
  assertEquals(channelAllows({ users: ["u1"] }, { userId: "u2" }), false);
  assertEquals(channelAllows({ users: ["u1"] }, {}), false);
});

Deno.test("channelAllows: conversations list gates conversationId", () => {
  assertEquals(channelAllows({ conversations: ["c1"] }, { conversationId: "c1", userId: "u9" }), true);
  assertEquals(channelAllows({ conversations: ["c1"] }, { conversationId: "c2" }), false);
});

Deno.test("channelAllows: a sub-conversation passes via its parent id", () => {
  // Discord thread of an allow-listed channel: conversationId is the thread,
  // conversationParentId the channel.
  assertEquals(channelAllows({ conversations: ["c1"] }, { conversationId: "t1", conversationParentId: "c1" }), true);
  assertEquals(channelAllows({ conversations: ["c1"] }, { conversationId: "t1", conversationParentId: "c2" }), false);
  assertEquals(channelAllows({ conversations: ["c1"] }, { conversationId: "t1" }), false);
});

Deno.test("channelAllows: both lists must match (AND)", () => {
  const allow = { users: ["u1"], conversations: ["c1"] };
  assertEquals(channelAllows(allow, { userId: "u1", conversationId: "c1" }), true);
  assertEquals(channelAllows(allow, { userId: "u1", conversationId: "c2" }), false);
  assertEquals(channelAllows(allow, { userId: "u2", conversationId: "c1" }), false);
});

Deno.test("envAllowList: parses comma-separated env, undefined when unset", () => {
  Deno.env.set("ALLOWTEST_ALLOWED_USERS", "u1, u2,,");
  Deno.env.set("ALLOWTEST_ALLOWED_CHANNELS", "");
  try {
    assertEquals(envAllowList("ALLOWTEST"), { users: ["u1", "u2"] });
    assertEquals(envAllowList("ALLOWTEST_MISSING"), undefined);
  } finally {
    Deno.env.delete("ALLOWTEST_ALLOWED_USERS");
    Deno.env.delete("ALLOWTEST_ALLOWED_CHANNELS");
  }
});
