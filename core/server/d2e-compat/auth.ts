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
import { createRemoteJWKSet, jwtVerify } from "npm:jose";
import { getWebApiToken, getTokenSubject } from "./lib/token-exchange.ts";

// Lazily initialised so Deno.env is read at first request (D2E_COMPAT path only).
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

function extractToken(req: import("express").Request): string | null {
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
      } else if (cookie.startsWith("fhirtoken=")) {
        const val = cookie.slice("fhirtoken=".length).trim();
        return val.split(" ")[1] || null;
      }
    }
  }

  return null;
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
