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
    if (nq.includes("SELECT id, user_id, provider, model, base_url, display_name, api_key, api_key_encrypted, api_key_iv FROM devx.provider_configs")) {
      const [id, uid] = p;
      const row = cfgs.find((c) => c.id === id && c.user_id === uid);
      return { rows: row ? [row] : [] };
    }
    if (q.startsWith("INSERT INTO devx.agent_model_selection")) {
      const [uid, agent, pcid] = p;
      const existing = sels.find((s) => s.user_id === uid && s.agent === agent);
      if (existing) existing.provider_config_id = pcid;
      else sels.push({ user_id: uid, agent, provider_config_id: pcid });
      return { rows: [] };
    }
    throw new Error(`unhandled query: ${q}`);
  };
  return sql;
}

Deno.test("GET /agent-model-selection: nothing assigned returns nulls", async () => {
  const sql = makeFakeDb([]);
  const res = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection", "GET", req("http://x/agent-model-selection", "GET"), USER, sql, CORS);
  assertEquals(await res!.json(), { devx: null, claw: null, d2esupport: null });
});

Deno.test("PUT /agent-model-selection/claw: assigns a config, rejects claude-code, rejects unknown agent", async () => {
  const sql = makeFakeDb([
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

Deno.test("GET /agent-model/:agent: unconfigured reports configured:false, assigned reports the spec", async () => {
  const sql = makeFakeDb([
    { id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: null, api_key: "sk-x" },
  ]);
  const unconfigured = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model/claw", "GET", req("http://x/agent-model/claw", "GET"), USER, sql, CORS);
  assertEquals(await unconfigured!.json(), { configured: false });

  await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model-selection/claw", "PUT", req("http://x/agent-model-selection/claw", "PUT", { provider_config_id: "cfg-1" }), USER, sql, CORS);

  const configured = await handleAgentModelRoutes("/plugins/trex/devx-api/agent-model/claw", "GET", req("http://x/agent-model/claw", "GET"), USER, sql, CORS);
  assertEquals(await configured!.json(), { configured: true, provider: "anthropic", model: "claude-sonnet-5", apiKey: "sk-x", baseUrl: null });
});

Deno.test("a non-matching path returns null so the dispatch chain falls through", async () => {
  const sql = makeFakeDb([]);
  const res = await handleAgentModelRoutes("/plugins/trex/devx-api/some-other-route", "GET", req("http://x/some-other-route", "GET"), USER, sql, CORS);
  assertEquals(res, null);
});
