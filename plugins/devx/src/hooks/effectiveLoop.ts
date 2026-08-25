// task-u1: pure routing decision for useEffectiveLoop.ts, factored out so the
// Deno suite (plugins/devx/agent/lib/effective_loop.test.ts) can pin it with
// characterization tests ahead of V17__loop_default_agents.sql flipping the
// devx.settings.loop default to 'agents'. This file must stay dependency-free
// (no React, no "@/..." aliases) so both the Vite frontend build and Deno can
// import it directly.
//
// WHY claude-code and IAM-shaped bedrock are forced to legacy regardless of
// the loop flag: the claude-code provider is the sidecar, a separate
// execution engine, not a model provider — plugins/devx/agent/agent.ts's
// resolveModel throws for it ("sidecar providers use the legacy endpoint"),
// and /chat has no try/catch around that setup-phase call, so an uncaught
// throw there surfaces as a bare, unparseable 500 (confirmed against
// core/server/agents/service/handler.ts's /chat route) — not something a
// frontend can gracefully detect and fall back from. resolveModel ALSO
// throws for a bedrock row whose api_key JSON is IAM-shaped (accessKeyId/
// secretAccessKey, no bearerToken): the agents loop only implements
// bearer-token bedrock auth (see agent.ts's resolveModel comment). Same
// "gate it before /chat ever sees it" posture as claude-code.
//
// IAM detection uses the server-derived `authShape` hint (merge-gate
// re-review: every GET response MASKS api_key — LEFT(...,8)||'...'||
// RIGHT(...,4) — so client-side JSON sniffing of it can never match; the
// server computes the shape from the RAW key before masking, see
// functions/auth_shape.ts). The server-side resolveModel throw remains the
// backstop for anything that slips past this gate (e.g. an older server
// build that doesn't emit auth_shape yet, where this function can't detect
// IAM and falls through).
export type EffectiveLoop = "legacy" | "agents";

// The loop a user gets when their settings/provider could NOT be read at all
// (useEffectiveLoop's `.catch`). Deliberately NOT the same as an ABSENT
// `loop` value, which resolves to "agents" below: a user whose provider row
// we failed to fetch may be on `claude-code`, for which eve's resolveModel
// throws — so an unreadable configuration must degrade to the loop that
// works for EVERY provider, while a merely-unset flag follows V17's new
// column default. Exported so the distinction is pinned by a test rather
// than living only as a literal inside a React `.catch`.
export const SETTINGS_FETCH_FAILURE_LOOP: EffectiveLoop = "legacy";

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
  // Server-derived, non-secret credential-shape hint (functions/
  // auth_shape.ts). Only meaningful for provider === "bedrock".
  authShape?: string | null;
}

export function resolveEffectiveLoop({ loop, provider, authShape }: ResolveEffectiveLoopInput): EffectiveLoop {
  // An absent flag is the DEFAULT, not a vote for legacy — without this the
  // cutover misses every user who has no devx.settings row (the fourth
  // hard-coded-default site, expressed as `=== "agents"` rather than the
  // string "legacy"). An explicit value still decides for itself.
  const explicit = typeof loop === "string" && loop.length > 0;
  const wantsAgents = explicit ? loop === "agents" : true;
  const providerForcesLegacy = provider === "claude-code" || (provider === "bedrock" && authShape === "iam");
  return wantsAgents && !providerForcesLegacy ? "agents" : "legacy";
}
