// Ending the session at the provider the user actually signed in through.
//
// RP-initiated logout ends trex's session and returns the browser to the
// relying party. For a federated session that is only half of it: the upstream
// still holds its own browser session, so the next sign-in silently reuses it
// and the user is never asked who they are. Nothing here revokes anything —
// that already happens — this only carries the browser one hop further so the
// upstream can clear its own cookie.
import { federationFromAppMetadata } from "./claims.ts";

/**
 * The pool, fetched when a query is actually made.
 *
 * Imported lazily on purpose: ../../db.ts constructs its pool at module scope
 * and throws without DATABASE_URL, so naming it at the top of this file would
 * put both in the import graph of everything that mounts the OIDC routes —
 * and a test that imports the mount would then hold an open pool it never
 * opened, which Deno's resource sanitizer fails the file for. Nothing else in
 * this path needs a database until a federated logout actually happens.
 */
async function db() {
  const { pool } = await import("../../db.ts");
  return pool;
}

/** Cached per provider: a logout should not pay for a discovery fetch. */
const endSessionCache = new Map<string, string | null>();

/**
 * The provider a user's account is federated to, or null for a native one.
 *
 * Read from the same app_metadata block the claims are built from, so a
 * session that reports no `idp_provider` resolves to no upstream here either.
 */
async function providerForUser(userId: string): Promise<string | null> {
  const { rows } = await (await db()).query<{ app_metadata: unknown }>(
    `SELECT app_metadata FROM trexdb."user" WHERE id = $1`,
    [userId],
  );
  if (rows.length === 0) return null;
  return federationFromAppMetadata(rows[0].app_metadata).idpProvider ?? null;
}

/**
 * The upstream's end-session endpoint, from the row when it was persisted and
 * from discovery otherwise.
 *
 * A provider that publishes none is cached as "none" rather than re-fetched on
 * every logout: absence is a property of the upstream, not a transient failure,
 * and the alternative is a network round trip on a path a user is waiting on.
 */
async function endSessionEndpoint(providerId: string): Promise<string | null> {
  const cached = endSessionCache.get(providerId);
  if (cached !== undefined) return cached;

  const { rows } = await (await db()).query<{
    issuer: string | null;
    discovery_url: string | null;
    oidcConfig: Record<string, unknown> | null;
  }>(
    `SELECT issuer, discovery_url, "oidcConfig"
       FROM trexdb.sso_provider
      WHERE id = $1 AND enabled = true`,
    [providerId],
  );
  if (rows.length === 0) {
    endSessionCache.set(providerId, null);
    return null;
  }

  const row = rows[0];
  const persisted = row.oidcConfig?.["end_session_endpoint"];
  if (typeof persisted === "string" && persisted) {
    endSessionCache.set(providerId, persisted);
    return persisted;
  }

  const discovery = row.discovery_url ??
    (row.issuer ? row.issuer.replace(/\/+$/, "") + "/.well-known/openid-configuration" : null);
  if (!discovery) {
    endSessionCache.set(providerId, null);
    return null;
  }

  try {
    const res = await fetch(discovery, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) throw new Error(String(res.status));
    const doc = await res.json();
    const url = doc?.end_session_endpoint;
    const resolved = typeof url === "string" && url ? url : null;
    endSessionCache.set(providerId, resolved);
    return resolved;
  } catch (err) {
    // Not cached: unlike a provider that publishes no endpoint, this is a
    // failure that can pass, and caching it would disable upstream logout for
    // the life of the process over one unreachable moment.
    console.error(`[oidc] end-session: upstream discovery failed for ${providerId}:`, err);
    return null;
  }
}

/**
 * Where to send the browser so the upstream ends its session too, or null when
 * there is nothing more to do.
 *
 * `returnTo` is the destination the provider already decided on — it has been
 * through the provider's own post_logout_redirect_uri validation — so handing
 * it back as the upstream's return target adds no redirect the provider would
 * not itself have performed. Building a target from anything in the request
 * would be exactly the open redirect that validation exists to prevent.
 */
export async function upstreamLogoutUrl(
  userId: string | null,
  returnTo: string,
): Promise<string | null> {
  if (!userId) return null;

  const providerId = await providerForUser(userId).catch(() => null);
  if (!providerId) return null;

  const endpoint = await endSessionEndpoint(providerId);
  if (!endpoint) return null;

  try {
    const url = new URL(endpoint);
    url.searchParams.set("post_logout_redirect_uri", returnTo);
    return url.toString();
  } catch {
    return null;
  }
}
