// Body parsing for the federation admin API. No database, no express.

export interface ProviderUpsert {
  id: string;
  displayName: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  discoveryUrl: string | null;
  authorizationEndpoint: string | null;
  scopes: string;
  groupsSource: "claim" | "graph" | "none";
  groupsClaim: string | null;
  autoProvision: boolean;
  enabled: boolean;
}

export interface LinkRequest {
  providerId: string;
  accountId: string;
  email: string;
  name: string | null;
  banned: boolean;
  /**
   * The trex user id to link to, or to create the user under. Set when a
   * migration must keep the id the identity already had upstream, since that
   * id is the token `sub` everything downstream is keyed by.
   */
  userId: string | null;
}

const PROVIDER_ID = /^[a-z][a-z0-9_]*$/;
// Wide enough for Logto's 12-character ids and for UUIDs; narrow enough that
// the id is safe in a URL path, a JWT `sub` and a log line without escaping.
const USER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const GROUPS_SOURCES = new Set(["claim", "graph", "none"]);

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseProviderUpsert(id: string, body: unknown): ProviderUpsert | null {
  if (!PROVIDER_ID.test(id) || !body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const displayName = str(b.displayName);
  const clientId = str(b.clientId);
  const clientSecret = str(b.clientSecret);
  const issuer = str(b.issuer);
  if (!displayName || !clientId || !clientSecret || !issuer) return null;
  const groupsSource = b.groupsSource === undefined ? "none" : b.groupsSource;
  if (typeof groupsSource !== "string" || !GROUPS_SOURCES.has(groupsSource)) return null;
  return {
    id,
    displayName,
    clientId,
    clientSecret,
    issuer,
    discoveryUrl: str(b.discoveryUrl),
    authorizationEndpoint: str(b.authorizationEndpoint),
    scopes: str(b.scopes) ?? "openid profile email",
    groupsSource: groupsSource as ProviderUpsert["groupsSource"],
    groupsClaim: str(b.groupsClaim),
    autoProvision: b.autoProvision === true,
    enabled: b.enabled !== false,
  };
}

export function parseLinkRequest(body: unknown): LinkRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const providerId = str(b.providerId);
  const accountId = str(b.accountId);
  const email = str(b.email)?.toLowerCase() ?? null;
  if (!providerId || !PROVIDER_ID.test(providerId) || !accountId || !email || !email.includes("@")) {
    return null;
  }
  let userId: string | null = null;
  if (b.userId !== undefined && b.userId !== null) {
    if (typeof b.userId !== "string") return null;
    userId = str(b.userId);
    // A malformed id rejects the whole request rather than being dropped: a
    // caller that asked for a specific id must not silently get a random one.
    if (userId !== null && !USER_ID.test(userId)) return null;
  }
  return { providerId, accountId, email, name: str(b.name), banned: b.banned === true, userId };
}
