// @ts-nocheck - Deno edge function
import {
  clearAgentModelSelection,
  getAgentModelSelections,
  isAgentName,
  resolveAgentModel,
  setAgentModelSelection,
} from "../agent_model_selection.ts";

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

  // DELETE /agent-model-selection/:agent — revert an agent to the legacy
  // env-based fallback (agent-model-override.ts in claw/d2esupport). devx has
  // no "unset" concept — it always has an active provider_configs row via the
  // AI Providers activate action — so clearing it here is rejected.
  const deleteMatch = path.match(/\/agent-model-selection\/([^/]+)$/);
  if (deleteMatch && method === "DELETE") {
    const agent = deleteMatch[1];
    if (!isAgentName(agent)) {
      return Response.json({ error: `unknown agent "${agent}"` }, { status: 400, headers: corsHeaders });
    }
    if (agent === "devx") {
      return Response.json(
        { error: "devx always has an active provider — use the AI Providers activate action instead" },
        { status: 400, headers: corsHeaders },
      );
    }
    await clearAgentModelSelection(userId, agent, sql);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  // GET /agent-model/:agent — internal: claw/d2esupport resolve their assigned
  // model over the loopback (see Task 4/5's agent-model-override.ts). Never
  // called from the browser Settings UI.
  const getMatch = path.match(/\/agent-model\/([^/]+)$/);
  if (getMatch && method === "GET") {
    const agent = getMatch[1];
    // This route is the only one in this plugin that returns a decrypted
    // api_key in a response body — every other route masks it. That's
    // intentional: claw/d2esupport need the real key to run their turn, and
    // this is an internal loopback call over the plugin's own auth (never
    // reachable from the browser Settings UI, which only ever calls
    // GET/PUT/DELETE /agent-model-selection above). Do not relax this to
    // allow browser callers. Cache-Control: no-store keeps the key out of any
    // intermediate cache on both the success and error paths.
    const noStoreHeaders = { ...corsHeaders, "Cache-Control": "no-store" };
    if (!isAgentName(agent)) {
      return Response.json({ error: `unknown agent "${agent}"` }, { status: 400, headers: noStoreHeaders });
    }
    try {
      const resolved = await resolveAgentModel(agent, userId, sql);
      if (!resolved) return Response.json({ configured: false }, { headers: noStoreHeaders });
      return Response.json({ configured: true, ...resolved }, { headers: noStoreHeaders });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: message }, { status: 500, headers: noStoreHeaders });
    }
  }

  return null;
}
