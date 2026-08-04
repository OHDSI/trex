// The OAuth broker (spec §5, §7): resolves a connection's `trexConnect`
// oauth auth to a usable access token, or to an authorization requirement the
// provider parks on. This is the security-sensitive core — it decides when a
// stored token is good, when to REFRESH it, and (when neither) mints the signed
// `state` that gates the whole consent redirect.
//
// resolveOAuthAuth(store, auth, ctx) →
//   { token }                            valid stored token (or freshly refreshed)
//   { authorizationRequired: { url } }   no usable token → user must consent
//   { error: "principal_required" }      no principal to act as → terminal
//
// Fail-closed invariants:
//   * A user-scoped connection with NO resolvable principal returns
//     principal_required (never falls back to a shared/app token).
//   * A refresh whose connector has an UNSET client-secret env-ref THROWS
//     (never posts an `undefined` secret); the caller (provider) logs+skips.
//   * The authorizationRequired url carries a freshly signed, expiring state.

import type { OAuthConnector, OAuthStore, OAuthToken } from "./store.ts";
import type { ConnectionAuth } from "../types.ts";
import type { FetchLike } from "../openapi.ts";
import { signState, type StatePayload } from "./state.ts";

/** The sentinel principal id app-scoped (principalType "app") tokens live under. */
export const APP_PRINCIPAL_ID = "__app__";

/** A concrete (principalType, principalId) the broker keys tokens on. */
export interface ResolvedPrincipal {
  principalType: string;
  principalId: string;
}

/** The oauth arm of ConnectionAuth (narrowed for the broker's use). */
export type OAuthConnectionAuth = Extract<ConnectionAuth, { kind: "oauth" }>;

export interface BrokerCtx {
  /** Session the parked turn belongs to (carried into the signed state). */
  sessionId: string;
  /**
   * The resolved end-user principal for this turn (channel principal, or the
   * x-user-id-derived user). null when the request carries no principal —
   * a user-scoped connection then fails closed with principal_required.
   */
  principal: ResolvedPrincipal | null;
  /** HMAC secret used to sign the authorization `state`. */
  secret: string;
  /**
   * Base path the start route lives under, e.g. `${basePath}/eve/v1/oauth`.
   * The authorizationRequired url is `${startUrlBase}/<connector>/start?state=…`.
   */
  startUrlBase: string;
  /** Injectable fetch for the refresh token request (tests pass a mock). */
  fetch?: FetchLike;
  /** Injectable clock (tests). */
  now?: () => number;
  /** How close to expiry (ms) triggers a refresh. Default 60s. */
  refreshWindowMs?: number;
  /** TTL (ms) of the minted authorization state. Default 10min. */
  stateTtlMs?: number;
}

export type OAuthResolution =
  | { token: string }
  | { authorizationRequired: { url: string } }
  | { error: "principal_required" };

/**
 * Which (principalType, principalId) a connection's oauth auth targets.
 * App-scoped → the "__app__" sentinel; user-scoped → the session's end-user
 * principal (null when absent). Exported so the provider's park loop keys
 * store.getToken exactly the way the broker (and thus the callback's putToken)
 * does — the three MUST agree or the resume never observes the token.
 */
export function resolvePrincipal(
  auth: { principalType?: "user" | "app" },
  principal: ResolvedPrincipal | null,
): ResolvedPrincipal | null {
  if (auth.principalType === "app") {
    return { principalType: "app", principalId: APP_PRINCIPAL_ID };
  }
  return principal;
}

/**
 * Parse an RFC-6749 token endpoint JSON response into an OAuthToken. Returns
 * null when there is no access_token (the caller treats that as a failed
 * exchange/refresh — it never writes a token). Shared by the refresh path here
 * and the authorization-code exchange in routes.ts. NEVER logs the response.
 */
