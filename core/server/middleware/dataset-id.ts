import { Buffer } from "node:buffer";
import type { Request } from "express";

const DEFAULT_KEY = "datasetId";
const MAX_JSON_SEGMENT = 4096;
const MAX_BODY_BYTES = 50 * 1024 * 1024;

export interface DatasetIdExtraction {
  ids: string[];
  /** A location that may carry a dataset id could not be decoded. */
  unverifiable: boolean;
}

/**
 * Collects every dataset id a request names, from each place a d2e worker may
 * read one: query `key`, `mriquery` (zlib + base64 JSON, query or body), body
 * `key` (JSON or urlencoded), header `key`, and URL-encoded JSON path segments.
 * The default `datasetId` key is always read as well.
 *
 * May replace `req.body` with a Buffer of the raw bytes when it had to drain an
 * unparsed JSON/urlencoded stream; the forwarder sends that Buffer unchanged.
 */
export async function extractDatasetIds(
  req: Request,
  key: string,
): Promise<DatasetIdExtraction> {
  const keys = key === DEFAULT_KEY ? [DEFAULT_KEY] : [key, DEFAULT_KEY];
  const ids = new Set<string>();
  let unverifiable = false;
  const mriqueries: string[] = [];

  const url = (req.originalUrl || req.url || req.path || "") as string;
  const qIndex = url.indexOf("?");
  const rawPath = qIndex === -1 ? url : url.slice(0, qIndex);
  const rawQuery = qIndex === -1 ? "" : url.slice(qIndex + 1).split("#")[0];

  collectFromParams(new URLSearchParams(rawQuery), keys, ids, mriqueries);

  const body = await readBody(req);
  if (body === UNVERIFIABLE) {
    unverifiable = true;
  } else if (body instanceof URLSearchParams) {
    collectFromParams(body, keys, ids, mriqueries);
  } else if (body && typeof body === "object" && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    for (const k of keys) addValue(obj[k], ids);
    if (typeof obj.mriquery === "string") mriqueries.push(obj.mriquery);
  }

  for (const k of keys) {
    const header = req.headers?.[k.toLowerCase()];
    addValue(header, ids);
  }

  for (const segment of rawPath.split("/")) {
    if (segment.length === 0 || segment.length > MAX_JSON_SEGMENT) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      continue;
    }
    if (!decoded.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(decoded);
      for (const k of keys) addValue(parsed?.[k], ids);
    } catch {
      // not a JSON segment
    }
  }

  for (const mq of mriqueries) {
    const decoded = await decodeMriquery(mq);
    if (decoded === UNVERIFIABLE) {
      unverifiable = true;
    } else if (decoded && typeof decoded === "object") {
      addValue((decoded as Record<string, unknown>)[DEFAULT_KEY], ids);
    }
  }

  return { ids: [...ids], unverifiable };
}

const UNVERIFIABLE = Symbol("unverifiable");

// Bracketed keys (datasetId[], datasetId[0]) are matched on their base name, as
// qs folds them into the same property.
function collectFromParams(
  params: URLSearchParams,
  keys: string[],
  ids: Set<string>,
  mriqueries: string[],
) {
  for (const [name, value] of params) {
    const base = name.split("[")[0];
    if (keys.includes(base)) addValue(value, ids);
    if (base === "mriquery") mriqueries.push(value);
  }
}

function addValue(value: unknown, ids: Set<string>) {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    for (const v of value) addValue(v, ids);
    if (value.length > 1) ids.add(String(value));
    return;
  }
  ids.add(typeof value === "object" ? JSON.stringify(value) : String(value));
}

async function decodeMriquery(value: string): Promise<unknown | typeof UNVERIFIABLE> {
  const candidates = new Set([
    value,
    value.replace(/ /g, "+"),
    value.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/"),
  ]);
  for (const candidate of candidates) {
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(candidate), (c) => c.charCodeAt(0));
    } catch {
      continue;
    }
    for (const format of ["deflate", "gzip"] as const) {
      const text = await decompress(bytes, format);
      if (text === null) continue;
      try {
        return JSON.parse(new TextDecoder().decode(text));
      } catch {
        // try the next candidate
      }
    }
  }
  return UNVERIFIABLE;
}

async function decompress(
  bytes: Uint8Array,
  format: CompressionFormat,
): Promise<Uint8Array | null> {
  try {
    const stream = new Blob([bytes as BlobPart]).stream()
      .pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Returns the parsed JSON/urlencoded body, `undefined` for any other content
 * type, or UNVERIFIABLE when a body of those types cannot be decoded.
 */
async function readBody(req: Request): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const mime = String(req.headers?.["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const isJson = mime === "application/json";
  const isForm = mime === "application/x-www-form-urlencoded";
  if (!isJson && !isForm) return undefined;

  const r = req as any;
  if (!Buffer.isBuffer(r.body) && r.body !== undefined && r.body !== null &&
      (r._body || typeof r.body !== "object" || Object.keys(r.body).length > 0)) {
    return r.body;
  }

  let raw: Buffer;
  if (Buffer.isBuffer(r.body)) {
    raw = r.body;
  } else {
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      for await (const chunk of r) {
        const c = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += c.length;
        if (total > MAX_BODY_BYTES) return UNVERIFIABLE;
        chunks.push(c);
      }
    } catch {
      return UNVERIFIABLE;
    }
    raw = Buffer.concat(chunks, total);
    r.body = raw;
  }
  if (raw.length === 0) return undefined;

  const encoding = String(req.headers?.["content-encoding"] ?? "identity").trim().toLowerCase();
  let bytes: Uint8Array | null = new Uint8Array(raw);
  if (encoding === "gzip" || encoding === "deflate") {
    bytes = await decompress(bytes, encoding);
  } else if (encoding !== "identity") {
    bytes = null;
  }
  if (!bytes) return UNVERIFIABLE;

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return UNVERIFIABLE;
  }
  if (isForm) return new URLSearchParams(text);
  try {
    return JSON.parse(text);
  } catch {
    return UNVERIFIABLE;
  }
}
