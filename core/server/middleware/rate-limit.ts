import rateLimit from "express-rate-limit";
import { isServiceRoleBearer } from "./service-role-skip.ts";

/**
 * Limiter for authentication endpoints (signup, token).
 *
 * The bucket is per IP, and an IP is not a user: everyone reaching trex through
 * one NAT gateway or one CI runner shares a bucket, so a limit sized for a
 * single attacker locks out an entire site once the password grant is the
 * deployment's ordinary sign-in path rather than something only a script uses.
 *
 * One sign-in spends more than one request - the password grant, then the
 * authorization code exchange - so the ceiling has to cover a site's combined
 * traffic rather than its headcount. It still bounds brute force well below
 * what an offline attack achieves, and a deployment that fronts trex with its
 * own protection can set its own number.
 */
export const authRateLimitMax = (
  raw: string | undefined = Deno.env.get("TREX_AUTH_RATE_LIMIT_MAX"),
): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 600;
};

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: authRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
});

/** General API limiter — skips static assets so a single Studio page-load doesn't 429. */
const STATIC_ASSET_RE = /\.(?:js|mjs|css|map|svg|png|jpg|jpeg|gif|webp|woff2?|ttf|ico|json|wasm)$/i;
const STATIC_PATH_RE = /\/(?:_next\/static|monaco-editor|favicon|img|assets|build)\//i;

/**
 * Ceiling for the general API limiter, and for adminLimiter, which is the same
 * bucket.
 *
 * Same reasoning as authRateLimitMax: the bucket is per IP, so everyone behind
 * one NAT gateway, one CI runner or one embedding portal shares it. What makes
 * 5000/15min too low is that it is also shared across every route a single page
 * uses, and a data-heavy page is not one request — d2e's filtering-barchart
 * issues over 10,000 XHRs for one shard, which exhausts the bucket on its own
 * and then 429s every other caller from that IP for the rest of the window.
 *
 * Raising the default for everyone would weaken a limit that is doing its job
 * for ordinary traffic, so this is the same escape hatch authLimiter already
 * has: deployments that front trex with their own protection, or that serve a
 * page like that one, set their own number.
 */
export const apiRateLimitMax = (
  raw: string | undefined = Deno.env.get("TREX_API_RATE_LIMIT_MAX"),
): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 5000;
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: apiRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    (req.method === "GET" || req.method === "HEAD") &&
    (STATIC_ASSET_RE.test(req.path) || STATIC_PATH_RE.test(req.path)),
});

/**
 * apiLimiter's bucket (5000 req/15min by default, TREX_API_RATE_LIMIT_MAX) is
 * shared per IP across ~61 routes. The
 * federation and roles admin routers (/trex/admin/federation, /trex/admin/roles)
 * are also called by service-role scripts doing bulk work in-process — an
 * identity migration issues one PUT /links plus one POST /assign per user, all
 * from the same IP — and can trip that shared bucket partway through, 429ing
 * the rest of the migration and throttling every other caller sharing the IP.
 *
 * adminLimiter is the same bucket (same window/max) except it skips a request
 * whose bearer verifies as trex's service_role token (isServiceRoleBearer,
 * service-role-skip.ts). Every other caller, including an admin's own bearer,
 * is limited exactly as before.
 *
 * express-rate-limit's `skip` option accepts an async predicate
 * (ValueDeterminingMiddleware<boolean> = (req, res) => boolean | Promise<boolean>,
 * true since v6, and true of the ^7.5.0 pinned in package.json) so verifying
 * the token here is safe to await.
 */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: apiRateLimitMax(),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isServiceRoleBearer(req.headers.authorization),
});
