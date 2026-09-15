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
}

const PROVIDER_ID = /^[a-z][a-z0-9_]*$/;
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
  return { providerId, accountId, email, name: str(b.name), banned: b.banned === true };
}
