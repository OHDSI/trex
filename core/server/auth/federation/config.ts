// Provider configuration and claim normalisation. No database, no express:
// pure functions of their input so they can be tested directly.
import type { UpstreamIdentity } from "./types.ts";

/** Off unless explicitly enabled, like the native IdP and the OIDC provider. */
export function federationEnabled(
  raw: string | undefined = Deno.env.get("TREX_FEDERATION_ENABLED"),
): boolean {
  return raw === "true" || raw === "1";
}

/**
 * Upstream providers disagree about claim names — Entra calls the subject `oid`
 * and the address `upn`. `claim_map` moves those onto canonical fields so the
 * rest of the flow never branches per provider. An unmapped field falls back to
 * its standard OIDC name.
 */
export function applyClaimMap(
  claims: Record<string, unknown>,
  map: Record<string, string>,
): UpstreamIdentity {
  const read = (field: string) => claims[map[field] ?? field];

  const sub = read("sub");
  if (typeof sub !== "string" || sub.length === 0) {
    throw new Error("upstream id_token carries no usable subject");
  }
  // The subject is the identity and is required; the address is not. An
  // upstream whose accounts are username-only asserts no email claim at all,
  // and refusing it here would lock out every such account — including the
  // ones already linked to a trex user, which need no address to sign in.
  const raw = read("email");
  const email = typeof raw === "string" && raw.length > 0 ? raw : null;
  const name = read("name");
  // Absent means unverified. Never default this to true: the whole link policy
  // rests on it.
  const verified = read("email_verified") === true;

  return {
    sub,
    email,
    ...(typeof name === "string" ? { name } : {}),
    emailVerified: verified,
  };
}

/**
 * The URL the browser is redirected to at the upstream. The configured
 * override wins because discovery describes the provider as trex reaches it,
 * which is not necessarily how a browser reaches it.
 */
export function authorizationEndpointFor(
  provider: { authorizationEndpoint: string | null },
  doc: { authorization_endpoint: string },
): string {
  const override = provider.authorizationEndpoint?.trim();
  return override ? override : doc.authorization_endpoint;
}
