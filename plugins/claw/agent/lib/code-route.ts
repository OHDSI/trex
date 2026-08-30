// Which transport claw uses to talk to the coder for a given account provider.
//
// Source of truth for the underlying rule: plugins/devx/src/hooks/effectiveLoop.ts's
// resolveEffectiveLoop, which forces ONLY the claude-code (sidecar) provider onto
// the legacy loop — every other provider, including an absent one, gets the eve
// engine's "agents" loop. NOT imported here: claw imports nothing from devx today,
// plugins/claw/importmap.json has no devx entry, and the claw agent is staged into
// a worker where devx's source need not sit alongside it (see code-stream.ts's
// header for the identical trap with core/auth/keys.ts). It is also a NARROWER
// rule than resolveEffectiveLoop implements — that function also folds in a `loop`
// flag and a settings-fetch-failure fallback, neither of which applies here (claw
// never sends a loop flag, and a fetch failure is handled by the caller, not this
// pure function) — so only the one condition is re-expressed.
export type CoderTransport = "legacy" | "eve";

// claude-code is the sidecar engine, which the eve runtime cannot host (see
// code-stream.ts's header); every other provider — anthropic, openai, bedrock,
// and an absent/unset one — runs on eve. An absent provider is deliberately NOT
// routed to legacy: resolveEffectiveLoop's `wantsAgents` defaults to true for an
// absent value and only claude-code forces legacy, so "no provider yet" (a fresh
// account with no devx.settings row) matches every other real provider, not the
// sidecar special case.
export function chooseCoderTransport(provider: string | null | undefined): CoderTransport {
  return provider === "claude-code" ? "legacy" : "eve";
}
