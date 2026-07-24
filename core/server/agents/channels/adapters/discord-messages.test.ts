// Pure-logic tests for MESSAGE_CREATE handling: parse, trigger decision,
// mention stripping, and history-block formatting. No I/O.
import { assert, assertEquals } from "jsr:@std/assert";
import {
  decideMessageTrigger,
  type DiscordMessageEvent,
  formatAttachmentsBlock,
  formatDiscordMessageContextBlock,
  formatMessagesBlock,
  markdownTablesToCodeBlocks,
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
    mentionRoleIds: [],
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
  assertEquals(e.mentionRoleIds, []);
});

Deno.test("parseDiscordMessageEvent: captures mention_roles", () => {
  const e = parseDiscordMessageEvent({ ...RAW_MESSAGE, mention_roles: ["role-1", "role-2"] });
  assert(e !== null);
  assertEquals(e.mentionRoleIds, ["role-1", "role-2"]);
});

Deno.test("parseDiscordMessageEvent: missing id/author/channel → null", () => {
  assertEquals(parseDiscordMessageEvent({}), null);
  assertEquals(parseDiscordMessageEvent({ ...RAW_MESSAGE, id: undefined }), null);
  assertEquals(parseDiscordMessageEvent({ ...RAW_MESSAGE, author: undefined }), null);
  assertEquals(parseDiscordMessageEvent({ ...RAW_MESSAGE, channel_id: "" }), null);
  assertEquals(parseDiscordMessageEvent(null), null);
});

Deno.test("parseDiscordMessageEvent: attachments parsed (metadata only), malformed entries dropped", () => {
  const e = parseDiscordMessageEvent({
    ...RAW_MESSAGE,
    attachments: [
      { id: "a1", filename: "screen.png", url: "https://cdn.example/a1/screen.png", content_type: "image/png", size: 1234 },
      { id: "a2", filename: "notes.txt", url: "https://cdn.example/a2/notes.txt" }, // no content_type/size — fine
      { id: "a3", url: "https://cdn.example/a3" }, // no filename — dropped
      "garbage", // not an object — dropped
    ],
  });
  assertEquals(e?.attachments, [
    { name: "screen.png", url: "https://cdn.example/a1/screen.png", contentType: "image/png", size: 1234 },
    { name: "notes.txt", url: "https://cdn.example/a2/notes.txt" },
  ]);
  // No attachments field at all → empty array, not undefined/null crash.
  assertEquals(parseDiscordMessageEvent(RAW_MESSAGE)?.attachments, []);
});

Deno.test("formatAttachmentsBlock: metadata block for the agent; empty for none", () => {
  const block = formatAttachmentsBlock([
    { name: "screen.png", url: "https://cdn.example/s.png", contentType: "image/png", size: 9 },
  ]);
  assert(block.startsWith("<attachments>\n"));
  assert(block.endsWith("\n</attachments>"));
  // Carries name/url/contentType — and never size or file content.
  assertEquals(
    JSON.parse(block.slice("<attachments>\n".length, -"\n</attachments>".length)),
    [{ name: "screen.png", url: "https://cdn.example/s.png", contentType: "image/png" }],
  );
  assertEquals(formatAttachmentsBlock([]), "");
  assertEquals(formatAttachmentsBlock(undefined), "");
});

Deno.test("parseDiscordMessageEvent: empty content tolerated (no MESSAGE_CONTENT intent yields '')", () => {
  const e = parseDiscordMessageEvent({ ...RAW_MESSAGE, content: undefined });
  assert(e !== null);
  assertEquals(e.content, "");
});

