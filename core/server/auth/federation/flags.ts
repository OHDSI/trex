// The two environment switches federation is decided by. No database, no
// express: pure functions of their input so they can be tested directly.
//
// Named flags.ts rather than config.ts because that is now all this file is.
// applyClaimMap and authorizationEndpointFor lived here until the cutover and
// have no callers left: the claim names @better-auth/sso reads are serialized
// into sso_provider."oidcConfig" by sso-config.ts's oidcConfigFor, and the
// verification claim the link policy reads is taken off the verified id_token
// by resolve-user.ts. The rename also ends a collision with oidc/config.ts,
// which is a different thing entirely.

/** Off unless explicitly enabled, like the native IdP and the OIDC provider. */
export function federationEnabled(
  raw: string | undefined = Deno.env.get("TREX_FEDERATION_ENABLED"),
): boolean {
  return raw === "true" || raw === "1";
}

/**
 * Whether trex's own email/password sign-in is offered at all.
 *
 * On by default, unlike federationEnabled: every existing deployment
 * authenticates this way and an unset variable must not take it down. Only the
 * two spellings of "off" turn it off, so a typo leaves sign-in working rather
 * than locking everyone out of the installation they would need to reach to
 * correct it.
 *
 * An installation that federates a directory of passwordless accounts wants
 * this off: those users have no trex password, so a password form is a dead
 * end that looks like a broken login.
 */
export function nativePasswordLoginEnabled(
  raw: string | undefined = Deno.env.get("TREX_NATIVE_PASSWORD_LOGIN_ENABLED"),
): boolean {
  return raw !== "false" && raw !== "0";
}
