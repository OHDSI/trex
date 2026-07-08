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
 * Authentication + authorization gate for d2e (non-@trex) plugin worker routes.
 *
 * Restores the enforcement d2e's own authn.ts + authz.ts performed before the
 * core migration. The new core forwards d2e-plugin requests straight to workers
 * that only `jwt.decode()` the bearer token (never verify its signature), so
 * without this gate a forged JWT is fully trusted — an authentication bypass.
 * Here trex verifies the Logto JWT and enforces the role/URL scope check before
 * the request reaches the worker.
 *
 *  - Public path (allowlist) → pass through, no token required.
 *  - Missing/invalid token   → 401 (signature + expiry verified; audience/issuer
 *                              skipped to match old main's jwtVerify).
 *  - System admin            → pass (parity with pluginAuthz's admin bypass).
 *  - Else                    → URL→scope RBAC via REQUIRED_URL_SCOPES/ROLE_SCOPES
 *                              keyed on the token's verified `roles` claim
 *                              (403 if the required scope is absent).
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

  const roles = Array.isArray(payload["roles"]) ? (payload["roles"] as string[]) : [];
  const userMgmtGroups = payload["userMgmtGroups"] as Record<string, unknown> | undefined;
  const isSystemAdmin = userMgmtGroups?.["alp_role_system_admin"] === true ||
    roles.includes("role.systemadmin");
  (req as any).logtoSubject = (payload["sub"] as string | undefined) ?? null;

  // System admins bypass scope checks (parity with pluginAuthz's admin bypass).
  if (isSystemAdmin) {
    next();
    return;
  }

  // URL → required-scope RBAC — identical logic to pluginAuthz, but keyed on the
  // verified Logto token's roles rather than pgSettings/authContext.
  const requiredScopes: string[] = [];
  for (const entry of REQUIRED_URL_SCOPES) {
    if (new RegExp(entry.path).test(path)) {
      requiredScopes.push(...entry.scopes);
    }
  }
  // No scope requirement for this path — any authenticated user suffices (e.g.
  // /usermgmt/api/user-group/list, in old main's authz_publicURLs but not its
  // authn publicURLs: token required, no specific scope).
  if (requiredScopes.length === 0) {
    next();
    return;
  }

  const userScopes = new Set<string>();
  for (const roleName of roles) {
    for (const scope of ROLE_SCOPES[roleName] ?? []) {
      userScopes.add(scope);
    }
  }
  if (requiredScopes.some((scope) => userScopes.has(scope))) {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden: insufficient scopes" });
};
