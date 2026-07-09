import type { Request, Response, NextFunction } from "express";
import { ROLE_SCOPES, REQUIRED_URL_SCOPES } from "../plugin/function.ts";
import { extractToken, verifyLogtoToken } from "../d2e-compat/auth.ts";

export function pluginAuthz(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const pgSettings = (req as any).pgSettings || {};
  const platformRole = pgSettings["app.user_role"];

  // Admin platform role bypasses scope checks
  if (platformRole === "admin") {
    return next();
  }

  if (!pgSettings["app.user_id"]) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const requestPath = req.originalUrl || req.path;
  const requiredScopes: string[] = [];
  for (const entry of REQUIRED_URL_SCOPES) {
    if (new RegExp(entry.path).test(requestPath)) {
      requiredScopes.push(...entry.scopes);
    }
  }

  if (requiredScopes.length === 0) {
    return next();
  }

  const applicationRoles: string[] = (req as any).applicationRoles || [];
  const userScopes = new Set<string>();
  for (const roleName of applicationRoles) {
    const scopes = ROLE_SCOPES[roleName];
    if (scopes) {
      for (const scope of scopes) {
        userScopes.add(scope);
      }
    }
  }

  const hasScope = requiredScopes.some((scope) => userScopes.has(scope));
  if (!hasScope) {
    res.status(403).json({ error: "Forbidden: insufficient scopes" });
    return;
  }

  next();
}

// Public d2e plugin worker paths reachable WITHOUT a token — the worker-route
// subset of d2e's authn/authz publicURLs (services/trex/core/server/env.ts).
// d2eAuthn runs only on d2e plugin worker routes, so that list's non-worker
// entries (oidc/static/sign-in/callback) are irrelevant here and omitted.
const D2E_PUBLIC_URL_PATTERNS: RegExp[] = [
  /^\/portalsvc\/public-graphql$/,
  /^\/usermgmt\/api\/user-group\/public$/,
  /^\/system-portal\/dataset\/public\/list$/,
  /^\/system-portal\/feature\/list$/,
  /^\/system-portal\/config\/public\/types.*$/,
  /^\/system-portal\/config\/public\/overview-description$/,
  /^\/system-portal\/config\/public\/header-image$/,
  /^\/analytics-svc\/api\/services\/public/,
  /^\/fhir-gateway\/healthcheck$/,
  /^\/gateway\/api\/dataset\/shiny-live\/.*$/,
];

/**
 * Authentication gate for d2e (non-@trex) plugin worker routes.
 *
 * The new core forwards d2e-plugin requests straight to workers that only
 * `jwt.decode()` the bearer token (never verify its signature), so without this
 * gate a forged JWT is fully trusted — an authentication bypass. This middleware
 * verifies the Logto JWT before the request reaches the worker; the worker then
 * applies its own role/scope authz (it resolves the caller's full role set via
 * UserMgmt, which a coarse token claim can't reproduce — see the note below).
 *
 *  - Public path (allowlist) → pass through, no token required.
 *  - Missing/invalid token   → 401 (signature + expiry verified; audience/issuer
 *                              skipped to match old main's jwtVerify).
 *  - Valid token             → set logtoSubject, forward to the worker.
 */
export const d2eAuthn = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const path = (req.path || req.originalUrl || "") as string;

  if (D2E_PUBLIC_URL_PATTERNS.some((re) => re.test(path))) {
    next();
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = await verifyLogtoToken(token);
  if (!payload) {
    res.status(401).send("Authentication Token not valid");
    return;
  }

  // Fine-grained role/URL authz is enforced INSIDE the d2e workers, which resolve
  // the caller's full role/scope set via UserMgmt (as the pre-migration d2e services
  // did). A Logto access token carries only coarse role claims, so enforcing scopes
  // here would 403 legitimate non-admin users on shared bootstrap endpoints — e.g. a
  // Viewer's /usermgmt/api/user-group/list (old main's authz_publicURLs) and
  // /system-portal/config/types. trex's job is to VERIFY the token so the workers can
  // trust the identity they decode; the worker then applies scope authz.
  (req as any).logtoSubject = (payload["sub"] as string | undefined) ?? null;
  next();
};
