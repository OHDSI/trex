import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  getAgentModelSelections,
  resolveAgentModel,
  setAgentModelSelection,
} from "./agent_model_selection.ts";

const USER = "11111111-1111-1111-1111-111111111111";

function makeFakeDb(configs: Record<string, unknown>[], selections: Record<string, unknown>[] = []) {
  const cfgs = configs.map((c) => ({ ...c }));
  const sels = selections.map((s) => ({ ...s }));
  // Normalize whitespace in queries for matching
  const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim();
  const sql = async (q: string, p: unknown[] = []) => {
    const nq = normalizeWs(q);
    if (nq.includes("FROM devx.agent_model_selection s JOIN devx.provider_configs")) {
      // Two distinct real queries share this JOIN: getAgentModelSelections
      // (all agents, `SELECT s.agent, ...`) and resolveAgentModel (one agent,
      // `SELECT c.provider, ...` with `AND s.agent = $2`). Filter by agent
      // FIRST, matching the real WHERE clause, rather than mapping every
      // selection row and hoping the caller only seeded one — a future test
      // seeding two agents for the same user must still get the right row.
      const [uid, maybeAgent] = p;
      const isSingleAgentQuery = q.includes("s.agent = $2");
      const matching = sels.filter(
        (s) => s.user_id === uid && (!isSingleAgentQuery || s.agent === maybeAgent),
      );
      return {
        rows: matching.map((s) => {
          const cfg = cfgs.find((c) => c.id === s.provider_config_id)!;
          // getAgentModelSelections wants display metadata (`SELECT s.agent,
          // ...`); resolveAgentModel wants credential material (`SELECT
          // c.provider, ..., c.api_key, ...`) — same JOIN, different column
          // lists, so branch on which one this call issued.
          return q.includes("SELECT s.agent")
            ? { agent: s.agent, provider_config_id: cfg.id, provider: cfg.provider, model: cfg.model, base_url: cfg.base_url ?? null, display_name: cfg.display_name ?? null }
            : { provider: cfg.provider, model: cfg.model, base_url: cfg.base_url ?? null, api_key: cfg.api_key ?? null, api_key_encrypted: cfg.api_key_encrypted ?? null, api_key_iv: cfg.api_key_iv ?? null };
        }),
      };
    }
    if (nq.includes("SELECT id, user_id, provider, model, base_url, display_name, api_key, api_key_encrypted, api_key_iv FROM devx.provider_configs WHERE id = $1 AND user_id = $2")) {
      const [id, uid] = p;
      const row = cfgs.find((c) => c.id === id && c.user_id === uid);
      return { rows: row ? [row] : [] };
    }
    if (nq.startsWith("INSERT INTO devx.agent_model_selection")) {
      const [uid, agent, pcid] = p;
      const existing = sels.find((s) => s.user_id === uid && s.agent === agent);
      if (existing) existing.provider_config_id = pcid;
      else sels.push({ user_id: uid, agent, provider_config_id: pcid });
      return { rows: [] };
    }
    throw new Error(`unhandled query in fake db: ${q}`);
  };
  return { sql, cfgs, sels };
}

Deno.test("getAgentModelSelections: no rows configured returns null for every agent", async () => {
  const { sql } = makeFakeDb([]);
  const result = await getAgentModelSelections(USER, sql);
  assertEquals(result, { devx: null, claw: null, d2esupport: null });
});

Deno.test("setAgentModelSelection then getAgentModelSelections round-trips", async () => {
  const { sql } = makeFakeDb([
    { id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: "My Anthropic", api_key: "sk-x", api_key_encrypted: null, api_key_iv: null },
  ]);
  await setAgentModelSelection(USER, "claw", "cfg-1", sql);
  const result = await getAgentModelSelections(USER, sql);
  assertEquals(result.claw, { agent: "claw", providerConfigId: "cfg-1", provider: "anthropic", model: "claude-sonnet-5", baseUrl: null, displayName: "My Anthropic" });
  assertEquals(result.devx, null);
});

Deno.test("setAgentModelSelection: rejects claude-code for claw", async () => {
  const { sql } = makeFakeDb([
    { id: "cfg-cc", user_id: USER, provider: "claude-code", model: "sonnet", base_url: null, display_name: null, api_key: null, api_key_encrypted: null, api_key_iv: null },
  ]);
  await assertRejects(
    () => setAgentModelSelection(USER, "claw", "cfg-cc", sql),
    Error,
    "claude-code is only available for devx",
  );
});

Deno.test("setAgentModelSelection: rejects a provider config that does not belong to the user", async () => {
  const { sql } = makeFakeDb([
    { id: "cfg-1", user_id: "someone-else", provider: "anthropic", model: "m", base_url: null, display_name: null, api_key: "sk", api_key_encrypted: null, api_key_iv: null },
  ]);
  await assertRejects(() => setAgentModelSelection(USER, "claw", "cfg-1", sql), Error, "provider config not found");
});

Deno.test("resolveAgentModel: returns null when nothing is assigned", async () => {
  const { sql } = makeFakeDb([]);
  assertEquals(await resolveAgentModel("claw", USER, sql), null);
});

Deno.test("resolveAgentModel: resolves the assigned row's credentials", async () => {
  const { sql } = makeFakeDb(
    [{ id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: null, api_key: "sk-x", api_key_encrypted: null, api_key_iv: null }],
    [{ user_id: USER, agent: "claw", provider_config_id: "cfg-1" }],
  );
  assertEquals(await resolveAgentModel("claw", USER, sql), { provider: "anthropic", model: "claude-sonnet-5", apiKey: "sk-x", baseUrl: null });
});
