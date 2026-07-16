import { assertEquals } from "jsr:@std/assert";
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
