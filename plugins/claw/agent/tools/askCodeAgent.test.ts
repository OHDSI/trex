import { assertEquals } from "jsr:@std/assert";
import { askCore } from "./askCodeAgent.ts";
import type { TokioClient } from "../lib/code-session.ts";

function ndjson(...e: unknown[]) {
  return new Response(e.map((x) => JSON.stringify(x)).join("\n") + "\n");
}
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

Deno.test("askCore opens a code session on first use and stores its id + cursor", async () => {
  let seenBody: any;
  const client: TokioClient = {
    req(url, init) {
      if (url.endsWith("/eve/v1/session")) {
        seenBody = JSON.parse((init as any).body);
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "code-1" })));
      }
      return Promise.resolve(ndjson(
        { type: "message.completed", data: { text: "on it — here is my plan" } },
        { type: "session.waiting", data: {} },
      ));
    },
  };
  const sql = fakeSql();
  const out = await askCore(client, sql.fn, { sessionId: "s1", userId: "u1" }, { message: "Build X with acceptance criteria Y" });

  assertEquals(out.reply, "on it — here is my plan");
  // forwarded verbatim, no devx mode
  assertEquals(seenBody.message, "Build X with acceptance criteria Y");
  assertEquals(seenBody.metadata, undefined);
  const row = sql.store.get("s1");
  assertEquals(row.code_session_id, "code-1");
  assertEquals(row.event_cursor, 2);
});

Deno.test("askCore passes the chosen app on first call and persists it", async () => {
  let seenBody: any;
  const client: TokioClient = {
    req(url, init) {
      if (url.endsWith("/eve/v1/session")) {
        seenBody = JSON.parse((init as any).body);
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "code-1" })));
      }
      return Promise.resolve(ndjson({ type: "message.completed", data: { text: "ok" } }, { type: "session.waiting", data: {} }));
    },
  };
  const sql = fakeSql();
  await askCore(client, sql.fn, { sessionId: "s1", userId: "u1" }, { message: "Build X", app: "app-7" });
  assertEquals(seenBody.metadata, { appId: "app-7" });
  assertEquals(sql.store.get("s1").app_id, "app-7");
});

Deno.test("askCore keeps the stored app once the session exists (mid-task change ignored)", async () => {
  const sql = fakeSql();
  sql.store.set("s1", { session_id: "s1", code_session_id: "code-1", event_cursor: 2, app_id: "app-7" });
  let seenBody: any;
  const client: TokioClient = {
    req(url, init) {
      if (url.includes("/stream")) {
        return Promise.resolve(ndjson({ type: "message.completed", data: { text: "ok" } }, { type: "session.waiting", data: {} }));
      }
      seenBody = JSON.parse((init as any).body);
      return Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    },
  };
  await askCore(client, sql.fn, { sessionId: "s1", userId: "u1" }, { message: "continue", app: "app-9" });
  assertEquals(seenBody.metadata, { appId: "app-7" });
  assertEquals(sql.store.get("s1").app_id, "app-7");
});

Deno.test("askCore continues the SAME code session from the stored cursor", async () => {
  const sql = fakeSql();
  sql.store.set("s1", { session_id: "s1", code_session_id: "code-1", event_cursor: 2 });
  let seenUrl = "";
  const client: TokioClient = {
    req(url) {
      seenUrl = url;
      if (url.includes("/stream")) {
        return Promise.resolve(ndjson({ type: "message.completed", data: { text: "answered" } }, { type: "session.waiting", data: {} }));
      }
      return Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    },
  };
  const out = await askCore(client, sql.fn, { sessionId: "s1", userId: "u1" }, { message: "the team says: use option B" });
  assertEquals(out.reply, "answered");
  assertEquals(sql.store.get("s1").event_cursor, 4);
  assertEquals(seenUrl.includes("startIndex=2"), true);
});
