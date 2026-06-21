import type { Express } from "express";

export const D2E_COMPAT = Deno.env.get("D2E_COMPAT") === "true";

/** d2e base path that the front-end/caddy prefix onto every request. */
const D2E_BASE = (Deno.env.get("D2E_BASE_PATH") || "/d2e").replace(/\/+$/, "");

/**
 * Early middleware: strip the d2e base prefix (`/d2e/...` -> `/...`) so trex's
 * routes and the root-mounted d2e plugin routes (/portal, /WebAPI, /analytics-svc)
 * match. The d2e Hono fork did this in its Hono `getPath`; trex's Express main
 * needs it as the FIRST middleware (before any route is registered). No-op unless
 * D2E_COMPAT. Rewrites both `url` and `originalUrl` so downstream proxies that read
 * either see the unprefixed path.
 */
export function applyD2eCompatEarly(app: Express): void {
  if (!D2E_COMPAT) return;
  const strip = (u: string): string => {
    if (u === D2E_BASE || u === `${D2E_BASE}/`) return "/";
    if (u.startsWith(`${D2E_BASE}/`)) return u.slice(D2E_BASE.length);
    return u;
  };
  app.use((req, _res, next) => {
    req.url = strip(req.url);
    if (req.originalUrl) (req as { originalUrl: string }).originalUrl = strip(req.originalUrl);
    next();
  });
}

/** Boot-time DuckDB/native side-effects (webapi, fhir, attaches). No-op unless D2E_COMPAT.
 *  A boot failure (e.g. a missing DuckDB extension on a given arch) must NEVER take
 *  down trex's main worker — the server must still come up and serve. So the whole
 *  boot is guarded here in addition to each block's own try/catch. */
export async function runD2eBoot(): Promise<void> {
  if (!D2E_COMPAT) return;
  try {
    const { d2eBoot } = await import("./boot.ts");
    await d2eBoot();
  } catch (e) {
    console.error("[d2e-compat] boot failed (continuing without it):", (e as Error)?.message ?? e);
  }
}

/** Mounts d2e-only Express routes. No-op unless D2E_COMPAT. */
// Awaited so routes are registered before the server starts listening.
export async function applyD2eCompat(app: Express): Promise<void> {
  if (!D2E_COMPAT) return;
  const m = await import("./routes.ts");
  m.mountD2eRoutes(app);
}
