// plugins/claw/agent/tools/shipIt.test.ts
import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
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
  const requests: Array<{ url: string; init: { method: string; headers?: Record<string, string>; body?: string } }> = [];
  const client: TokioClient = {
    req(url, init) {
      requests.push({ url, init });
      if (url.includes("/stream")) return Promise.resolve(ndjson({ type: "message.completed", data: { text: "pushed abc123" } }, { type: "session.waiting", data: {} }));
      return Promise.resolve(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
    },
  };
  const out = await shipCore(client, sql, { sessionId: "s1", userId: "u1" }, { summary: "ship it" });
  assertEquals(out.reply, "pushed abc123");
  assertEquals(store.get("s1").status, "done");

  // The first non-stream request is the create/continue POST that starts the
  // build-mode commit/push turn. Verify its body, not just the threaded reply.
  const postReq = requests.find((r) => !r.url.includes("/stream"));
  if (!postReq) throw new Error("expected a create/continue POST request to be recorded");
  assertEquals(postReq.init.method, "POST");
  const body = JSON.parse(postReq.init.body ?? "{}");
  assertEquals(body.metadata?.mode, "build");
  assertStringIncludes(body.message, "Commit the approved changes and push");
});

Deno.test("shipCore throws when there is no Code session (missing row)", async () => {
  const store = new Map<string, any>(); // no row for "s1"
  const sql = (_sqlText: string, _params: unknown[] = []) => Promise.resolve({ rows: [] });
  const client: TokioClient = {
    req() { throw new Error("client.req should not be called when there is no Code session"); },
  };
  await assertRejects(
    () => shipCore(client, sql, { sessionId: "s1", userId: "u1" }, { summary: "ship it" }),
    Error,
    "no Code session",
  );
  void store;
});

Deno.test("shipCore throws when the stored row has a null code_session_id", async () => {
  const store = new Map<string, any>([["s1", { session_id: "s1", code_session_id: null, plan: "P", status: "awaiting_ship", event_cursor: 4 }]]);
  const sql = (sqlText: string, params: unknown[] = []) => {
    if (sqlText.startsWith("SELECT")) { const r = store.get(String(params[0])); return Promise.resolve({ rows: r ? [r] : [] }); }
    return Promise.resolve({ rows: [] });
  };
  const client: TokioClient = {
    req() { throw new Error("client.req should not be called when there is no Code session"); },
  };
  await assertRejects(
    () => shipCore(client, sql, { sessionId: "s1", userId: "u1" }, { summary: "ship it" }),
    Error,
    "no Code session",
  );
});
