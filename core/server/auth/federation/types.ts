// What the federation flow knows about a person, and nothing else.
//
// ProviderConfig lived here until the cutover: loadProviders normalised a
// whole provider row into it, and nothing normalises a provider row any more.
// @better-auth/sso reads its configuration out of sso_provider."oidcConfig"
// (sso-config.ts), and the columns that are trex's own policy are read off the
// raw adapter row by resolve-user.ts and provision.ts. A second normalised copy
// could only drift from the one a sign-in obeys, so the two readers that need a
// shape declare exactly the fields they read: link.ts's LinkPolicy and
// groups.ts's GroupsConfig.

/** What we learned about a person from an upstream id_token, normalised. */
export interface UpstreamIdentity {
  sub: string;
  /**
   * `null` when the upstream asserted no address at all. Common on a Logto
   * installation whose accounts are username-only, and harmless for an
   * identity that is already linked — the link, not the address, is what says
   * which trex user this is. The key stays present so every reader has to
   * decide what an absent address means rather than forget the case exists.
   */
  email: string | null;
  name?: string;
  emailVerified: boolean;
}
