// Client policy: the decisions that decide whether a request is legitimate.
//
// Deliberately free of database imports so the rules can be exercised on their
// own — these are the checks that keep authorization codes from being handed to
// the wrong party, and they should be testable without a running Postgres.

export interface OidcClient {
  clientId: string;
  clientSecretHash: string | null;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  allowedScopes: string[];
  requirePkce: boolean;
}

/**
 * Exact string comparison, deliberately: prefix or wildcard matching on a
 * redirect_uri is how authorization codes get delivered to an attacker.
 */
export function isRegisteredRedirectUri(client: OidcClient, redirectUri: string): boolean {
  return typeof redirectUri === "string" &&
    redirectUri.length > 0 &&
    client.redirectUris.includes(redirectUri);
}

export function isRegisteredPostLogoutUri(client: OidcClient, uri: string): boolean {
  return typeof uri === "string" &&
    uri.length > 0 &&
    client.postLogoutRedirectUris.includes(uri);
}

/** A client with no stored secret is public and authenticates with PKCE alone. */
export function isPublicClient(client: OidcClient): boolean {
  return client.clientSecretHash === null;
}

/**
 * Requested scopes narrowed to what the client is allowed. `openid` is what
 * makes the request an OIDC one, so it is never added here: the caller rejects
 * the request when it is missing rather than quietly granting it.
 */
export function grantedScopes(client: OidcClient, requested: string): string[] {
  const asked = requested.split(/\s+/).filter(Boolean);
  return asked.filter((s) => client.allowedScopes.includes(s));
}

/** The parts of an issued code that PKCE verification depends on. */
export interface PkceChallenge {
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
}

/**
 * PKCE check. Only S256 is accepted: `plain` sends the verifier in the clear and
 * so offers no protection against an attacker who already intercepted the code,
 * which is the case PKCE exists for.
 *
 * A code issued without a challenge passes — public clients are required to send
 * one at /authorize, so by the time a code exists the requirement is settled.
 */
export async function verifyPkce(
  record: PkceChallenge,
  verifier: string | undefined,
): Promise<boolean> {
  if (!record.codeChallenge) return true;
  if (record.codeChallengeMethod !== "S256") return false;
  if (!verifier) return false;

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier).buffer as ArrayBuffer,
  );
  const encoded = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return encoded === record.codeChallenge;
}

/**
 * Absolute URL to send the browser back to after it has signed in.
 *
 * The issuer carries the mount's base path (`https://host/trex`) because every
 * advertised endpoint is built from it, and Express's `req.originalUrl` carries
 * that same prefix (`/trex/oidc/authorize?...`). Concatenating the two doubles
 * it — `/trex/trex/oidc/authorize` — and the return trip 404s, leaving the user
 * on the login page with no way forward. Only the issuer's origin belongs here.
 */
export function buildReturnTo(issuer: string, originalUrl: string): string {
  return new URL(issuer).origin + originalUrl;
}
