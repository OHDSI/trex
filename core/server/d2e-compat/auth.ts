/**
 * Logto authn middleware for d2e-compat Express routes.
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
import { getWebApiToken, getTokenSubject } from "./lib/token-exchange.ts";

// Lazily initialised so Deno.env is read at first request (D2E_COMPAT path only).
// Both `requireAdmin` and `logtoAuthn` share this module-level singleton, keyed on LOGTO__ISSUER at first use.
let _JWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!_JWKS) {
    const issuer = Deno.env.get("LOGTO__ISSUER");
    if (!issuer) {
      throw new Error("[d2e-compat] LOGTO__ISSUER env var is not set");
    }
    _JWKS = createRemoteJWKSet(new URL(`${issuer}/jwks`));
  }
  return _JWKS;
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
 * Verify a Logto JWT (signature + expiry only — matching old main's authn.ts,
 * which did NOT validate audience/issuer) and return its decoded claims, or
 * null if the token is missing or invalid. Shared by the d2e plugin auth gate.
 */
export async function verifyLogtoToken(
  token: string | null,
): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  try {
    await jwtVerify(token, getJWKS());
    return decodeJwt(token) as Record<string, unknown>;
  } catch (err) {
    console.error(`[d2e-compat] verifyLogtoToken: invalid Logto token: ${err}`);
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
    await jwtVerify(token, jwks);
  } catch (err) {
    console.error(`[d2e-compat] authn: invalid Logto token: ${err}`);
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
//  1. The Logto JWT payload carries `userMgmtGroups.alp_role_system_admin: boolean`.
//     When true the user has `ALP_SYSTEM_ADMIN` role — this is the system-admin flag.
//  2. Service-account / client-credentials tokens (grant_type === "client_credentials"
//     OR sub === client_id) are also treated as admin in d2e.
//  Both cases are checked here. All other tokens are rejected 403.
// ---------------------------------------------------------------------------

/**
 * ADMIN-ONLY middleware — unlike logtoAuthn, a missing token is ALWAYS a 401.
 *
 * Env vars consumed (same names as d2e env.ts):
 *   LOGTO__ISSUER — the Logto issuer URL used to fetch the JWKS for verification.
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

  // Verify the JWT signature and expiry.
  try {
    await jwtVerify(token, jwks);
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

  // Check admin status: service-account OR alp_role_system_admin flag.
  const grantType = payload["grant_type"] as string | undefined;
  const sub = payload["sub"] as string | undefined;
  const clientId = payload["client_id"] as string | undefined;
  const isClientCred = grantType === "client_credentials" || (!!sub && sub === clientId);

  // Two token shapes carry system-admin status depending on the Logto custom-JWT
  // build: (a) the legacy `userMgmtGroups.alp_role_system_admin` boolean, and
  // (b) this stack's `roles` array containing `role.systemadmin` (LOGTO_ROLES.
  // SYSTEM_ADMIN — the same claim usermgmt's getUserGroupsMetadataFromLogto reads).
  // Accept either so the admin gate matches however the IdP issued the token.
  const userMgmtGroups = payload["userMgmtGroups"] as Record<string, unknown> | undefined;
  const roles = payload["roles"];
  const hasSystemAdminRole = Array.isArray(roles) && roles.includes("role.systemadmin");
  const isSystemAdmin = userMgmtGroups?.["alp_role_system_admin"] === true ||
    hasSystemAdminRole;

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
