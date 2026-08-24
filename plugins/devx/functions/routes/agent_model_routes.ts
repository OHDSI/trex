// @ts-nocheck - Deno edge function
import { getAgentModelSelections, isAgentName, resolveAgentModel, setAgentModelSelection } from "../agent_model_selection.ts";

export async function handleAgentModelRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /agent-model-selection — the three current assignments, for the Settings UI.
  if (path.endsWith("/agent-model-selection") && method === "GET") {
    const selections = await getAgentModelSelections(userId, sql);
    return Response.json(selections, { headers: corsHeaders });
  }

  // PUT /agent-model-selection/:agent — assign a provider config to an agent.
  const putMatch = path.match(/\/agent-model-selection\/([^/]+)$/);
  if (putMatch && method === "PUT") {
    const agent = putMatch[1];
    if (!isAgentName(agent)) {
      return Response.json({ error: `unknown agent "${agent}"` }, { status: 400, headers: corsHeaders });
    }
    const { provider_config_id } = await req.json();
    if (!provider_config_id) {
      return Response.json({ error: "provider_config_id is required" }, { status: 400, headers: corsHeaders });
    }
    try {
      const selection = await setAgentModelSelection(userId, agent, provider_config_id, sql);
      return Response.json(selection, { headers: corsHeaders });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message === "provider config not found" ? 404 : 400;
      return Response.json({ error: message }, { status, headers: corsHeaders });
    }
  }

  // GET /agent-model/:agent — internal: claw/d2esupport resolve their assigned
  // model over the loopback (see Task 4/5's agent-model-override.ts). Never
  // called from the browser Settings UI.
  const getMatch = path.match(/\/agent-model\/([^/]+)$/);
  if (getMatch && method === "GET") {
    const agent = getMatch[1];
    if (!isAgentName(agent)) {
      return Response.json({ error: `unknown agent "${agent}"` }, { status: 400, headers: corsHeaders });
    }
    try {
      const resolved = await resolveAgentModel(agent, userId, sql);
      if (!resolved) return Response.json({ configured: false }, { headers: corsHeaders });
      return Response.json({ configured: true, ...resolved }, { headers: corsHeaders });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}
