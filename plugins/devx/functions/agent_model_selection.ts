// @ts-nocheck - Deno edge function
// Which devx.provider_configs row each LLM-backed agent (devx's own coder,
// claw, d2esupport) is assigned to. See migrations/V17__agent_model_selection.sql.
import { AGENT_NAMES, assertProviderAllowedForAgent, type AgentName } from "./provider_support.ts";
import { readProviderKey } from "./provider_key.ts";

type SqlFn = (query: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;

export function isAgentName(v: string): v is AgentName {
  return (AGENT_NAMES as readonly string[]).includes(v);
}

export interface AgentModelSelection {
  agent: AgentName;
  providerConfigId: string;
  provider: string;
  model: string;
  baseUrl: string | null;
  displayName: string | null;
}

export async function getAgentModelSelections(
  userId: string,
  sql: SqlFn,
): Promise<Record<AgentName, AgentModelSelection | null>> {
  const result = await sql(
    `SELECT s.agent, s.provider_config_id, c.provider, c.model, c.base_url, c.display_name
     FROM devx.agent_model_selection s JOIN devx.provider_configs c ON c.id = s.provider_config_id
     WHERE s.user_id = $1`,
    [userId],
  );
  const out: Record<AgentName, AgentModelSelection | null> = { devx: null, claw: null, d2esupport: null };
  for (const row of result.rows as any[]) {
    out[row.agent as AgentName] = {
      agent: row.agent,
      providerConfigId: row.provider_config_id,
      provider: row.provider,
      model: row.model,
      baseUrl: row.base_url ?? null,
      displayName: row.display_name ?? null,
    };
  }
  return out;
}

// The one function that keeps devx's own selection surface — provider_configs
// .is_active / devx.settings — and the unified agent_model_selection table's
// agent='devx' row in sync. Both the legacy "AI Providers" activate route and
// this task's PUT /agent-model-selection/devx call this, so there is exactly
// one place that can make them drift.
export async function activateDevxProviderConfig(
  userId: string,
  providerConfigId: string,
  sql: SqlFn,
): Promise<{ id: string; provider: string; model: string }> {
  const found = await sql(
    `SELECT id, provider, model FROM devx.provider_configs WHERE id = $1 AND user_id = $2`,
    [providerConfigId, userId],
  );
  const row = (found.rows as any[])[0];
  if (!row) throw new Error("provider config not found");

  await sql(`UPDATE devx.provider_configs SET is_active = false WHERE user_id = $1`, [userId]);
  await sql(
    `UPDATE devx.provider_configs SET is_active = true, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
    [providerConfigId, userId],
  );
  await sql(
    `UPDATE devx.settings SET provider = $1, model = $2, updated_at = NOW() WHERE user_id = $3`,
    [row.provider, row.model, userId],
  );
  await sql(
    `INSERT INTO devx.agent_model_selection (user_id, agent, provider_config_id)
     VALUES ($1, 'devx', $2)
     ON CONFLICT (user_id, agent) DO UPDATE SET provider_config_id = $2, updated_at = NOW()`,
    [userId, providerConfigId],
  );

  return { id: row.id, provider: row.provider, model: row.model };
}

export async function setAgentModelSelection(
  userId: string,
  agent: AgentName,
  providerConfigId: string,
  sql: SqlFn,
): Promise<AgentModelSelection> {
  // devx's own selection surface is provider_configs.is_active / devx.settings
  // (see activateDevxProviderConfig's header comment) — route through the one
  // shared function rather than duplicating the ownership check + upsert here,
  // so this table and that surface can never drift apart.
  if (agent === "devx") {
    const activated = await activateDevxProviderConfig(userId, providerConfigId, sql);
    return {
      agent,
      providerConfigId,
      provider: activated.provider,
      model: activated.model,
      baseUrl: null,
      displayName: null,
    };
  }

  const found = await sql(
    `SELECT id, user_id, provider, model, base_url, display_name
     FROM devx.provider_configs WHERE id = $1 AND user_id = $2`,
    [providerConfigId, userId],
  );
  const row = (found.rows as any[])[0];
  if (!row) throw new Error("provider config not found");
  assertProviderAllowedForAgent(row.provider, agent);

  await sql(
    `INSERT INTO devx.agent_model_selection (user_id, agent, provider_config_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, agent) DO UPDATE SET provider_config_id = $3, updated_at = NOW()`,
    [userId, agent, providerConfigId],
  );

  return {
    agent,
    providerConfigId,
    provider: row.provider,
    model: row.model,
    baseUrl: row.base_url ?? null,
    displayName: row.display_name ?? null,
  };
}

export async function resolveAgentModel(
  agent: AgentName,
  userId: string,
  sql: SqlFn,
): Promise<{ provider: string; model: string; apiKey: string | null; baseUrl: string | null } | null> {
  let result;
  try {
    result = await sql(
      `SELECT c.provider, c.model, c.base_url, c.api_key, c.api_key_encrypted, c.api_key_iv
       FROM devx.agent_model_selection s JOIN devx.provider_configs c ON c.id = s.provider_config_id
       WHERE s.user_id = $1 AND s.agent = $2`,
      [userId, agent],
    );
  } catch (err) {
    // Table/column missing (unapplied migration) is a "we don't know if
    // anything is configured" state, not a "something is configured but
    // broken" state — fall back to env rather than hard-failing the turn.
    // Logged so the real cause (a migration that never applied) is still
    // diagnosable server-side.
    console.error(`[agent_model_selection] resolveAgentModel(${agent}) lookup failed:`, err instanceof Error ? err.message : err);
    return null;
  }
  const row = (result.rows as any[])[0];
  if (!row) return null;
  assertProviderAllowedForAgent(row.provider, agent); // real failure — must propagate, do NOT wrap this in the try above
  const apiKey = await readProviderKey(row); // real failure — must propagate
  return { provider: row.provider, model: row.model, apiKey, baseUrl: row.base_url ?? null };
}

// Removes an agent's assignment, reverting it to the legacy env-based
// fallback (agent-model-override.ts in claw/d2esupport). devx has no "unset"
// concept — it always has an active provider_configs row — so this
// intentionally does not touch provider_configs.is_active/devx.settings;
// the route layer rejects clearing agent='devx' before this is ever called.
export async function clearAgentModelSelection(
  userId: string,
  agent: AgentName,
  sql: SqlFn,
): Promise<void> {
  await sql(`DELETE FROM devx.agent_model_selection WHERE user_id = $1 AND agent = $2`, [userId, agent]);
}
