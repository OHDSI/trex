// Pure-logic tests for MESSAGE_CREATE handling: parse, trigger decision,
// mention stripping, and history-block formatting. No I/O.
import { assert, assertEquals } from "jsr:@std/assert";
import {
  decideMessageTrigger,
  type DiscordMessageEvent,
  formatDiscordMessageContextBlock,
  formatMessagesBlock,
  mentionsBot,
  parseDiscordMessageEvent,
  stripBotMention,
} from "./discord-messages.ts";

const RAW_MESSAGE = {
  id: "msg-1",
  channel_id: "chan-1",
  guild_id: "guild-1",
  content: "<@app-1> please fix the login bug",
  author: { id: "user-1", username: "alice", bot: false },
  mentions: [{ id: "app-1", username: "trex", bot: true }],
};

function event(overrides: Partial<DiscordMessageEvent> = {}): DiscordMessageEvent {
  return {
    id: "msg-1",
    channelId: "chan-1",
    guildId: "guild-1",
    author: { id: "user-1", bot: false, username: "alice" },
    content: "hello",
    mentionIds: [],
    ...overrides,
  };
}

// ---- parse -------------------------------------------------------------

Deno.test("parseDiscordMessageEvent: full payload", () => {
  const e = parseDiscordMessageEvent(RAW_MESSAGE);
  assert(e !== null);
  assertEquals(e.id, "msg-1");
  assertEquals(e.channelId, "chan-1");
  assertEquals(e.guildId, "guild-1");
  assertEquals(e.author, { id: "user-1", bot: false, username: "alice" });
  assertEquals(e.content, "<@app-1> please fix the login bug");
  assertEquals(e.mentionIds, ["app-1"]);
});

Deno.test("parseDiscordMessageEvent: missing id/author/channel → null", () => {
  assertEquals(parseDiscordMessageEvent({}), null);
  assertEquals(parseDiscordMessageEvent({ ...RAW_MESSAGE, id: undefined }), null);
  assertEquals(parseDiscordMessageEvent({ ...RAW_MESSAGE, author: undefined }), null);
  assertEquals(parseDiscordMessageEvent({ ...RAW_MESSAGE, channel_id: "" }), null);
  assertEquals(parseDiscordMessageEvent(null), null);
});

Deno.test("parseDiscordMessageEvent: empty content tolerated (no MESSAGE_CONTENT intent yields '')", () => {
  const e = parseDiscordMessageEvent({ ...RAW_MESSAGE, content: undefined });
  assert(e !== null);
  assertEquals(e.content, "");
});

// ---- mention detection / stripping --------------------------------------

Deno.test("mentionsBot: via mentions array and via raw content", () => {
  assert(mentionsBot(event({ mentionIds: ["app-1"] }), "app-1"));
  assert(mentionsBot(event({ content: "hey <@!app-1> hi" }), "app-1"));
  assert(!mentionsBot(event({ mentionIds: ["other"] }), "app-1"));
});

Deno.test("stripBotMention removes <@id> and <@!id> forms and trims", () => {
  assertEquals(stripBotMention("<@app-1> fix the bug", "app-1"), "fix the bug");
  assertEquals(stripBotMention("fix <@!app-1>  the bug", "app-1"), "fix the bug");
  assertEquals(stripBotMention("<@app-1>", "app-1"), "");
});

// ---- trigger decision ----------------------------------------------------

const CLAW_THREAD = { type: 11, parentId: "chan-1", ownerId: "app-1" };
const FOREIGN_THREAD = { type: 11, parentId: "chan-1", ownerId: "someone-else" };
const REGULAR_CHANNEL = { type: 0 };

Deno.test("decideMessageTrigger: bot author is always ignored", () => {
  const t = decideMessageTrigger({
    event: event({ author: { id: "app-1", bot: true, username: "trex" } }),
    applicationId: "app-1",
    channel: CLAW_THREAD,
  });
  assertEquals(t.kind, "ignore");
});

Deno.test("decideMessageTrigger: plain human message in claw-owned thread → thread-turn", () => {
  const t = decideMessageTrigger({ event: event(), applicationId: "app-1", channel: CLAW_THREAD });
  assertEquals(t.kind, "thread-turn");
});

Deno.test("decideMessageTrigger: foreign thread needs a mention", () => {
  assertEquals(
    decideMessageTrigger({ event: event(), applicationId: "app-1", channel: FOREIGN_THREAD }).kind,
    "ignore",
  );
  assertEquals(
    decideMessageTrigger({
      event: event({ mentionIds: ["app-1"] }),
      applicationId: "app-1",
      channel: FOREIGN_THREAD,
    }).kind,
    "mention-in-thread",
  );
});

Deno.test("decideMessageTrigger: regular channel needs a mention with a non-empty task", () => {
  assertEquals(
    decideMessageTrigger({ event: event(), applicationId: "app-1", channel: REGULAR_CHANNEL }).kind,
    "ignore",
  );
  assertEquals(
    decideMessageTrigger({
      event: event({ content: "<@app-1> build a dashboard", mentionIds: ["app-1"] }),
      applicationId: "app-1",
      channel: REGULAR_CHANNEL,
    }).kind,
    "mention-in-channel",
  );
  // A bare "@trex" with no task text is ignored.
  assertEquals(
    decideMessageTrigger({
      event: event({ content: "<@app-1>", mentionIds: ["app-1"] }),
      applicationId: "app-1",
      channel: REGULAR_CHANNEL,
    }).kind,
    "ignore",
  );
});

// ---- history block ---------------------------------------------------------

Deno.test("formatMessagesBlock: oldest-first, bot label, 500-char cap, empty → empty string", () => {
  const block = formatMessagesBlock("thread_messages", [
    { author: "alice", bot: false, content: "first" },
    { author: "trex", bot: true, content: "x".repeat(600) },
  ]);
  assert(block.startsWith("<thread_messages>\n"));
  assert(block.endsWith("\n</thread_messages>"));
  const lines = block.split("\n");
  assertEquals(lines[1], "[alice] first");
  assert(lines[2].startsWith("[bot:trex] "));
  // 500 content chars + "…" marker, no more
  assertEquals(lines[2].length, "[bot:trex] ".length + 501);
  assertEquals(formatMessagesBlock("channel_messages", []), "");
});

Deno.test("formatDiscordMessageContextBlock carries message identity, no interaction fields", () => {
  const block = formatDiscordMessageContextBlock({
    userId: "user-1",
    username: "alice",
    channelId: "chan-1",
    guildId: "guild-1",
    messageId: "msg-1",
  });
  assert(block.includes("<discord_context>"));
  assert(block.includes("user_id: user-1"));
  assert(block.includes("message_id: msg-1"));
  assert(!block.includes("interaction_id"));
});
