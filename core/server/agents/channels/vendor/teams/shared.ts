// Reimplemented from eve@0.19.0 dist/src/shared/guards.js + dist/src/shared/
// json.js (Apache-2.0), plus the type shapes the vendored Teams helpers need
// from dist/src/runtime/input/types.d.ts (→ `InputOption`/`InputRequest`/
// `InputResponse`) and dist/src/channel/types.d.ts (→ `TeamsAuthContext`).
// Modified: the small eve internal modules the Teams helpers depend on
// (`#shared/guards`, `#shared/json`, and the type-only `#runtime/input/types` /
// `#channel/types`) are consolidated here so the vendored Teams files depend
// only on siblings in this directory — no eve import survives. Node built-ins
// are replaced with Deno/WebCrypto equivalents (`getEnv` wraps `Deno.env`; the
// base64url codecs replace Node's `Buffer`). See vendor/VENDOR.md.

// ---- guards (eve #shared/guards) -------------------------------------------

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && !!v && !Array.isArray(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// ---- json (eve #shared/json — parseJsonObject, de-minified) -----------------

/** A JSON object value (eve's `JsonObject`). */
export type JsonObject = Record<string, unknown>;

const INVALID = Symbol("invalid-json-value-candidate");

function normalizeJsonValueCandidate(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const n = normalizeJsonValueCandidate(item, seen);
      if (n === INVALID) return INVALID;
      out.push(n);
    }
    return out;
  }
  if (typeof value !== "object" || value === undefined || !isPlainObject(value) || seen.has(value)) return INVALID;
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const n = normalizeJsonValueCandidate(v, seen);
    if (n === INVALID) return INVALID;
    out[k] = n;
  }
  seen.delete(value);
  return out;
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === null || proto === Object.prototype;
}

/** Normalizes an arbitrary value to a plain JSON object, throwing when it is not one (eve's `parseJsonObject`). */
export function parseJsonObject(value: unknown): JsonObject {
  const normalized = normalizeJsonValueCandidate(value);
  if (normalized === INVALID) throw new TypeError("Expected a JSON-serializable value.");
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== "object") {
    throw new TypeError("Expected a JSON-serializable object.");
  }
  return normalized as JsonObject;
}

// ---- input types (eve #runtime/input/types — TYPE shapes only) -------------

export interface InputOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly style?: "default" | "primary" | "danger";
}

export interface InputRequest {
  readonly requestId: string;
  readonly prompt: string;
  readonly options?: readonly InputOption[];
  readonly display?: "confirmation" | "select" | "text";
  readonly allowFreeform?: boolean;
  readonly action?: unknown;
}

export type InputResponse =
  | { readonly requestId: string; readonly optionId: string; readonly text?: undefined }
  | { readonly requestId: string; readonly text: string; readonly optionId?: undefined };

// ---- auth context (eve #channel/types SessionAuthContext — shape) ----------

export interface TeamsAuthContext {
  readonly authenticator: string;
  readonly issuer?: string;
  readonly principalId: string;
  readonly principalType: "user" | "service";
  readonly subject?: string;
  readonly attributes: Readonly<Record<string, string>>;
}

// ---- base64url (eve uses jose/Buffer; the trex worker is Deno/WebCrypto) ----

/** Decodes a base64url string to raw bytes (JWT segments + JWK `n`/`e`). */
export function base64UrlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Decodes a base64url JWT segment to its UTF-8 JSON text. */
export function base64UrlToString(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

// ---- env (eve reads process.env; the trex worker is Deno) ------------------

export function getEnv(name: string): string | undefined {
  try {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}
