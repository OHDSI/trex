// Ports the MediaHandlerMap side of src/PostgREST/SchemaCache.hs (PostgREST
// v12.2.3): initialMediaHandlers (the overridable builtins) and
// decodeMediaHandlers (the interpretation of the mediaHandlers introspection
// rows into CustomFunc handlers), plus the HM.union that lets custom handlers
// override the initial ones.
//
// Upstream keys the map by (RelIdentifier, MediaType); the TS Map is keyed by
// the string produced by mhKey (toMime is a faithful Eq surrogate — every
// MediaType constructor renders distinctly).

import { decodeMediaType, type MediaType, toMime } from "../parse/media-type.ts";
import type { MediaHandler, ResolvedHandler } from "../plan/types.ts";
import { isAnyElement, type MediaHandlerRow, qiKey, type RelIdentifier, type SchemaCache } from "./types.ts";

/** Ports Routine.hs MediaHandlerMap (keyed by mhKey). */
export type MediaHandlerMap = Map<string, ResolvedHandler>;

/** The Map key for upstream's (RelIdentifier, MediaType) pair. */
export function mhKey(rel: RelIdentifier, mt: MediaType): string {
  return `${rel.kind === "RelAnyElement" ? "*anyelement*" : qiKey(rel.qi)}|${toMime(mt)}`;
}

const relAnyElement: RelIdentifier = { kind: "RelAnyElement" };

function entry(rel: RelIdentifier, mt: MediaType, handler: MediaHandler, resolved: MediaType): [string, ResolvedHandler] {
  return [mhKey(rel, mt), [handler, resolved]];
}

/** Ports SchemaCache.hs initialMediaHandlers. */
export const initialMediaHandlers: MediaHandlerMap = new Map([
  entry(relAnyElement, { kind: "MTAny" }, { kind: "BuiltinOvAggJson" }, { kind: "MTApplicationJSON" }),
  entry(relAnyElement, { kind: "MTApplicationJSON" }, { kind: "BuiltinOvAggJson" }, { kind: "MTApplicationJSON" }),
  entry(relAnyElement, { kind: "MTTextCSV" }, { kind: "BuiltinOvAggCsv" }, { kind: "MTTextCSV" }),
  entry(relAnyElement, { kind: "MTGeoJSON" }, { kind: "BuiltinOvAggGeoJson" }, { kind: "MTGeoJSON" }),
]);

/**
 * Ports SchemaCache.hs decodeMediaHandlers: every introspection row becomes a
 * CustomFunc handler keyed by (target relation | anyelement, media type); the
 * resolved media type differs from the key for the any ("star/star") domain,
 * which the query resolves to application/octet-stream.
 */
export function decodeMediaHandlers(rows: MediaHandlerRow[]): MediaHandlerMap {
  const out: MediaHandlerMap = new Map();
  for (const row of rows) {
    const rel: RelIdentifier = isAnyElement(row.target) ? relAnyElement : { kind: "RelId", qi: row.target };
    out.set(mhKey(rel, decodeMediaType(row.mediaType)), [
      { kind: "CustomFunc", funcQi: row.handler, target: rel, baseType: row.baseType },
      decodeMediaType(row.resolvedMediaType),
    ]);
  }
  return out;
}

// SchemaCache.hs stores the resolved dbMediaHandlers on the cache; the plugin
// keeps the raw rows there, so the resolution is memoized on row-list identity.
const resolvedCache = new WeakMap<MediaHandlerRow[], MediaHandlerMap>();

/** SchemaCache.hs `dbMediaHandlers = HM.union mHdlers initialMediaHandlers` —
 * the custom handlers override the initial ones. */
export function dbMediaHandlers(sCache: Pick<SchemaCache, "mediaHandlers">): MediaHandlerMap {
  const cached = resolvedCache.get(sCache.mediaHandlers);
  if (cached !== undefined) return cached;
  const map: MediaHandlerMap = new Map(initialMediaHandlers);
  for (const [k, v] of decodeMediaHandlers(sCache.mediaHandlers)) map.set(k, v);
  resolvedCache.set(sCache.mediaHandlers, map);
  return map;
}
