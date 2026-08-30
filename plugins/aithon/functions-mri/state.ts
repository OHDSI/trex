// @ts-nocheck - Deno edge function
import { ResourceRegistry } from "../functions/fhir/resource_registry.ts";

export interface MriState {
  registry: ResourceRegistry;
  dbName: string;
}

let cached: Promise<MriState> | null = null;

export function getMriState(): Promise<MriState> {
  if (cached === null) {
    cached = (async (): Promise<MriState> => {
      const registry = await ResourceRegistry.loadDefault();
      const dbName = Deno.env.get("FHIR_DB_NAME") ?? "memory";
      return { registry, dbName };
    })();
  }
  return cached;
}

/** Strip everything up to and including the "/analytics-svc" mount segment. */
export function stripMriMount(pathname: string): string {
  const m = pathname.match(/^(?:\/[^/]+)*?\/analytics-svc(?=\/|$)/);
  const prefix = m ? m[0] : "";
  return pathname.slice(prefix.length) || "/";
}
