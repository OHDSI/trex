// The federation block trex writes onto a user, and how it is read back.
//
// What was here besides — the hand-rolled id_token claim builder — went with
// the provider it served; oidc/custom-claims.ts rebuilds the same claim set on
// the plugin's callbacks. This stays because the producer
// (federation/router.ts) and the consumers (auth-router.ts, federation's own
// router, custom-claims.ts) must agree on one key name and none of them owns it.

/**
 * Where a federated sign-in records the upstream identity it came from, inside
 * trexdb."user".app_metadata. One nested object rather than two top-level keys,
 * so it cannot collide with GoTrue's own `provider`/`providers` entries and so
 * a native sign-in can drop the whole thing with a single `- 'idp'`.
 *
 * The name lives here, next to the claims it feeds, because the producer
 * (federation/router.ts) and the consumer (oidc/custom-claims.ts) must agree
 * on it and neither owns it.
 */
export const IDP_METADATA_KEY = "idp";

export interface IdpMetadata {
  /** sso_provider.id. */
  provider: string;
  /** Raw upstream group identifiers, exactly as resolved at sign-in. */
  groups: string[];
}

/**
 * Reads the federation block back out of a user's app_metadata.
 *
 * Tolerant by design: app_metadata is a free-form JSONB column that predates
 * this and can hold anything. Anything that is not the shape written by the
 * federation callback yields no federation fields at all, so a malformed or
 * hand-edited value degrades to "this is a native session" rather than
 * asserting a provider that cannot be substantiated.
 */
export function federationFromAppMetadata(
  appMetadata: unknown,
): { idpProvider?: string; idpGroups?: string[] } {
  if (typeof appMetadata !== "object" || appMetadata === null) return {};
  const block = (appMetadata as Record<string, unknown>)[IDP_METADATA_KEY];
  if (typeof block !== "object" || block === null) return {};

  const { provider, groups } = block as Record<string, unknown>;
  if (typeof provider !== "string" || provider.length === 0) return {};
  const list = Array.isArray(groups) && groups.every((g) => typeof g === "string")
    ? groups as string[]
    : [];
  return { idpProvider: provider, idpGroups: list };
}
