import { assertEquals, assertRejects } from "jsr:@std/assert";
import {
  activateDevxProviderConfig,
  clearAgentModelSelection,
  getAgentModelSelections,
  resolveAgentModel,
  setAgentModelSelection,
} from "./agent_model_selection.ts";

const USER = "11111111-1111-1111-1111-111111111111";

function makeFakeDb(
  configs: Record<string, unknown>[],
  selections: Record<string, unknown>[] = [],
  settings: Record<string, unknown>[] = [],
) {
  const cfgs = configs.map((c) => ({ ...c }));
  const sels = selections.map((s) => ({ ...s }));
  const settingsRows = settings.map((s) => ({ ...s }));
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
    // setAgentModelSelection's ownership-check SELECT (non-devx path) — only
    // the columns it actually uses (no key material).
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
    if (nq.startsWith("INSERT INTO devx.agent_model_selection")) {
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
    if (nq.startsWith("DELETE FROM devx.agent_model_selection WHERE user_id = $1 AND agent = $2")) {
      const [uid, agent] = p;
      const idx = sels.findIndex((s) => s.user_id === uid && s.agent === agent);
      if (idx >= 0) sels.splice(idx, 1);
      return { rows: [] };
    }
    throw new Error(`unhandled query in fake db: ${q}`);
  };
  return { sql, cfgs, sels, settingsRows };
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

// CRITICAL 2: an unapplied migration (missing table/column) means "we don't
// know if anything is configured", not "something is configured but
// broken" — resolveAgentModel must fall back (return null), not reject the
// whole turn, when the SELECT itself throws.
Deno.test("resolveAgentModel: a lookup failure (simulated missing table) returns null instead of rejecting", async () => {
  const throwingSql = async () => {
    throw new Error('relation "devx.agent_model_selection" does not exist');
  };
  const result = await resolveAgentModel("claw", USER, throwingSql);
  assertEquals(result, null);
});

// The gate/decrypt failures below still must propagate — only the lookup
// SELECT itself is caught.
Deno.test("resolveAgentModel: a gate rejection after finding a row still throws", async () => {
  const { sql } = makeFakeDb(
    [{ id: "cfg-cc", user_id: USER, provider: "claude-code", model: "sonnet", base_url: null, display_name: null, api_key: null, api_key_encrypted: null, api_key_iv: null }],
    [{ user_id: USER, agent: "claw", provider_config_id: "cfg-cc" }],
  );
  await assertRejects(() => resolveAgentModel("claw", USER, sql), Error, "claude-code is only available for devx");
});

// IMPORTANT 3: activateDevxProviderConfig is the one function that keeps
// provider_configs.is_active/devx.settings and agent_model_selection
// (agent='devx') in sync — both the legacy activate route and
// setAgentModelSelection('devx', ...) go through it.
Deno.test("activateDevxProviderConfig: flips is_active, mirrors devx.settings, and upserts agent_model_selection", async () => {
  const { sql, cfgs, sels, settingsRows } = makeFakeDb([
    { id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: null, api_key: "sk-x", api_key_encrypted: null, api_key_iv: null, is_active: true },
    { id: "cfg-2", user_id: USER, provider: "openai", model: "gpt-5", base_url: null, display_name: null, api_key: "sk-y", api_key_encrypted: null, api_key_iv: null, is_active: false },
  ], [], [{ user_id: USER, provider: "anthropic", model: "claude-sonnet-5" }]);

  const result = await activateDevxProviderConfig(USER, "cfg-2", sql);
  assertEquals(result, { id: "cfg-2", provider: "openai", model: "gpt-5" });
  assertEquals(cfgs.find((c) => c.id === "cfg-1")!.is_active, false);
  assertEquals(cfgs.find((c) => c.id === "cfg-2")!.is_active, true);
  assertEquals(settingsRows[0], { user_id: USER, provider: "openai", model: "gpt-5" });
  assertEquals(sels, [{ user_id: USER, agent: "devx", provider_config_id: "cfg-2" }]);
});

Deno.test("activateDevxProviderConfig: rejects a config that does not belong to the user", async () => {
  const { sql } = makeFakeDb([
    { id: "cfg-1", user_id: "someone-else", provider: "anthropic", model: "m", base_url: null, display_name: null, api_key: null, api_key_encrypted: null, api_key_iv: null },
  ]);
  await assertRejects(() => activateDevxProviderConfig(USER, "cfg-1", sql), Error, "provider config not found");
});

Deno.test("setAgentModelSelection('devx', ...): also flips is_active and mirrors devx.settings (routes through activateDevxProviderConfig)", async () => {
  const { sql, cfgs, sels, settingsRows } = makeFakeDb([
    { id: "cfg-1", user_id: USER, provider: "anthropic", model: "claude-sonnet-5", base_url: null, display_name: null, api_key: "sk-x", api_key_encrypted: null, api_key_iv: null, is_active: true },
    { id: "cfg-2", user_id: USER, provider: "google", model: "gemini-2.5-pro", base_url: null, display_name: null, api_key: "sk-y", api_key_encrypted: null, api_key_iv: null, is_active: false },
  ], [], [{ user_id: USER, provider: "anthropic", model: "claude-sonnet-5" }]);

  const selection = await setAgentModelSelection(USER, "devx", "cfg-2", sql);
  assertEquals(selection.provider, "google");
  assertEquals(selection.model, "gemini-2.5-pro");
  assertEquals(cfgs.find((c) => c.id === "cfg-2")!.is_active, true);
  assertEquals(cfgs.find((c) => c.id === "cfg-1")!.is_active, false);
  assertEquals(settingsRows[0].provider, "google");
  assertEquals(sels, [{ user_id: USER, agent: "devx", provider_config_id: "cfg-2" }]);
});

// IMPORTANT 4: claw/d2esupport can be reverted to the env-based fallback;
// devx cannot (the route layer rejects that before this is ever called, so
// this module-level function is deliberately unconditional).
Deno.test("clearAgentModelSelection: removes the row for the given agent only", async () => {
  const { sql, sels } = makeFakeDb(
    [{ id: "cfg-1", user_id: USER, provider: "anthropic", model: "m", base_url: null, display_name: null, api_key: null, api_key_encrypted: null, api_key_iv: null }],
    [
      { user_id: USER, agent: "claw", provider_config_id: "cfg-1" },
      { user_id: USER, agent: "d2esupport", provider_config_id: "cfg-1" },
    ],
  );
  await clearAgentModelSelection(USER, "claw", sql);
  assertEquals(sels, [{ user_id: USER, agent: "d2esupport", provider_config_id: "cfg-1" }]);
});
