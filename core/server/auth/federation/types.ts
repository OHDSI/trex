/** One configured upstream identity provider, as stored in trexdb.sso_provider. */
export interface ProviderConfig {
  id: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  discoveryUrl: string;
  /**
   * Browser-facing authorize URL, when the discovery document's is not
   * reachable from a browser. `null` means use discovery.
   */
  authorizationEndpoint: string | null;
  scopes: string;
  claimMap: Record<string, string>;
  groupsSource: "claim" | "graph" | "none";
  groupsClaim: string | null;
  linkPolicy: "verified_email";
  autoProvision: boolean;
  /**
   * Optional per-provider restriction on which verified upstream addresses may
   * link or provision at all. `null` (and an empty list, which loadProviders
   * normalises to `null`) means no restriction — today's behaviour.
   * Entries are bare domains, lower-cased on load.
   */
  emailDomainAllowlist: string[] | null;
  /**
   * Whether a first-time upstream identity may be auto-linked to an existing
   * trex user whose role is elevated. Off by default; see link.ts.
   */
  allowElevatedAutoLink: boolean;
}

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