Deno.test("parseDiscordMessageEvent: retains the message type when numeric, undefined when absent", () => {
  const withType = parseDiscordMessageEvent({ ...RAW_MESSAGE, type: 6 });
  assert(withType !== null);
  assertEquals(withType.type, 6);
  const withoutType = parseDiscordMessageEvent(RAW_MESSAGE);
  assert(withoutType !== null);
  assertEquals(withoutType.type, undefined);
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

Deno.test("mentionsBot: via the bot's managed role mention", () => {
  assert(mentionsBot(event({ mentionRoleIds: ["role-1"] }), "app-1", "role-1"));
  // A different role mention (not the bot's) is not a bot mention.
  assert(!mentionsBot(event({ mentionRoleIds: ["role-2"] }), "app-1", "role-1"));
  // Without a known bot role id, a role mention alone never triggers.
  assert(!mentionsBot(event({ mentionRoleIds: ["role-1"] }), "app-1"));
});

Deno.test("stripBotMention also removes the bot's <@&roleId> mention", () => {
  assertEquals(stripBotMention("<@&role-1> fix the bug", "app-1", "role-1"), "fix the bug");
  assertEquals(stripBotMention("<@app-1> and <@&role-1> hi", "app-1", "role-1"), "and hi");
});

// ---- markdown table rendering -------------------------------------------

Deno.test("markdownTablesToCodeBlocks: converts a GFM table to an aligned code block", () => {
  const input = [
    "Here are the controls:",
    "",
    "| Control | Vuetify 3 | Notes |",
    "| --- | --- | --- |",
    "| button | v-btn | drop-in |",
    "| select | v-select | needs items |",
    "",
    "Done.",
  ].join("\n");
  const out = markdownTablesToCodeBlocks(input);
  assert(out.includes("```"), "should wrap the table in a code fence");
  assert(!out.includes("| Control |"), "raw pipe header should be gone");
  // Columns are space-aligned: 'button' and 'select' start at the same offset.
  const lines = out.split("\n");
  const btn = lines.find((l) => l.startsWith("button"))!;
  const sel = lines.find((l) => l.startsWith("select"))!;
  assertEquals(btn.indexOf("v-btn"), sel.indexOf("v-select"));
  // Surrounding prose is preserved.
  assert(out.startsWith("Here are the controls:"));
  assert(out.trimEnd().endsWith("Done."));
});

Deno.test("markdownTablesToCodeBlocks: leaves non-table text and fenced tables untouched", () => {
  const noTable = "Just a list:\n- a\n- b\n";
  assertEquals(markdownTablesToCodeBlocks(noTable), noTable);
  // A pipe line without a separator row is not a table.
  const notATable = "a | b is not a table\nsecond line";
  assertEquals(markdownTablesToCodeBlocks(notATable), notATable);
  // Already inside a fence: left as-is (no double conversion).
  const fenced = "```\n| a | b |\n| - | - |\n| 1 | 2 |\n```";
  assertEquals(markdownTablesToCodeBlocks(fenced), fenced);
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

Deno.test("decideMessageTrigger: a bot managed-role mention counts as a mention", () => {
  // Regression: "@trex" autocompletes to the bot's managed role (<@&roleId>),
  // not the bot user — mentions=[] but mention_roles=[botRole]. Must still fire.
  assertEquals(
    decideMessageTrigger({
      event: event({ content: "<@&role-1> build a dashboard", mentionRoleIds: ["role-1"] }),
      applicationId: "app-1",
      channel: REGULAR_CHANNEL,
      botRoleId: "role-1",
    }).kind,
    "mention-in-channel",
  );
  assertEquals(
    decideMessageTrigger({
      event: event({ mentionRoleIds: ["role-1"] }),
      applicationId: "app-1",
      channel: FOREIGN_THREAD,
      botRoleId: "role-1",
    }).kind,
    "mention-in-thread",
  );
  // A role mention with no task text is still ignored in a channel.
  assertEquals(
    decideMessageTrigger({
      event: event({ content: "<@&role-1>", mentionRoleIds: ["role-1"] }),
      applicationId: "app-1",
      channel: REGULAR_CHANNEL,
      botRoleId: "role-1",
    }).kind,
    "ignore",
  );
  // Without the bot role id resolved, the role mention does nothing.
  assertEquals(
    decideMessageTrigger({
      event: event({ content: "<@&role-1> hi", mentionRoleIds: ["role-1"] }),
      applicationId: "app-1",
      channel: REGULAR_CHANNEL,
    }).kind,
    "ignore",
  );
});

Deno.test("decideMessageTrigger: a non-default/reply type is ignored even in an owned thread", () => {
  // type 6 = pinned-message notice — a system message, not a human turn.
  assertEquals(
    decideMessageTrigger({ event: event({ type: 6 }), applicationId: "app-1", channel: CLAW_THREAD }).kind,
    "ignore",
  );
  // type 19 = REPLY — a normal human turn, must still fire.
  assertEquals(
    decideMessageTrigger({ event: event({ type: 19 }), applicationId: "app-1", channel: CLAW_THREAD }).kind,
    "thread-turn",
  );
});

Deno.test("decideMessageTrigger: empty/whitespace content in an owned thread is ignored", () => {
  assertEquals(
    decideMessageTrigger({ event: event({ content: "" }), applicationId: "app-1", channel: CLAW_THREAD }).kind,
    "ignore",
  );
  assertEquals(
    decideMessageTrigger({ event: event({ content: "   " }), applicationId: "app-1", channel: CLAW_THREAD }).kind,
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

import { fetchMessagesBefore, getChannelSnapshot } from "./discord-messages.ts";

function fakeApiFetch(respond: (url: string) => Response) {
  const calls: string[] = [];
  const fn = ((input: URL | RequestInfo, _init?: RequestInit) => {
    calls.push(String(input));
    return Promise.resolve(respond(String(input)));
  }) as typeof fetch;
  return { fn, calls };
}

Deno.test("getChannelSnapshot maps type/parent/owner and caches", async () => {
  const { fn, calls } = fakeApiFetch(() => Response.json({ type: 11, parent_id: "chan-1", owner_id: "app-1" }));
  const cache = new Map();
  const api = { credentials: { botToken: "tok" }, fetch: fn };
  const s1 = await getChannelSnapshot(api, "thread-1", cache);
  const s2 = await getChannelSnapshot(api, "thread-1", cache);
  assertEquals(s1, { type: 11, parentId: "chan-1", ownerId: "app-1" });
  assertEquals(s2, s1);
  assertEquals(calls.length, 1); // second call served from cache
});

Deno.test("fetchMessagesBefore reverses to oldest-first and maps authors", async () => {
  const { fn, calls } = fakeApiFetch(() =>
    Response.json([
      { id: "3", content: "newest", author: { username: "bob", bot: false } },
      { id: "2", content: "reply", author: { username: "trex", bot: true } },
      { id: "1", content: "oldest", author: { username: "alice", bot: false } },
    ])
  );
  const out = await fetchMessagesBefore({ credentials: { botToken: "tok" }, fetch: fn }, "thread-1", {
    before: "msg-4",
    limit: 50,
  });
  assert(calls[0].includes("/channels/thread-1/messages?limit=50&before=msg-4"));
  assertEquals(out.map((m) => m.content), ["oldest", "reply", "newest"]);
  assertEquals(out[1], { author: "trex", bot: true, content: "reply" });
});

Deno.test("fetchMessagesBefore without `before` omits the before param", async () => {
  const { fn, calls } = fakeApiFetch(() => Response.json([]));
  await fetchMessagesBefore({ credentials: { botToken: "tok" }, fetch: fn }, "thread-1", { limit: 50 });
  assert(calls[0].includes("limit=50"));
  assert(!calls[0].includes("before="));
});
