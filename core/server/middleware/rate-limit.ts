import rateLimit from "express-rate-limit";

/**
 * Limiter for authentication endpoints (signup, token).
 *
 * The bucket is per IP, and an IP is not a user: everyone reaching trex through
 * one NAT gateway or one CI runner shares a bucket, so a limit sized for a
 * single attacker locks out an entire site once the password grant is the
 * deployment's ordinary sign-in path rather than something only a script uses.
 * The ceiling still bounds brute force at a few hundred attempts an hour, and a
 * deployment that fronts trex with its own protection can set its own number.
 */
const authRateLimitMax = (raw: string | undefined = Deno.env.get("TREX_AUTH_RATE_LIMIT_MAX")): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 100;
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

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) =>
    (req.method === "GET" || req.method === "HEAD") &&
    (STATIC_ASSET_RE.test(req.path) || STATIC_PATH_RE.test(req.path)),
});
