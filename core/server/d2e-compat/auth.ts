/**
 * Bearer-token authn middleware for d2e-compat Express routes.
 *
 * The IdP is selectable (D2E_IDP: `logto` — the default — or `trex`); see
 * idp.ts. Everything below reads the resolved config rather than LOGTO__*
 * directly, so pointing d2e at trex's own OIDC provider is a config change.
 *
 * Ported from d2e services/trex/core/server/auth/authn.ts (Hono → Express).
 * Adaptations:
 *  - Hono `c.set/c.get` → `(req as any).webApiToken` / `(req as any).logtoSubject`
 *  - Hono `c.req.header(...)` / `c.req.path` → Express `req.headers` / `req.path`
 *  - Hono `new Response(...)` returns → Express `res.status(...).send/json(...)` + `return`
 *  - Env vars read directly from `Deno.env` using the exact names from d2e env.ts:
 *      LOGTO__ISSUER  (env.LOGTO_ISSUER = _env.LOGTO__ISSUER)
 */
import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "npm:jose";
import type { JWTVerifyOptions } from "npm:jose";
import { getWebApiToken, getTokenSubject } from "./lib/token-exchange.ts";
import { type D2eIdp, isSystemAdminClaims, resolveIdpConfig } from "./idp.ts";

// Lazily initialised so Deno.env is read at first request (D2E_COMPAT path only).
// Both `requireAdmin` and `logtoAuthn` share this module-level singleton, keyed
// on the resolved IdP config at first use.
let _JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!_JWKS) {
    const { idp, jwksUri } = resolveIdpConfig(Deno.env.toObject());
    if (!jwksUri) {
      throw new Error(
        idp === "trex"
          ? "[d2e-compat] TREX_OIDC_ISSUER env var is not set"
          : "[d2e-compat] LOGTO__ISSUER env var is not set",
      );
    }
    _JWKS = createRemoteJWKSet(new URL(jwksUri));
  }
  return _JWKS;
}

// Asymmetric algorithms only. Pinning the accepted set rejects `alg:none` and
// any HMAC (`HS*`) token up front, closing the classic algorithm-confusion
// bypass where an attacker re-signs with the public key as an HMAC secret.
const ACCEPTED_ALGS = [
  "RS256", "RS384", "RS512",
  "PS256", "PS384", "PS512",
  "ES256", "ES384", "ES512",
  "EdDSA",
];

// Build the jose verification options from the resolved IdP config: the token's
// `iss` must equal the configured issuer and, when an audience is configured,
// its `aud` must be one of them. Without these checks any token signed by that
// IdP — issued for a different app or API resource — is accepted, which is a
// cross-audience/issuer authentication bypass.
export function idpVerifyOptions(
  env: Record<string, string | undefined> = Deno.env.toObject(),
): JWTVerifyOptions {
  const opts: JWTVerifyOptions = { algorithms: ACCEPTED_ALGS };
  const { issuer, audiences } = resolveIdpConfig(env);
  if (issuer) opts.issuer = issuer;
  if (audiences.length === 1) opts.audience = audiences[0];
  else if (audiences.length > 1) opts.audience = audiences;
  return opts;
}

export function extractToken(req: import("express").Request): string | null {
  const regex = /\b(Bearer|bearer|token)\b/;

  const authHeader = req.headers.authorization as string | undefined;

  if (authHeader && authHeader.split(" ")[0].match(regex)) {
    return authHeader.split(" ")[1] || null;
  }

  const cookieHeader = req.headers.cookie as string | undefined;
  if (cookieHeader) {
    const cookies = cookieHeader.split("; ");
    for (const cookie of cookies) {
      if (cookie.startsWith("authtoken=")) {
        return cookie.slice("authtoken=".length).trim();
      }
    }
  }

  return null;
}

/**
 * Verify a JWT from the selected IdP (signature, expiry, issuer, audience, and a
 * pinned set of asymmetric algorithms) and return its decoded claims, or null if
 * the token is missing or invalid. Shared by the d2e plugin auth gate.
 */
export async function verifyIdpToken(
  token: string | null,
): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    await jwtVerify(token, getJWKS(), idpVerifyOptions());
    return decodeJwt(token) as Record<string, unknown>;
  } catch (err) {
    console.error(`[d2e-compat] verifyIdpToken: invalid token: ${err}`);
    return null;
  }
}

