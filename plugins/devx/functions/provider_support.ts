// One definition of "this provider row can no longer be served", shared by
// every path that resolves a provider row.
//
// Rows naming a deleted engine are still in the database — the
// provider_configs/settings tables were deliberately left unmigrated. Such a
// row must be rejected on the provider NAME, ahead of the API-key check,
// because the key check only fails closed for these rows by accident: it is
// `!api_key && !isNoKeyProvider(provider)`, and POST /provider-configs
// accepts any provider string with any key, so a removed-engine row WITH a key
// passes it. It then reaches createModel's last branch — the
// OpenAI-compatible client — which resolves an absent key from the worker's
// own OPENAI_API_KEY, so one user's turn runs on, and is billed to, the
// operator's account.
//
// The gate used to be copy-pasted at six read sites and the waiver set at
// five. They live here so they cannot drift apart: a new read site imports
// the gate instead of transcribing it.
//
// Both memberships below are module-private on purpose, and are reached only
// through the predicates. An exported Set would be process-global mutable
// state in a credential gate: `ReadonlySet` is erased at runtime, most
// consumers carry `@ts-nocheck`, and the suites run `--no-check`, so a single
// `.add()`/`.delete()` anywhere in the worker would silently disable the gate
// for every site and every user for the lifetime of the process. Before this
// module existed each read site built its own local set that nothing else
// could reach; keeping the sets private preserves that property.

// Providers whose dispatch path has been deleted. A name lands here when its
// engine is removed and its stored rows are left in place; it must never be
// added to NO_KEY_PROVIDERS.
const REMOVED_PROVIDERS = new Set(["copilot"]);

// Providers that genuinely authenticate without a stored key, and are
// therefore waived past the key check. Nothing else belongs here: waiving a
// provider with no engine behind it is the credential-substitution path
// described at the top of this file.
const NO_KEY_PROVIDERS = new Set(["claude-code", "bedrock"]);

// A frozen snapshot for callers that need to enumerate rather than test —
// today that is provider_gate_guard.test.ts, which cross-checks the two
// memberships against each other. Handing out an array copy rather than the
// Set keeps the live membership unreachable from outside this module.
export const REMOVED_PROVIDER_NAMES: readonly string[] = Object.freeze([...REMOVED_PROVIDERS]);

// How each removed provider is named to the user. A Map, not an object
// literal: an object lookup inherits from Object.prototype, so a row whose
// provider column read "constructor" or "toString" would render the inherited
// value into a user-facing sentence.
const REMOVED_PROVIDER_LABELS = new Map<string, string>([
  ["copilot", "GitHub Copilot"],
]);

// The removal sentence has two endings and both are load-bearing:
//  - `plugin` — returned by this plugin's own HTTP routes, whose copy ends in
//    a period like the rest of that surface.
//  - `hostAgnostic` — thrown from the agents loop, which surfaces through a
//    runtime shared with other plugins, so an unqualified "Settings" would be
//    ambiguous there; that surface's copy carries no trailing period.
// Both render from the single sentence in removedProviderMessage below, so a
// wording change lands in one place and neither ending is a second copy.
const MESSAGE_ENDINGS = {
  plugin: "Settings.",
  hostAgnostic: "devx Settings",
} as const;

export type RemovalMessageStyle = keyof typeof MESSAGE_ENDINGS;

export function isRemovedProvider(provider: string | null | undefined): provider is string {
  return typeof provider === "string" && REMOVED_PROVIDERS.has(provider);
}

// Whether a provider authenticates without a stored API key, and is therefore
// waived past the key check.
export function isNoKeyProvider(provider: string | null | undefined): boolean {
  return typeof provider === "string" && NO_KEY_PROVIDERS.has(provider);
}

export type AgentName = "devx" | "claw" | "d2esupport";
export const AGENT_NAMES: readonly AgentName[] = Object.freeze(["devx", "claw", "d2esupport"]);

// Providers whose dispatch path only exists for devx's own coder (the
// claude-code CLI sidecar). ModelSpec.provider (core/server/agents/eve-shim/
// types.ts) is typed to "anthropic" | "openai" | "google" | "bedrock" only, so
// claw/d2esupport structurally cannot run a turn on claude-code even if a row
// slipped through — this gate stops the row from being assignable in the
// first place, at the one place (POST/PUT agent-model-selection) a user could
// otherwise create that dead configuration.
const DEVX_ONLY_PROVIDERS = new Set(["claude-code"]);

export function isDevxOnlyProvider(provider: string | null | undefined): boolean {
  return typeof provider === "string" && DEVX_ONLY_PROVIDERS.has(provider);
}

export function assertProviderAllowedForAgent(provider: string | null | undefined, agent: AgentName): void {
  if (agent !== "devx" && isDevxOnlyProvider(provider)) {
    throw new Error(`claude-code is only available for devx — choose a different provider for ${agent}.`);
  }
}

export function removedProviderMessage(
  provider: string,
  style: RemovalMessageStyle = "plugin",
): string {
  const label = REMOVED_PROVIDER_LABELS.get(provider) ?? provider;
  return `${label} support has been removed — choose another provider in ${MESSAGE_ENDINGS[style]}`;
}

// Gate for request handlers: null when the row may proceed, the rejection
// response when it may not. Call it on the resolved provider row before the
// key check, and return the value if it is not null.
export function removedProviderResponse(
  provider: string | null | undefined,
  corsHeaders: Record<string, string>,
  style: RemovalMessageStyle = "plugin",
): Response | null {
  if (!isRemovedProvider(provider)) return null;
  return Response.json(
    { error: removedProviderMessage(provider, style) },
    { status: 400, headers: corsHeaders },
  );
}

// Gate for call sites that fail a turn rather than answer a request (tools,
// the agents loop). Same predicate, same sentence, thrown instead of returned.
export function assertProviderSupported(
  provider: string | null | undefined,
  style: RemovalMessageStyle = "plugin",
): void {
  if (isRemovedProvider(provider)) {
    throw new Error(removedProviderMessage(provider, style));
  }
}
