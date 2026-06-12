// @ts-nocheck - Deno edge function

import { ResourceRegistry } from "./fhir/resource_registry.ts";
import { SearchParamRegistry } from "./fhir/search_parameter.ts";

export interface AppState {
  registry: ResourceRegistry;
  searchParams: SearchParamRegistry;
  dbName: string;
}

let cached: Promise<AppState> | null = null;

export function getState(): Promise<AppState> {
  if (cached === null) {
    cached = (async (): Promise<AppState> => {
      const [registry, searchParams] = await Promise.all([
        ResourceRegistry.loadDefault(),
        SearchParamRegistry.loadDefault(),
      ]);
      const dbName = Deno.env.get("FHIR_DB_NAME") ?? "memory";
      return { registry, searchParams, dbName };
    })();
  }
  return cached;
}

/**
 * The URL prefix this worker is mounted at, derived from the incoming request.
 *
 * The runtime mounts a function plugin at `${PLUGINS_BASE_PATH}${scope}/${source}`,
 * e.g. `/plugins/trex/fhir` or `/trex/fhir` depending on deployment config, and
 * forwards the FULL original path to the worker. We therefore can't assume a
 * fixed prefix: prefer an explicit `FHIR_BASE_PATH`, otherwise strip up to and
 * including the first `/fhir` source segment (works under any PLUGINS_BASE_PATH).
 */
export function mountPrefix(pathname: string): string {
  const base = Deno.env.get("FHIR_BASE_PATH");
  if (base && (pathname === base || pathname.startsWith(base + "/"))) return base;
  const m = pathname.match(/^(?:\/[^/]+)*?\/fhir(?=\/|$)/);
  return m ? m[0] : "";
}

/** Strip the mount prefix, returning the FHIR sub-path (always starts with "/"). */
export function stripMount(pathname: string): string {
  return pathname.slice(mountPrefix(pathname).length) || "/";
}

export function externalBase(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}${mountPrefix(url.pathname)}`;
}
