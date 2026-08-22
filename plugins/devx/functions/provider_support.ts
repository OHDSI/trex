// One definition of "this provider row can no longer be served", shared by
// every path that resolves a provider row.
//
// Rows naming a deleted engine are still in the database — the
// provider_configs/settings tables were deliberately left unmigrated. Such a
// row must be rejected on the provider NAME, ahead of the API-key check,
// because the key check only fails closed for these rows by accident: it is
// `!api_key && !NO_KEY_PROVIDERS.has(provider)`, and POST /provider-configs
// accepts any provider string with any key, so a removed-engine row WITH a key
// passes it. It then reaches createModel's last branch — the
// OpenAI-compatible client — which resolves an absent key from the worker's
// own OPENAI_API_KEY, so one user's turn runs on, and is billed to, the
// operator's account.
//
// The gate used to be copy-pasted at six read sites and the waiver set at
// five. They live here so they cannot drift apart: a new read site imports
// the gate instead of transcribing it.

// Providers whose dispatch path has been deleted. A name lands here when its
// engine is removed and its stored rows are left in place; it must never be
// added to NO_KEY_PROVIDERS.
export const REMOVED_PROVIDERS: ReadonlySet<string> = new Set(["copilot"]);

// How each removed provider is named to the user. Keyed separately from the
// set so the rejection can say what actually happened rather than echoing the
// raw column value.
const REMOVED_PROVIDER_LABELS: Record<string, string> = {
  copilot: "GitHub Copilot",
};

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

export function isRemovedProvider(provider: string | null | undefined): boolean {
  return typeof provider === "string" && REMOVED_PROVIDERS.has(provider);
}

export function removedProviderMessage(
  provider: string,
  style: RemovalMessageStyle = "plugin",
): string {
  const label = REMOVED_PROVIDER_LABELS[provider] ?? provider;
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
    { error: removedProviderMessage(provider as string, style) },
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
    throw new Error(removedProviderMessage(provider as string, style));
  }
}

// Providers that genuinely authenticate without a stored key, and are
// therefore waived past the key check. Nothing else belongs here: waiving a
// provider with no engine behind it is the credential-substitution path
// described at the top of this file.
export const NO_KEY_PROVIDERS: ReadonlySet<string> = new Set(["claude-code", "bedrock"]);
