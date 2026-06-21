import type { Express } from "express";

export const D2E_COMPAT = Deno.env.get("D2E_COMPAT") === "true";

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
