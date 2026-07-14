// plugins/claw/agent/tools/shipIt.test.ts
import { assertEquals } from "jsr:@std/assert";
import { shipCore } from "./shipIt.ts";
import type { TokioClient } from "../lib/code-session.ts";

function ndjson(...e: unknown[]) { return new Response(e.map((x) => JSON.stringify(x)).join("\n") + "\n"); }

Deno.test("shipCore issues a commit/push build turn and marks done", async () => {
  const store = new Map<string, any>([["s1", { session_id: "s1", code_session_id: "c1", plan: "P", status: "awaiting_ship", event_cursor: 4 }]]);
  const sql = (sqlText: string, params: unknown[] = []) => {
    if (sqlText.startsWith("SELECT")) { const r = store.get(String(params[0])); return Promise.resolve({ rows: r ? [r] : [] }); }
    store.set(String(params[0]), { session_id: params[0], code_session_id: params[1], plan: params[2], status: params[3], event_cursor: params[4] });
    return Promise.resolve({ rows: [] });
  };
  const client: TokioClient = {
    req(url) {
      if (url.includes("/stream")) return Promise.resolve(ndjson({ type: "message.completed", data: { text: "pushed abc123" } }, { type: "session.waiting", data: {} }));
      return Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    },
  };
  const out = await shipCore(client, sql, { sessionId: "s1", userId: "u1" }, { summary: "ship it" });
  assertEquals(out.reply, "pushed abc123");
  assertEquals(store.get("s1").status, "done");
});
