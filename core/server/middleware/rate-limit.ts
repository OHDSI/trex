import rateLimit from "express-rate-limit";

/** Strict limiter for authentication endpoints (signup, token). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/** General API limiter for all other endpoints.
 *
 * Static assets are skipped: a single Studio page-load pulls hundreds of
 * Next.js chunks, Monaco-editor files, fonts, CSS, and SVGs in seconds,
 * which would otherwise blow the budget on the first visit and 429
 * everything for 15 minutes.
 */
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
