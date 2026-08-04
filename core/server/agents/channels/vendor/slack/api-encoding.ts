// Vendored from eve@0.19.0 dist/src/public/channels/slack/api-encoding.js (Apache-2.0).
// Modified: none (de-minified only). Slack's web API takes form-encoded request
// bodies (nested values JSON-stringified) and returns either JSON or
// form-encoded bodies; these two pure helpers encode/decode that wire format.
// See vendor/VENDOR.md.

/** Encodes a Slack web-API request body as `application/x-www-form-urlencoded`. */
export function encodeSlackApiBody(body: unknown): { readonly body: string; readonly contentType: string } {
  const params = new URLSearchParams();
  if (body && typeof body === "object") {
    for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
      if (v == null) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") params.set(k, String(v));
      else params.set(k, JSON.stringify(v));
    }
  }
  return { body: params.toString(), contentType: "application/x-www-form-urlencoded" };
}

/**
 * Decodes a Slack inbound body. JSON content-types parse as JSON;
 * form-urlencoded bodies decode field-by-field, JSON-parsing any value that
 * looks like an array/object (Slack's `payload=` interactivity field). Anything
 * else is returned untouched.
 */
export function decodeSlackApiBody(body: unknown, contentType: string | null): unknown {
  if (typeof body !== "string") return body;
  if (contentType?.includes("application/json")) return parseJson(body);
  if (!contentType?.includes("application/x-www-form-urlencoded")) return body;
  const out: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(body)) {
    out[k] = v.startsWith("[") || v.startsWith("{") ? parseJson(v) : v;
  }
  return out;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
