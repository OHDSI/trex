// task-u1: pure routing decision for useEffectiveLoop.ts, factored out so the
// Deno suite (plugins/devx/agent/lib/effective_loop.test.ts) can pin it with
// characterization tests ahead of V17__loop_default_agents.sql flipping the
// devx.settings.loop default to 'agents'. This file must stay dependency-free
// (no React, no "@/..." aliases) so both the Vite frontend build and Deno can
// import it directly.
//
// WHY claude-code is forced to legacy regardless of the loop flag: the
// claude-code provider is the sidecar, a separate execution engine, not a
// model provider — plugins/devx/agent/agent.ts's resolveModel throws for it
// ("sidecar providers use the legacy endpoint"), and /chat has no try/catch
// around that setup-phase call, so an uncaught throw there surfaces as a
// bare, unparseable 500 (confirmed against
// core/server/agents/service/handler.ts's /chat route) — not something a
// frontend can gracefully detect and fall back from.
//
// IAM-shaped bedrock credentials are NOT routed here: that configuration is
// simply unsupported (the owner decided not to implement IAM/SigV4 auth on
// the agents loop) rather than something this client-side router steers
// around. A user on bedrock with IAM-shaped credentials resolves to
// "agents" like any other provider and hits agent.ts's resolveModel throw,
// which tells them to switch to a bearer token.
export type EffectiveLoop = "legacy" | "agents";

// Sentinel useEffectiveLoop.ts's `.catch` sets when settings/provider could
// NOT be read at all. This is a browser-side routing decision made before
// any turn exists, not a turn to fail — and there is no safe loop to guess:
// silently degrading to "legacy" used to work only because legacy accepted
// every provider, a property Phase 4 removes. Deliberately NOT an
// EffectiveLoop value, so it can't be mistaken for a resolved routing
// decision; the UI renders it as a retryable error instead.
export const SETTINGS_FETCH_FAILED = "settings-fetch-failed" as const;

export interface ResolveEffectiveLoopInput {
  // devx.settings.loop, as returned by GET /settings. ABSENT (null/undefined/
  // empty — the user has no devx.settings row at all, which
  // provider_config_routes.ts allows: a user can be fully configured through
  // devx.provider_configs alone) resolves to "agents", matching the column
  // default V17__loop_default_agents.sql set. Any other explicit value that
  // isn't "agents" is "legacy".
  loop: string | null | undefined;
  // The active provider id (devx.provider_configs row, or the legacy
  // devx.settings row as fallback) — see api.ts's getActiveProviderConfig.
  provider: string | null | undefined;
}

export function resolveEffectiveLoop({ loop, provider }: ResolveEffectiveLoopInput): EffectiveLoop {
  // An absent flag is the DEFAULT, not a vote for legacy — without this the
  // cutover misses every user who has no devx.settings row (the fourth
  // hard-coded-default site, expressed as `=== "agents"` rather than the
  // string "legacy"). An explicit value still decides for itself.
  const explicit = typeof loop === "string" && loop.length > 0;
  const wantsAgents = explicit ? loop === "agents" : true;
  // claude-code (the sidecar) is the ONLY provider forced to legacy. IAM-shaped
  // bedrock credentials are an unsupported configuration, not a routing
  // decision — see the header comment above and agent.ts's resolveModel.
  const providerForcesLegacy = provider === "claude-code";
  return wantsAgents && !providerForcesLegacy ? "agents" : "legacy";
}
