// @ts-nocheck - Deno edge function
// Port of plugins/fhir/src/fhir/bundle_processor.rs

export interface ProcessedEntry {
  resource: any;
  resourceType: string;
  serverId: string;
  method: string;
  requestUrl: string | undefined;
}

/**
 * Parse a FHIR request URL like "Patient/123" into [resourceType, id].
 * Returns undefined if the url doesn't have exactly two non-empty parts.
 * Mirrors Rust: parse_request_url
 */
function parseRequestUrl(url: string): [string, string] | undefined {
  const idx = url.indexOf("/");
  if (idx < 1) return undefined;
  const resourceType = url.slice(0, idx);
  const id = url.slice(idx + 1);
  if (id.length === 0) return undefined;
  return [resourceType, id];
}

/**
 * Recursively resolve urn:uuid: references in a resource JSON value.
 * Mirrors Rust: resolve_references
 */
function resolveReferences(value: any, refMap: Map<string, string>): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) {
      resolveReferences(item, refMap);
    }
    return;
  }
  // Object
  if (typeof value.reference === "string") {
    const resolved = refMap.get(value.reference);
    if (resolved !== undefined) {
      value.reference = resolved;
    }
  }
  for (const v of Object.values(value)) {
    resolveReferences(v, refMap);
  }
}

/**
 * Process bundle entries, resolving urn:uuid references and assigning server IDs.
 * Mirrors Rust: process_bundle_entries
 * Throws a string error message on invalid input (Rust returns Result<_, String>).
 */
export function processBundleEntries(
  bundle: any,
  maxEntries: number,
): ProcessedEntry[] {
  const entries: any[] = bundle?.entry;
  if (!Array.isArray(entries)) {
    throw new Error("Bundle missing 'entry' array");
  }

  if (entries.length === 0) {
    return [];
  }

  if (entries.length > maxEntries) {
    throw new Error(
      `Bundle exceeds maximum entry count: ${entries.length} > ${maxEntries}`,
    );
  }

  const processed: ProcessedEntry[] = [];
  const refMap: Map<string, string> = new Map();

  for (const entry of entries) {
    const resource = entry?.resource;
    if (resource === undefined || resource === null) {
      throw new Error("Bundle entry missing 'resource'");
    }
    const resourceClone = JSON.parse(JSON.stringify(resource));

    const resourceType: string | undefined = resourceClone?.resourceType;
    if (typeof resourceType !== "string" || resourceType.length === 0) {
      throw new Error("Bundle entry resource missing 'resourceType'");
    }

    const method: string = (
      entry?.request?.method ?? "POST"
    ).toString().toUpperCase();

    const requestUrl: string | undefined =
      typeof entry?.request?.url === "string"
        ? entry.request.url
        : undefined;

    let serverId: string;
    if (method === "PUT" || method === "DELETE") {
      // For PUT/DELETE: try to parse id from request.url first
      const parsed = requestUrl !== undefined
        ? parseRequestUrl(requestUrl)
        : undefined;
      if (parsed !== undefined) {
        serverId = parsed[1];
      } else {
        // Fall back to resource.id
        const rid = resourceClone?.id;
        serverId = typeof rid === "string" && rid.length > 0
          ? rid
          : crypto.randomUUID();
      }
    } else {
      // POST (and anything else): always generate a fresh UUID
      serverId = crypto.randomUUID();
    }

    // Register urn:uuid: fullUrl in the ref map before resolving
    const fullUrl: string | undefined =
      typeof entry?.fullUrl === "string" ? entry.fullUrl : undefined;
    if (fullUrl !== undefined && fullUrl.startsWith("urn:uuid:")) {
      const serverRef = `${resourceType}/${serverId}`;
      refMap.set(fullUrl, serverRef);
    }

    processed.push({
      resource: resourceClone,
      resourceType,
      serverId,
      method,
      requestUrl,
    });
  }

  // Second pass: resolve all urn:uuid: references
  for (const entry of processed) {
    resolveReferences(entry.resource, refMap);
  }

  return processed;
}
