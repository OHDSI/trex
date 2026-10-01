// Ending the session at the provider the user actually signed in through.
//
// RP-initiated logout ends trex's session and returns the browser to the
// relying party. For a federated session that is only half of it: the upstream
// still holds its own browser session, so the next sign-in silently reuses it
// and the user is never asked who they are. Nothing here revokes anything —
// that already happens — this only carries the browser one hop further so the
// upstream can clear its own cookie.
//
// Two things follow from that hop needing an id_token_hint. This module reads
// a sealed credential, so it goes through providers.ts rather than touching
// trexdb.account itself. And the userId it is handed decides WHOSE credential
// is decrypted into a redirect, so it has to be one the caller verified —
// oidc/mount.ts takes it from trex's session cookie, not from the hint.
import { federationFromAppMetadata } from "./claims.ts";
import { readAccountIdTokenByUser } from "../federation/providers.ts";

/**
 * Three base64url segments, which is all that has to hold for a value to be
 * worth sending as an id_token_hint.
 *
 * Shape is checked because one corruption does NOT announce itself: a column
 * that went through the DEK hook twice (account-tokens.ts describes the path)
 * decrypts cleanly to the inner ciphertext, so the failure is a hint the
 * upstream silently rejects rather than a throw. Sending nothing is better --
 * the user gets the confirmation page instead of a dead end, and this logs.
 */
export function looksLikeCompactJws(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p));
}

/** The upstream id_token stored on the user's federated account, or null. */
async function upstreamIdToken(userId: string, providerId: string): Promise<string | null> {
  const token = await readAccountIdTokenByUser(await db(), userId, providerId);
  if (!token) return null;
  if (!looksLikeCompactJws(token)) {
    console.error(
      `[oidc] end-session: stored upstream id_token for ${providerId} is not a JWT; sending no hint`,
    );
    return null;
  }
  return token;
}

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

/** One trexdb.sso_provider row, as much of it as end-session resolution needs. */
export interface EndSessionRow {
  issuer: string | null;
  discovery_url: string | null;
  authorization_endpoint: string | null;
  oidcConfig: Record<string, unknown> | null;
}

/** The origin of a URL-shaped string, or null when it is not one. */
function originOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * The same endpoint, moved to the origin a browser can actually reach.
 *
 * V13's authorization_endpoint is used to make the endpoint reachable, not to
 * derive it: the PATH stays whatever the upstream itself published, so a
 * provider whose end-session path is not Logto's `/oidc/session/end` keeps its
 * own. Deriving the path instead would fabricate a URL — Keycloak publishes
 * `.../protocol/openid-connect/auth` but ends sessions at `.../logout`, and a
 * guess there sends the browser somewhere that does not exist.
 *
 * Only an endpoint on the ISSUER's origin is moved. That is the one the
 * upstream's own internal view produced; a persisted value on some other
 * origin is the operator saying where the browser should go, and rewriting it
 * would discard the answer.
 */
function browserFacing(endpoint: string, row: EndSessionRow, providerId: string): string | null {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }

  // Trimmed, and a value left empty by the trim treated as absent: the rule
  // sso-config.ts applies to this same column, for the hand-edited rows and
  // backfills V13's override exists to serve.
  const override = row.authorization_endpoint?.trim();
  if (!override) return url.toString();

  const authorizeOrigin = originOf(override);
  if (!authorizeOrigin || authorizeOrigin === url.origin) return url.toString();

  const issuerOrigin = originOf(row.issuer);
  if (!issuerOrigin || url.origin !== issuerOrigin) return url.toString();

  const moved = new URL(url.pathname + url.search + url.hash, authorizeOrigin).toString();
  // Once per provider per process, since the result is cached. An operator
  // debugging a split deployment otherwise has no way to see that the endpoint
  // the upstream published was not the one the browser was sent to.
  console.log(
    `[oidc] end-session: ${providerId} publishes ${url.origin}, sending the browser to ${authorizeOrigin}`,
  );
  return moved;
}

/**
 * The browser-facing end-session endpoint for a provider row, or null.
 *
 * `discovered` is the discovery document's `end_session_endpoint`, already
 * fetched, or null when there was none to fetch or the fetch failed. Pure so
 * the precedence and the origin rewrite are testable without a database or a
 * network: endSessionEndpoint below is the part that needs both.
 *
 * Precedence is the operator's persisted value, then discovery. An upstream
 * that publishes neither has no end-session endpoint and the hop is skipped.
 */
export function resolveEndSessionEndpoint(
  row: EndSessionRow,
  discovered: string | null,
  providerId = "provider",
): string | null {
  const persisted = row.oidcConfig?.["end_session_endpoint"];
  const endpoint = typeof persisted === "string" && persisted.trim()
    ? persisted.trim()
    : (discovered && discovered.trim() ? discovered.trim() : null);
  if (!endpoint) return null;
  return browserFacing(endpoint, row, providerId);
}

/**
 * The upstream's end-session endpoint, resolved and cached.
 *
 * A provider that publishes none is cached as "none" rather than re-fetched on
 * every logout: absence is a property of the upstream, not a transient failure,
 * and the alternative is a network round trip on a path a user is waiting on.
 */
async function endSessionEndpoint(providerId: string): Promise<string | null> {
  const cached = endSessionCache.get(providerId);
  if (cached !== undefined) return cached;

  const { rows } = await (await db()).query<EndSessionRow>(
    `SELECT issuer, discovery_url, authorization_endpoint, "oidcConfig"
       FROM trexdb.sso_provider
      WHERE id = $1 AND enabled = true`,
    [providerId],
  );
  if (rows.length === 0) {
    endSessionCache.set(providerId, null);
    return null;
  }
  const row = rows[0];

  // The persisted value settles it without a fetch.
  const persisted = row.oidcConfig?.["end_session_endpoint"];
  if (typeof persisted === "string" && persisted.trim()) {
    const resolved = resolveEndSessionEndpoint(row, null, providerId);
    endSessionCache.set(providerId, resolved);
    return resolved;
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
    const resolved = resolveEndSessionEndpoint(
      row,
      typeof url === "string" ? url : null,
      providerId,
    );
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
 *
 * `userId` must be verified by the caller. It selects the account whose stored
 * upstream id_token is decrypted and placed in the returned URL, so an
 * unverified subject here is a way to read someone else's credential.
 *
 * Note for the deployments this hint matters to: an upstream that can now
 * identify the client will also validate the accompanying
 * post_logout_redirect_uri against that client's registered post-logout URIs.
 * A Logto app registering only its pre-federation return URI moves from a
 * confirmation page to an error, so the return target has to be registered
 * upstream as well.
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
    // Without the hint Logto keeps its session and prompts for confirmation, so
    // the browser silently re-authenticates on the next sign-in.
    const idToken = await upstreamIdToken(userId, providerId).catch(() => null);
    if (idToken) url.searchParams.set("id_token_hint", idToken);
    url.searchParams.set("post_logout_redirect_uri", returnTo);
    return url.toString();
  } catch {
    return null;
  }
}
