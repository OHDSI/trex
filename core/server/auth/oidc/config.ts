// Provider configuration and small request helpers. No database, no express:
// everything here is a pure function of its input so it can be tested directly.

/** Off unless explicitly enabled, like the native IdP. */
export function oidcProviderEnabled(
  raw: string | undefined = Deno.env.get("TREX_OIDC_PROVIDER_ENABLED"),
): boolean {
  return raw === "true" || raw === "1";
}

/**
 * The issuer every token carries and every relying party validates, so it comes
 * from configuration rather than from the request: a proxied Host header would
 * otherwise vary the `iss` claim between callers and break validation.
 */
export function issuerUrl(
  base: string | undefined = Deno.env.get("TREX_OIDC_ISSUER"),
  basePath = "",
): string {
  return (base ?? "http://localhost:33001").replace(/\/+$/, "") + basePath;
}

/** Where an unauthenticated /authorize sends the browser; trex hosts no login UI. */
export function loginUrl(
  raw: string | undefined = Deno.env.get("TREX_OIDC_LOGIN_URL"),
): string | null {
  return raw && raw.length > 0 ? raw : null;
}

/**
 * Reads one cookie off the raw header: the server mounts no cookie parser, and
 * this is the only route that needs one. Matches the whole name, so a cookie
 * merely ending in the wanted name is not mistaken for it.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}
