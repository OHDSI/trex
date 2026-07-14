// plugins/claw/agent/tools/dispatchToCode.test.ts
import { assertEquals } from "jsr:@std/assert";
import { dispatchCore } from "./dispatchToCode.ts";
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
      session_id: params[0], code_session_id: params[1], plan: params[2], status: params[3], event_cursor: params[4],
    });
    return Promise.resolve({ rows: [] });
  };
  return { fn, store, calls };
}

Deno.test("dispatchCore(plan) creates code session, stores plan + cursor", async () => {
  const client: TokioClient = {
    req(url) {
      if (url.endsWith("/eve/v1/session")) {
        return Promise.resolve(new Response(JSON.stringify({ sessionId: "code-1" })));
      }
      return Promise.resolve(ndjson(
        { type: "message.completed", data: { text: "THE PLAN" } },
        { type: "session.waiting", data: {} },
      ));
    },
  };
  const sql = fakeSql();
  const out = await dispatchCore(client, sql.fn, { sessionId: "s1", userId: "u1" }, { mode: "plan", message: "do X" });
  assertEquals(out.reply, "THE PLAN");
  const row = sql.store.get("s1");
  assertEquals(row.code_session_id, "code-1");
  assertEquals(row.plan, "THE PLAN");
  assertEquals(row.status, "awaiting_plan_approval");
  assertEquals(row.event_cursor, 2);
});

Deno.test("dispatchCore(build) reuses stored code session + cursor and sets implementing", async () => {
  const sql = fakeSql();
  sql.store.set("s1", { session_id: "s1", code_session_id: "code-1", plan: "P", status: "awaiting_plan_approval", event_cursor: 2 });
  let seenUrl = "";
  const client: TokioClient = {
    req(url) {
      seenUrl = url;
      if (url.includes("/stream")) return Promise.resolve(ndjson({ type: "message.completed", data: { text: "BUILT" } }, { type: "session.waiting", data: {} }));
      return Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    },
  };
  const out = await dispatchCore(client, sql.fn, { sessionId: "s1", userId: "u1" }, { mode: "build", message: "go" });
  assertEquals(out.reply, "BUILT");
  assertEquals(sql.store.get("s1").status, "implementing");
  assertEquals(sql.store.get("s1").event_cursor, 4);
  assertEquals(seenUrl.includes("startIndex=2"), true);
});
