// Split out of rate-limit.ts so the skip decision can be unit-tested without
// pulling in express-rate-limit (this file has no express-rate-limit
// dependency, and none of its own transitive imports do either).
import { verifyAccessToken } from "../auth/jwt.ts";

/**
 * True when the request's bearer verifies as trex's service_role token.
 *
 * Used by adminLimiter (rate-limit.ts) to exempt service-role callers from
 * the shared apiLimiter bucket on the federation and roles admin routers: an
 * in-process migration does one PUT /admin/federation/links plus one POST
 * /admin/roles/assign per user, all from a single IP, and would otherwise
 * trip the 5000-req/15min bucket partway through and throttle every other
 * caller sharing that IP (e.g. other localhost callers). Every other
 * caller — including an ordinary admin's own bearer — still counts against
 * the limiter normally; only a verified service_role token is exempt.
 */
export async function isServiceRoleBearer(
  authorizationHeader: string | undefined,
): Promise<boolean> {
  if (!authorizationHeader?.startsWith("Bearer ")) return false;
  const claims = await verifyAccessToken(authorizationHeader.slice(7));
  return claims?.role === "service_role";
}
