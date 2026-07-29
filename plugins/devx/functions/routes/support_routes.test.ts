import { assertEquals } from "jsr:@std/assert";
import { handleSupportRoutes } from "./support_routes.ts";

const CORS = { "content-type": "application/json" };

function stubSql(rowsByMatch: Array<{ match: RegExp; rows: unknown[] }>) {
  const calls: Array<{ q: string; p: unknown[] }> = [];
  const sql = async (q: string, p: unknown[] = []) => {
    calls.push({ q, p });
    const hit = rowsByMatch.find((r) => r.match.test(q));
    return { rows: hit?.rows ?? [] };
  };
  return { sql, calls };
}

const req = (body?: unknown) =>
  new Request("http://x/support", body ? { method: "POST", body: JSON.stringify(body) } : {});

const patchReq = (body: unknown) =>
  new Request("http://x/support", { method: "PATCH", body: JSON.stringify(body) });

// Mirrors index.ts: the dispatcher passes url.pathname as `path`, while `req`
// carries the real URL (with query string) that handlers must read params from.
const reqWithUrl = (url: string) => new Request(url);

Deno.test("GET /support/user-map lists mappings", async () => {
  const { sql } = stubSql([{ match: /FROM devx\.user_map/, rows: [{ id: "1", github_login: "alice", discord_user_id: "D1" }] }]);
  const res = await handleSupportRoutes("/x/support/user-map", "GET", req(), "u1", sql, CORS);
  assertEquals(res!.status, 200);
  assertEquals((await res!.json())[0].github_login, "alice");
});

Deno.test("POST /support/user-map validates required fields", async () => {
  const { sql } = stubSql([]);
  const res = await handleSupportRoutes("/x/support/user-map", "POST", req({ github_login: "" }), "u1", sql, CORS);
  assertEquals(res!.status, 400);
});

Deno.test("PATCH /support/user-map/:id rejects an empty github_login", async () => {
  const { sql } = stubSql([]);
  const res = await handleSupportRoutes("/x/support/user-map/1", "PATCH", patchReq({ github_login: "   " }), "u1", sql, CORS);
  assertEquals(res!.status, 400);
});

Deno.test("PATCH /support/user-map/:id rejects an empty discord_user_id", async () => {
  const { sql } = stubSql([]);
  const res = await handleSupportRoutes("/x/support/user-map/1", "PATCH", patchReq({ discord_user_id: "" }), "u1", sql, CORS);
  assertEquals(res!.status, 400);
});

Deno.test("PATCH /support/user-map/:id trims string fields before writing", async () => {
  const { sql, calls } = stubSql([{ match: /UPDATE devx\.user_map/, rows: [{ id: "1", github_login: "alice", discord_user_id: "D1", display_name: "Alice" }] }]);
  const res = await handleSupportRoutes(
    "/x/support/user-map/1",
    "PATCH",
    patchReq({ github_login: "  alice  ", discord_user_id: " D1 ", display_name: "  Alice  " }),
    "u1",
    sql,
    CORS,
  );
  assertEquals(res!.status, 200);
  const update = calls.find((c) => c.q.includes("UPDATE devx.user_map"));
  assertEquals(update?.p.slice(0, 3), ["alice", "D1", "Alice"]);
});

Deno.test("GET /support/discord-ids maps logins and reports unmapped", async () => {
  const { sql } = stubSql([{
    match: /FROM devx\.user_map WHERE github_login = ANY/,
    rows: [{ github_login: "alice", discord_user_id: "D1" }],
  }]);
  const res = await handleSupportRoutes(
    "/x/support/discord-ids",
    "GET",
    reqWithUrl("http://x/support/discord-ids?logins=alice,bob"),
    "u1",
    sql,
    CORS,
  );
  const j = await res!.json();
  assertEquals(j.mappings, { alice: "D1" });
  assertEquals(j.unmapped, ["bob"]);
});

Deno.test("GET /support/slack-allowlist/check: allowed only when present", async () => {
  const present = stubSql([{ match: /FROM devx\.slack_allowlist WHERE slack_user_id/, rows: [{ id: "1" }] }]);
  const absent = stubSql([]);
  const r1 = await handleSupportRoutes(
    "/x/support/slack-allowlist/check",
    "GET",
    reqWithUrl("http://x/support/slack-allowlist/check?user=U1"),
    "u1",
    present.sql,
    CORS,
  );
  const r2 = await handleSupportRoutes(
    "/x/support/slack-allowlist/check",
    "GET",
    reqWithUrl("http://x/support/slack-allowlist/check?user=U2"),
    "u1",
    absent.sql,
    CORS,
  );
  assertEquals((await r1!.json()).allowed, true);
  assertEquals((await r2!.json()).allowed, false);
});

Deno.test("unmatched path falls through with null", async () => {
  const { sql } = stubSql([]);
  const res = await handleSupportRoutes("/x/chats", "GET", req(), "u1", sql, CORS);
  assertEquals(res, null);
});
