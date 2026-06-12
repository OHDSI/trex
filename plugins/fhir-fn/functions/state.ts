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

export function externalBase(req: Request): string {
  return `${new URL(req.url).origin}${Deno.env.get("FHIR_BASE_PATH") ?? "/trex/fhir"}`;
}
