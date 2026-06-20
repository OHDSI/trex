import type { Express } from "express";

export const D2E_COMPAT = Deno.env.get("D2E_COMPAT") === "true";

/** Boot-time DuckDB/native side-effects (webapi, fhir, attaches). No-op unless D2E_COMPAT. */
export async function runD2eBoot(): Promise<void> {
  if (!D2E_COMPAT) return;
  const { d2eBoot } = await import("./boot.ts");
  await d2eBoot();
}

/** Mounts d2e-only Express routes. No-op unless D2E_COMPAT. */
export function applyD2eCompat(app: Express): void {
  if (!D2E_COMPAT) return;
  // Dynamic import kept sync-safe: registration runs synchronously at boot.
  import("./routes.ts").then((m) => m.mountD2eRoutes(app));
}