export function parseTokenResponse(
  json: unknown,
  connector: OAuthConnector,
  opts: { now: number; fallbackRefresh?: string | null },
): OAuthToken | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const access = typeof j.access_token === "string" && j.access_token.length > 0 ? j.access_token : null;
  if (!access) return null;
  const refresh = typeof j.refresh_token === "string" && j.refresh_token.length > 0
    ? j.refresh_token
    : (opts.fallbackRefresh ?? null);
  const expiresInRaw = j.expires_in;
  const expiresIn = typeof expiresInRaw === "number"
    ? expiresInRaw
    : (typeof expiresInRaw === "string" && expiresInRaw.trim() !== "" ? Number(expiresInRaw) : NaN);
  const expiresAt = Number.isFinite(expiresIn) ? new Date(opts.now + expiresIn * 1000) : null;
  const scopes = typeof j.scope === "string" ? j.scope : (connector.scopes ?? null);
  return { access, refresh, expiresAt, scopes };
}

// POST an x-www-form-urlencoded grant to a connector's token endpoint. Shared
// helper — never logs the client secret or the response body.
async function postToken(
  connector: OAuthConnector,
  form: Record<string, string>,
  fetchFn: FetchLike,
): Promise<Response> {
  return await fetchFn(connector.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
}

// Exchange a refresh_token for a fresh access token and persist it. Returns the
// new access token, or null when the connector is unknown or the refresh is
// rejected (the caller then re-authorizes). THROWS when the client secret's
// env-ref is unset — a hard misconfiguration; we never post `undefined`.
async function refreshAccessToken(
  store: OAuthStore,
  connectorId: string,
  principal: ResolvedPrincipal,
  refreshToken: string,
  ctx: BrokerCtx,
): Promise<string | null> {
  const connector = await store.getConnector(connectorId);
  if (!connector) return null;
  // Reject a missing OR empty secret: an env-ref set to "" must hard-error the
  // same way an unset one does, never post `client_secret=` to the IdP.
  if (!connector.clientSecret) {
    throw new Error(
      `oauth connector "${connectorId}": client secret env-ref is unset or empty — cannot refresh (never send an empty secret)`,
    );
  }
  const fetchFn = ctx.fetch ?? ((u, i) => fetch(u, i));
  const now = ctx.now ? ctx.now() : Date.now();
  let res: Response;
  try {
    res = await postToken(connector, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: connector.clientId,
      client_secret: connector.clientSecret,
    }, fetchFn);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return null;
  }
  const token = parseTokenResponse(json, connector, { now, fallbackRefresh: refreshToken });
  if (!token) return null;
  await store.putToken(principal.principalType, principal.principalId, connectorId, token);
  return token.access;
}

export async function resolveOAuthAuth(
  store: OAuthStore,
  auth: OAuthConnectionAuth,
  ctx: BrokerCtx,
): Promise<OAuthResolution> {
  const principal = resolvePrincipal(auth, ctx.principal);
  // Fail closed: a user-scoped connection with no principal never borrows the
  // app token or anyone else's — it is a terminal error surfaced to the model.
  if (!principal) return { error: "principal_required" };

  const now = ctx.now ? ctx.now() : Date.now();
  const connectorId = auth.connector;

  const existing = await store.getToken(principal.principalType, principal.principalId, connectorId);
  if (existing) {
    const nearExpiry = existing.expiresAt != null &&
      (existing.expiresAt.getTime() - now) < (ctx.refreshWindowMs ?? 60_000);
    if (!nearExpiry) return { token: existing.access };
    // Near expiry: try a silent refresh. On success we return the new token;
    // on failure (or no refresh token) we fall through to re-authorization.
    if (existing.refresh) {
      const refreshed = await refreshAccessToken(store, connectorId, principal, existing.refresh, ctx);
      if (refreshed) return { token: refreshed };
    }
  }

  // No usable token → mint a signed, expiring state and point at the start route.
  const payload: StatePayload = {
    session: ctx.sessionId,
    principalType: principal.principalType,
    principalId: principal.principalId,
    connector: connectorId,
    nonce: crypto.randomUUID(),
    exp: now + (ctx.stateTtlMs ?? 600_000),
  };
  const state = await signState(payload, ctx.secret);
  const url = `${ctx.startUrlBase}/${encodeURIComponent(connectorId)}/start?state=${encodeURIComponent(state)}`;
  return { authorizationRequired: { url } };
}
