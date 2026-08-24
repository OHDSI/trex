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

export async function setAgentModelSelection(
  userId: string,
  agent: AgentName,
  providerConfigId: string,
  sql: SqlFn,
): Promise<AgentModelSelection> {
  const found = await sql(
    `SELECT id, user_id, provider, model, base_url, display_name, api_key, api_key_encrypted, api_key_iv
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
  const result = await sql(
    `SELECT c.provider, c.model, c.base_url, c.api_key, c.api_key_encrypted, c.api_key_iv
     FROM devx.agent_model_selection s JOIN devx.provider_configs c ON c.id = s.provider_config_id
     WHERE s.user_id = $1 AND s.agent = $2`,
    [userId, agent],
  );
  const row = (result.rows as any[])[0];
  if (!row) return null;
  assertProviderAllowedForAgent(row.provider, agent);
  const apiKey = await readProviderKey(row);
  return { provider: row.provider, model: row.model, apiKey, baseUrl: row.base_url ?? null };
}
