import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { askCore } from "./askCodeAgent.ts";
import type { CodeTurnArgs } from "../lib/code-stream.ts";

function fakeSql() {
  const store = new Map<string, any>();
  const calls: string[] = [];
  const fn = (sql: string, params: unknown[] = []) => {
    calls.push(sql.split("\n")[0].trim());
    if (sql.startsWith("SELECT")) {
      const r = store.get(String(params[0]));
      return Promise.resolve({ rows: r ? [r] : [] });
    }
    store.set(String(params[0]), {
      session_id: params[0], code_session_id: params[1], event_cursor: params[2], app_id: params[3] ?? null,
    });
    return Promise.resolve({ rows: [] });
  };
  return { fn, store, calls };
}

// Stubs code-stream's runCodeTurn: records the args askCore passed and returns a
// canned reply + chat id, so the orchestration logic is exercised without a
// live coder.
function stubTurn(reply = "ok", chatId = "chat-1") {
  const seen: CodeTurnArgs[] = [];
  const fn = (args: CodeTurnArgs) => {
    seen.push(args);
    return Promise.resolve({ chatId, replyText: reply });
  };
  return { fn, seen };
}

Deno.test("askCore opens a coder chat on first use and stores its id", async () => {
  const sql = fakeSql();
  const turn = stubTurn("on it — here is my plan", "chat-1");
  const out = await askCore(
    sql.fn,
    { sessionId: "s1", userId: "u1" },
    { message: "Build X with acceptance criteria Y" },
    turn.fn,
  );
  assertEquals(out.reply, "on it — here is my plan");
  assertEquals(turn.seen[0].chatId, null); // first use — no prior chat
  assertEquals(turn.seen[0].message, "Build X with acceptance criteria Y");
  assertEquals(turn.seen[0].userId, "u1");
  const row = sql.store.get("s1");
  assertEquals(row.code_session_id, "chat-1");
  assertEquals(Number(row.event_cursor), 0);
});

Deno.test("askCore passes the chosen app on first call and persists it", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "Build X", app: "app-7" }, turn.fn);
  assertEquals(turn.seen[0].appId, "app-7");
  assertEquals(sql.store.get("s1").app_id, "app-7");
});

Deno.test("askCore keeps the stored app once the chat exists (mid-task change ignored)", async () => {
  const sql = fakeSql();
  sql.store.set("s1", { session_id: "s1", code_session_id: "chat-1", event_cursor: 0, app_id: "app-7" });
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "continue", app: "app-9" }, turn.fn);
  assertEquals(turn.seen[0].appId, "app-7"); // stored app wins
  assertEquals(sql.store.get("s1").app_id, "app-7");
});

Deno.test("askCore continues the SAME coder chat", async () => {
  const sql = fakeSql();
  sql.store.set("s1", { session_id: "s1", code_session_id: "chat-1", event_cursor: 0, app_id: null });
  const turn = stubTurn("answered", "chat-1");
  const out = await askCore(
    sql.fn,
    { sessionId: "s1", userId: "u1" },
    { message: "the team says: use option B" },
    turn.fn,
  );
  assertEquals(out.reply, "answered");
  assertEquals(turn.seen[0].chatId, "chat-1"); // continues the stored chat
});

// Task 5 (claw-devx-reliability): the heartbeat is wired through askCodeAgent
// so claw can still show a sign of life while blocked inside this hand-off.
Deno.test("askCore passes onProgress to the coder turn when a channelId is available", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1", channelId: "chan-1" }, { message: "go" }, turn.fn);
  assertEquals(typeof turn.seen[0].onProgress, "function");
});

Deno.test("askCore passes no onProgress at all when there is no channelId — never a no-op timer", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, turn.fn);
  assertEquals(turn.seen[0].onProgress, undefined);
});

Deno.test("askCore's onProgress posts 'Still on it: <note>' to the channel and swallows a post failure", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  const originalFetch = globalThis.fetch;
  const originalToken = Deno.env.get("DISCORD_BOT_TOKEN");
  const posts: { url: string; body: unknown }[] = [];
  try {
    Deno.env.set("DISCORD_BOT_TOKEN", "tok-1");
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      posts.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Promise.resolve(new Response("{}", { status: 500 })); // fails — must be swallowed
    }) as typeof fetch;

    await askCore(sql.fn, { sessionId: "s1", userId: "u1", channelId: "chan-1" }, { message: "go" }, turn.fn);
    const onProgress = turn.seen[0].onProgress!;
    onProgress("running tests");
    // Fire-and-forget: give the swallowed rejection a tick to settle before
    // asserting — a failing heartbeat must never surface as an unhandled
    // rejection or throw back into the caller.
    await new Promise((r) => setTimeout(r, 0));

    assertEquals(posts.length, 1);
    assertEquals(posts[0].url.includes("chan-1"), true);
    assertEquals((posts[0].body as { content: string }).content, "Still on it: running tests");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) Deno.env.delete("DISCORD_BOT_TOKEN");
    else Deno.env.set("DISCORD_BOT_TOKEN", originalToken);
  }
});

// Task 6 (claw-devx-reliability): settled decisions ride every hand-off.
Deno.test("askCore prepends the decision ledger to the forwarded message when decisions exist", async () => {
  const sql = fakeSql();
  sql.store.set("s1", {
    session_id: "s1",
    code_session_id: "chat-1",
    event_cursor: 0,
    app_id: null,
    decisions: [{ at: "2026-08-06T12:00:00Z", question: "follow-up window", decision: "configurable, default 365 days" }],
  });
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "next step: implement it" }, turn.fn);
  assertStringIncludes(turn.seen[0].message, "Already settled");
  assertStringIncludes(turn.seen[0].message, "follow-up window: configurable, default 365 days");
  assertStringIncludes(turn.seen[0].message, "next step: implement it");
});

Deno.test("askCore leaves the message untouched when there are no decisions yet", async () => {
  const sql = fakeSql();
  const turn = stubTurn();
  await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "Build X" }, turn.fn);
  assertEquals(turn.seen[0].message, "Build X");
});

// Task 8 (claw-devx-reliability): the coder's reply ends with a machine
// trailer; the channel must never see it, and claw gets the parsed facts back.
Deno.test("askCore strips the handoff trailer from the reply and returns it parsed", async () => {
  const sql = fakeSql();
  const reply = 'Implemented and tested.\n\n<handoff track="light" saved="trex/specs/x.md" tests="4/4 pass"/>';
  const turn = stubTurn(reply);
  const out = await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, turn.fn);
  assertEquals(out.reply, "Implemented and tested.");
  assertEquals(out.trailer?.track, "light");
  assertEquals(out.trailer?.saved, "trex/specs/x.md");
  assertEquals(out.trailer?.tests, "4/4 pass");
});

Deno.test("askCore returns a null trailer and the reply unchanged when the coder sends no trailer", async () => {
  const sql = fakeSql();
  const turn = stubTurn("Just prose, no trailer.");
  const out = await askCore(sql.fn, { sessionId: "s1", userId: "u1" }, { message: "go" }, turn.fn);
  assertEquals(out.reply, "Just prose, no trailer.");
  assertEquals(out.trailer, null);
});