/**
 * OPTIONAL auth — requests with NO token pass through unauthenticated (so
 * WebAPI can serve its anonymous endpoints); requests with an INVALID token
 * are rejected 401.  Do NOT use this alone to protect admin-only routes —
 * those need an explicit authenticated-user check.
 *
 * Express middleware that validates a Logto Bearer JWT, performs the WebAPI
 * token exchange, and sets `req.webApiToken` + `req.logtoSubject` on success.
 *
 * Unlike the full d2e `authn` middleware this variant is mounted ONLY on
 * `/WebAPI/*` routes, so:
 *  - No token → pass through (let WebAPI itself reject unauthenticated callers).
 *  - Invalid token → 401.
 *  - Token exchange failure → 401.
 *  - Success → sets webApiToken/logtoSubject and calls next().
 */
export const logtoAuthn: RequestHandler = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    // No token present — pass through; WebAPI will reject if auth is required.
    next();
    return;
  }

  let jwks: ReturnType<typeof createRemoteJWKSet>;
  try {
    jwks = getJWKS();
  } catch (err) {
    console.error(`[d2e-compat] authn: JWKS init failed: ${err}`);
    res.status(500).json({ error: "Auth configuration error" });
    return;
  }

  try {
    await jwtVerify(token, jwks, idpVerifyOptions());
  } catch (err) {
    console.error(`[d2e-compat] authn: invalid token: ${err}`);
    res.status(401).send("Authentication Token not valid");
    return;
  }

  const webApiToken = await getWebApiToken(token);
  if (!webApiToken) {
    console.error("[d2e-compat] authn: token exchange failed");
    res.status(401).json({ error: "Token exchange failed" });
    return;
  }

  (req as any).webApiToken = webApiToken;
  (req as any).logtoSubject = getTokenSubject(token);
  next();
};

// ---------------------------------------------------------------------------
// requireAdmin — minimal admin gate for D2E_COMPAT thin-shell routes.
//
// Minimal admin gate for D2E_COMPAT thin-shell routes; full authz scope parity
// is deferred to the parity phase.
//
// How "admin" is derived (from d2e services/trex/core/server/auth/authz.ts):
//  1. The per-IdP system-admin claim shapes — see isSystemAdminClaims in idp.ts.
//  2. Service-account / client-credentials tokens (grant_type === "client_credentials"
//     OR sub === client_id) are also treated as admin in d2e.
//  Both cases are checked here. All other tokens are rejected 403.
// ---------------------------------------------------------------------------

/**
 * ADMIN-ONLY middleware — unlike logtoAuthn, a missing token is ALWAYS a 401.
 *
 * Env vars consumed: D2E_IDP selects the provider; the issuer/JWKS/audience
 * come from it (LOGTO__ISSUER for the default Logto, TREX_OIDC_ISSUER for trex).
 */
export const requireAdmin: RequestHandler = async (req: any, res: any, next: any) => {
  const token = extractToken(req);

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let jwks: ReturnType<typeof createRemoteJWKSet>;
  try {
    jwks = getJWKS();
  } catch (err) {
    console.error(`[d2e-compat] requireAdmin: JWKS init failed: ${err}`);
    res.status(500).json({ error: "Auth configuration error" });
    return;
  }

  // Verify the JWT signature, expiry, issuer, audience, and algorithm.
  try {
    await jwtVerify(token, jwks, idpVerifyOptions());
  } catch (err) {
    console.error(`[d2e-compat] requireAdmin: invalid token: ${err}`);
    res.status(401).send("Authentication Token not valid");
    return;
  }

  // Decode claims (signature already verified above).
  let payload: ReturnType<typeof decodeJwt>;
  try {
    payload = decodeJwt(token);
  } catch (err) {
    console.error(`[d2e-compat] requireAdmin: decodeJwt failed: ${err}`);
    res.status(401).send("Invalid token payload");
    return;
  }

  // Check admin status: service-account OR a system-admin claim.
  const grantType = payload["grant_type"] as string | undefined;
  const sub = payload["sub"] as string | undefined;
  const clientId = payload["client_id"] as string | undefined;
  const isClientCred = grantType === "client_credentials" || (!!sub && sub === clientId);

  // Claim shapes differ per IdP — see isSystemAdminClaims.
  let idp: D2eIdp;
  try {
    idp = resolveIdpConfig(Deno.env.toObject()).idp;
  } catch (err) {
    console.error(`[d2e-compat] requireAdmin: IdP config invalid: ${err}`);
    res.status(500).json({ error: "Auth configuration error" });
    return;
  }
  const isSystemAdmin = isSystemAdminClaims(payload as Record<string, unknown>, idp);

  if (!isClientCred && !isSystemAdmin) {
    console.warn(`[d2e-compat] requireAdmin: forbidden — not system admin (sub=${sub})`);
    res.status(403).json({ error: "Forbidden: admin role required" });
    return;
  }

  (req as any).logtoSubject = sub ?? null;
  // Stash the full verified claims so downstream handlers (e.g. /trex/log) can
  // derive IdP identity without re-verifying or re-fetching the token.
  (req as any).logtoPayload = payload;
  next();
};
