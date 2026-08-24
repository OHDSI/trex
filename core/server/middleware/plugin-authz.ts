import type { Request, Response, NextFunction } from "express";
import { ROLE_SCOPES, REQUIRED_URL_SCOPES, SERVICE_CLIENT_ROLES } from "../plugin/function.ts";
import { extractToken, verifyIdpToken } from "../d2e-compat/auth.ts";
import { type D2eIdp, d2eIdp, isSystemAdminClaims } from "../d2e-compat/idp.ts";
import { fetchUserGroups } from "../d2e-compat/lib/usermgmt.ts";

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

// authz-public: a valid token is REQUIRED but no scope is enforced. From old main's
// authz_publicURLs = publicURLs + these — shared bootstrap endpoints every signed-in
// user hits regardless of role.
const D2E_AUTHZ_PUBLIC_PATTERNS: RegExp[] = [
  /^\/usermgmt\/api\/user-group\/list$/,
];

// The d2e Logto token carries only coarse `roles` (Logto scope names, e.g.
// role.systemadmin / role.researcher.<dataset>) — NOT the userMgmtGroups the
// role/URL scope check needs. So the caller's role set is assembled from two
// sources, exactly as old main's authz did:
//   1. the token's `roles` claim (system-admin, M2M scopes, dataset-researcher);
//   2. userMgmtGroups (alp_role_* flags) fetched per-request from usermgmt and
//      mapped to the RBAC role names ROLE_SCOPES is keyed on.

// Roles carried directly on the token. For M2M/service tokens the granted scopes
// ARE the roles (old main's adUser), so the sub is included — plus the plugin role
// registered for that client id, since manifests declare M2M grants under the env
// var name holding the id, never the id itself (SERVICE_CLIENT_ROLES).
function tokenRoles(payload: Record<string, unknown>): string[] {
  const roles: string[] = [];
  const rawRoles = payload["roles"];
  if (Array.isArray(rawRoles)) roles.push(...(rawRoles as string[]));
  const sub = payload["sub"] as string | undefined;
  if (isServiceToken(payload)) {
    const clientId = payload["client_id"] as string | undefined;
    for (const id of [sub, clientId]) {
      if (!id) continue;
      if (!roles.includes(id)) roles.push(id);
      const clientRole = SERVICE_CLIENT_ROLES[id];
      if (clientRole && !roles.includes(clientRole)) roles.push(clientRole);
    }
  }
  return roles;
}

function isServiceToken(payload: Record<string, unknown>): boolean {
  const sub = payload["sub"] as string | undefined;
  const clientId = payload["client_id"] as string | undefined;
  return payload["grant_type"] === "client_credentials" || (!!sub && sub === clientId);
}

// Map d2e userMgmtGroups (alp_role_* flags) → RBAC role names that key into
// ROLE_SCOPES — ported from d2e authz.ts buildUserFromToken.
function rolesFromGroups(g: Record<string, unknown>): string[] {
  const nonEmptyArr = (v: unknown): boolean => Array.isArray(v) && v.length > 0;
  const roles: string[] = [];
  if (g["alp_role_user_admin"] === true) roles.push("ALP_USER_ADMIN");
  if (g["alp_role_system_admin"] === true) roles.push("ALP_SYSTEM_ADMIN");
  if (g["alp_role_dashboard_viewer"] === true) roles.push("ALP_DASHBOARD_VIEWER");
  if (g["alp_role_study_write_dqd_researcher"] === true) roles.push("STUDY_WRITE_DQD_RESEARCHER");
  if (g["alp_role_study_results_read_researcher"] === true) roles.push("STUDY_RESULTS_READ_RESEARCHER");
  if (nonEmptyArr(g["alp_role_tenant_viewer"])) roles.push("TENANT_VIEWER");
  if (g["alp_role_etl_mapping_contributor"] === true) roles.push("ETL_MAPPING_CONTRIBUTOR");
  if (nonEmptyArr(g["alp_role_study_researcher"])) roles.push("RESEARCHER");
  return roles;
}

