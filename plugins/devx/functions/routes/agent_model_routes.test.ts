import { assertEquals } from "jsr:@std/assert";
import { handleAgentModelRoutes } from "./agent_model_routes.ts";

const CORS = { "content-type": "application/json" };
const USER = "11111111-1111-1111-1111-111111111111";

function req(url: string, method: string, body?: unknown) {
  return new Request(url, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

function makeFakeDb(configs: Record<string, unknown>[]) {
  const cfgs = configs.map((c) => ({ ...c }));
  const sels: Record<string, unknown>[] = [];
  const settingsRows: Record<string, unknown>[] = [];
  // Real queries are multi-line template literals; match on whitespace-
  // collapsed text so a substring check doesn't silently miss because the
  // real query wraps where this fake's match string doesn't (this bit
  // agent_model_selection.test.ts's fake during Task 2 — same fix, applied
  // consistently to every check here including the inner ones Task 2's
  // fake left raw).
  const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim();
  const sql = async (q: string, p: unknown[] = []) => {
    const nq = normalizeWs(q);
    if (nq.includes("FROM devx.agent_model_selection s JOIN devx.provider_configs")) {
      // Same two-shapes-one-JOIN split as agent_model_selection.test.ts's
      // fake — filter by agent first (when the query carries `s.agent = $2`),
      // then pick the row shape the matched query actually selects.
      const [uid, maybeAgent] = p;
      const isSingleAgentQuery = nq.includes("s.agent = $2");
      const matching = sels.filter(
        (s) => s.user_id === uid && (!isSingleAgentQuery || s.agent === maybeAgent),
      );
      return {
        rows: matching.map((s) => {
          const cfg = cfgs.find((c) => c.id === s.provider_config_id)!;
          return nq.includes("SELECT s.agent")
            ? { agent: s.agent, provider_config_id: cfg.id, provider: cfg.provider, model: cfg.model, base_url: cfg.base_url ?? null, display_name: cfg.display_name ?? null }
            : { provider: cfg.provider, model: cfg.model, base_url: cfg.base_url ?? null, api_key: cfg.api_key ?? null, api_key_encrypted: null, api_key_iv: null };
        }),
      };
    }
    // setAgentModelSelection's ownership-check SELECT (non-devx path).
    if (nq.includes("SELECT id, user_id, provider, model, base_url, display_name FROM devx.provider_configs WHERE id = $1 AND user_id = $2")) {
      const [id, uid] = p;
      const row = cfgs.find((c) => c.id === id && c.user_id === uid);
      return { rows: row ? [row] : [] };
    }
    // activateDevxProviderConfig's ownership-check SELECT (devx path).
    if (nq.includes("SELECT id, provider, model FROM devx.provider_configs WHERE id = $1 AND user_id = $2")) {
      const [id, uid] = p;
      const row = cfgs.find((c) => c.id === id && c.user_id === uid);
      return { rows: row ? [row] : [] };
    }
    if (nq.includes("UPDATE devx.provider_configs SET is_active = false WHERE user_id = $1")) {
      const [uid] = p;
      cfgs.forEach((c) => { if (c.user_id === uid) c.is_active = false; });
      return { rows: [] };
    }
    if (nq.includes("UPDATE devx.provider_configs SET is_active = true, updated_at = NOW() WHERE id = $1 AND user_id = $2")) {
      const [id, uid] = p;
      const row = cfgs.find((c) => c.id === id && c.user_id === uid);
      if (row) row.is_active = true;
      return { rows: [] };
    }
    if (nq.includes("UPDATE devx.settings SET provider = $1, model = $2, updated_at = NOW() WHERE user_id = $3")) {
      const [provider, model, uid] = p;
      let row = settingsRows.find((s) => s.user_id === uid);
      if (!row) { row = { user_id: uid }; settingsRows.push(row); }
      row.provider = provider;
      row.model = model;
      return { rows: [] };
    }
    if (q.startsWith("INSERT INTO devx.agent_model_selection")) {
      // activateDevxProviderConfig's INSERT hardcodes agent='devx' as a SQL
      // literal (not a bound param), so it carries only 2 params
      // ([userId, providerConfigId]); the generic upsert in
      // setAgentModelSelection binds agent as $2, carrying 3.
      const isDevxLiteral = nq.includes("'devx'");
      const [uid, agent, pcid] = isDevxLiteral ? [p[0], "devx", p[1]] : p;
      const existing = sels.find((s) => s.user_id === uid && s.agent === agent);
      if (existing) existing.provider_config_id = pcid;
      else sels.push({ user_id: uid, agent, provider_config_id: pcid });
      return { rows: [] };
    }
    if (q.startsWith("DELETE FROM devx.agent_model_selection")) {
      const [uid, agent] = p;
      const idx = sels.findIndex((s) => s.user_id === uid && s.agent === agent);
      if (idx >= 0) sels.splice(idx, 1);
      return { rows: [] };
    }
    throw new Error(`unhandled query: ${q}`);
  };
  return { sql, cfgs, sels, settingsRows };
}

Deno.test("GET /agent-model-selection: nothing assigned returns nulls", async () => {
  const { sql } = makeFakeDb([]);
  const res = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection", "GET", req("http://x/agent-model-selection", "GET"), USER, sql, CORS);
  assertEquals(await res!.json(), { devx: null, claw: null, d2esupport: null });
});

Deno.test("PUT /agent-model-selection/claw: assigns a config, rejects claude-code, rejects unknown agent", async () => {
  const { sql } = makeFakeDb([
    { id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: null, api_key: "sk-x" },
    { id: "cfg-cc", user_id: USER, provider: "claude-code", model: "sonnet", base_url: null, display_name: null, api_key: null },
  ]);
  const ok = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/claw", "PUT", req("http://x/agent-model-selection/claw", "PUT", { provider_config_id: "cfg-1" }), USER, sql, CORS);
  assertEquals(ok!.status, 200);
  assertEquals((await ok!.json()).provider, "anthropic");

  const rejected = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/claw", "PUT", req("http://x/agent-model-selection/claw", "PUT", { provider_config_id: "cfg-cc" }), USER, sql, CORS);
  assertEquals(rejected!.status, 400);

  const unknownAgent = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/not-a-real-agent", "PUT", req("http://x/agent-model-selection/not-a-real-agent", "PUT", { provider_config_id: "cfg-1" }), USER, sql, CORS);
  assertEquals(unknownAgent!.status, 400);
});

// IMPORTANT 3: setting agent='devx' via this route also flips is_active and
// mirrors devx.settings (routes through activateDevxProviderConfig), so the
// new UI's devx row actually changes what devx's own coder resolution reads.
Deno.test("PUT /agent-model-selection/devx: also flips provider_configs.is_active and mirrors devx.settings", async () => {
  const { sql, cfgs, settingsRows } = makeFakeDb([
    { id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: null, api_key: "sk-x", is_active: true },
    { id: "cfg-2", user_id: USER, provider: "claude-code", model: "sonnet", base_url: null, display_name: null, api_key: null, is_active: false },
  ]);
  const res = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/devx", "PUT", req("http://x/agent-model-selection/devx", "PUT", { provider_config_id: "cfg-2" }), USER, sql, CORS);
  assertEquals(res!.status, 200);
  const body = await res!.json();
  assertEquals(body.provider, "claude-code");
  assertEquals(cfgs.find((c) => c.id === "cfg-2")!.is_active, true);
  assertEquals(cfgs.find((c) => c.id === "cfg-1")!.is_active, false);
  assertEquals(settingsRows[0], { user_id: USER, provider: "claude-code", model: "sonnet" });
});

Deno.test("DELETE /agent-model-selection/:agent: clears claw/d2esupport, rejects devx and unknown agents", async () => {
  const { sql, sels } = makeFakeDb([
    { id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: null, api_key: "sk-x" },
  ]);
  await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/claw", "PUT", req("http://x/agent-model-selection/claw", "PUT", { provider_config_id: "cfg-1" }), USER, sql, CORS);
  assertEquals(sels.length, 1);

  const cleared = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/claw", "DELETE", req("http://x/agent-model-selection/claw", "DELETE"), USER, sql, CORS);
  assertEquals(cleared!.status, 200);
  assertEquals(await cleared!.json(), { ok: true });
  assertEquals(sels.length, 0);

  const devxRejected = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/devx", "DELETE", req("http://x/agent-model-selection/devx", "DELETE"), USER, sql, CORS);
  assertEquals(devxRejected!.status, 400);

  const unknownRejected = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/not-a-real-agent", "DELETE", req("http://x/agent-model-selection/not-a-real-agent", "DELETE"), USER, sql, CORS);
  assertEquals(unknownRejected!.status, 400);
});

Deno.test("GET /agent-model/:agent: unconfigured reports configured:false, assigned reports the spec", async () => {
  const { sql } = makeFakeDb([
    { id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: null, api_key: "sk-x" },
  ]);
  const unconfigured = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model/claw", "GET", req("http://x/agent-model/claw", "GET"), USER, sql, CORS);
  assertEquals(await unconfigured!.json(), { configured: false });
  assertEquals(unconfigured!.headers.get("Cache-Control"), "no-store");

  await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/claw", "PUT", req("http://x/agent-model-selection/claw", "PUT", { provider_config_id: "cfg-1" }), USER, sql, CORS);

  const configured = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model/claw", "GET", req("http://x/agent-model/claw", "GET"), USER, sql, CORS);
  assertEquals(await configured!.json(), { configured: true, provider: "anthropic", model: "claude-sonnet-5", apiKey: "sk-x", baseUrl: null });
  assertEquals(configured!.headers.get("Cache-Control"), "no-store");
});

Deno.test("a non-matching path returns null so the dispatch chain falls through", async () => {
  const { sql } = makeFakeDb([]);
  const res = await handleAgentModelRoutes("/plugins/trex/devx-api/some-other-route", "GET", req("http://x/some-other-route", "GET"), USER, sql, CORS);
  assertEquals(res, null);
});