/**
 * Authentication + central authorization gate for d2e (non-@trex) plugin worker
 * routes — a port of d2e's pre-migration authn.ts + authz.ts.
 *
 * The new core forwards d2e-plugin requests straight to workers that only
 * `jwt.decode()` the bearer token (never verify its signature), so without this
 * gate a forged JWT is fully trusted. trex verifies the Logto JWT and enforces the
 * role/URL scope check centrally (as old main did) before the worker runs.
 *
 *  - authn-public path      → pass, no token (old main publicURLs).
 *  - Missing/invalid token  → 401 (signature + expiry; aud/iss skipped, per old main).
 *  - System admin           → pass.
 *  - authz-public path      → pass, token required but no scope (authz_publicURLs).
 *  - No governing policy    → 403 (old main returned 404: a route absent from the
 *                             scope table is denied, NOT open to any authenticated user).
 *  - Else                   → pick the FIRST REQUIRED_URL_SCOPES entry matching path
 *                             AND method, resolve the caller's roles (token `roles` +
 *                             userMgmtGroups fetched from usermgmt, as old main did),
 *                             and require ALL of that entry's scopes; 403 otherwise.
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

  const payload = await verifyIdpToken(token);
  if (!payload) {
    res.status(401).send("Authentication Token not valid");
    return;
  }
  (req as any).logtoSubject = (payload["sub"] as string | undefined) ?? null;

  const roles = tokenRoles(payload);
  // Also the fallback for the role resolution further down: when the token
  // already carries userMgmtGroups there is no need to call usermgmt for them.
  const tokenGroups = payload["userMgmtGroups"] as Record<string, unknown> | undefined;

  // System admins pass (parity with pluginAuthz's admin bypass). The claim shape
  // depends on the IdP — see isSystemAdminClaims. d2eIdp throws on an
  // unrecognised D2E_IDP; this handler is async, so an uncaught throw would be an
  // unhandled rejection rather than a response.
  let idp: D2eIdp;
  try {
    idp = d2eIdp(Deno.env.toObject());
  } catch (err) {
    console.error(`[d2e-compat] d2eAuthn: IdP config invalid: ${err}`);
    res.status(500).json({ error: "Auth configuration error" });
    return;
  }
  if (isSystemAdminClaims(payload, idp)) {
    next();
    return;
  }

  // authz-public: valid token, no scope check (old main authz_publicURLs).
  if (D2E_AUTHZ_PUBLIC_PATTERNS.some((re) => re.test(path))) {
    next();
    return;
  }

  // Select the governing policy exactly as old main's authz did: the FIRST
  // REQUIRED_URL_SCOPES entry whose path regex matches AND whose httpMethods (when
  // declared) include this request's method. Method matters — most entries are
  // method-scoped (e.g. GET→read vs POST→execute on the same path), so ignoring it
  // would let a read scope satisfy a write/execute route. No governing entry → deny
  // (old main returned 404 for a route not in its scope table); never fall through
  // to "any authenticated user".
  const method = req.method;
  const match = REQUIRED_URL_SCOPES.find(
    (entry) =>
      new RegExp(entry.path).test(path) &&
      (!entry.httpMethods || entry.httpMethods.includes(method)),
  );
  if (!match) {
    res.status(403).json({ error: "Forbidden: no authorization policy for route" });
    return;
  }

  // Resolve the caller's full role set. The token does NOT carry userMgmtGroups, so
  // regular users need them fetched from usermgmt (cached by jti), exactly as old
  // main's authz did. Service/M2M tokens already carry their scopes as roles.
  if (!isServiceToken(payload)) {
    const sub = payload["sub"] as string | undefined;
    const idpUserId = (payload["oid"] as string | undefined) || sub || "";
    const jti = typeof payload["jti"] === "string" ? (payload["jti"] as string) : undefined;
    const exp = typeof payload["exp"] === "number" ? (payload["exp"] as number) : undefined;
    const groups = tokenGroups ?? (await fetchUserGroups(token, idpUserId, jti, exp));
    if (!groups) {
      res.status(403).json({ error: "Forbidden: could not resolve user roles" });
      return;
    }
    roles.push(...rolesFromGroups(groups));
  }

  const userScopes = new Set<string>();
  for (const role of roles) {
    for (const scope of ROLE_SCOPES[role] ?? []) userScopes.add(scope);
  }
  // Old main required ALL of the matched entry's scopes (hasRequiredScopes = every),
  // not any — e.g. an entry of [strategus.results.admin.upload, portal.dataset.read]
  // demands both. `.some` here would grant access to callers holding only the weaker
  // secondary scope.
  if (match.scopes.every((scope) => userScopes.has(scope))) {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden: insufficient scopes" });
};
