// Vendored from eve@0.19.0 dist/src/shared/guards.js + dist/src/shared/json.js
// + type shapes from dist/src/runtime/input/types.d.ts and
// dist/src/channel/types.d.ts (Apache-2.0). Modified: the several tiny eve
// internal modules the pure Discord helpers import (`#shared/guards`,
// `#shared/json`, the type-only `#runtime/input/types` / `#channel/types`) are
// consolidated here so the vendored Discord files depend only on siblings in
// this directory — no eve runtime import survives. Buffer/base64url/hex helpers
// added for Deno (eve used Node's Buffer). See vendor/VENDOR.md.

// ---- guards (eve #shared/guards) -------------------------------------------

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && !!v && !Array.isArray(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!isObject(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

// ---- JSON normalization (eve #shared/json) ---------------------------------

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };
export type JsonObject = { [k: string]: JsonValue };

const INVALID = Symbol("invalid-json-value-candidate");

function normalize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID;
  if (Array.isArray(value)) {
    const out: unknown[] = [];
    for (const item of value) {
      const n = normalize(item, seen);
      if (n === INVALID) return INVALID;
      out.push(n);
    }
    return out;
  }
  if (typeof value !== "object" || !isPlainObject(value) || seen.has(value)) {
    return INVALID;
  }
  seen.add(value as object);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    const n = normalize(v, seen);
    if (n === INVALID) return INVALID;
    out[k] = n;
  }
  seen.delete(value as object);
  return out;
}

export function parseJsonValue(value: unknown): JsonValue {
  const n = normalize(value);
  if (n === INVALID) throw new TypeError("Expected a JSON-serializable value.");
  return n as JsonValue;
}

export function parseJsonObject(value: unknown): JsonObject {
  const v = parseJsonValue(value);
  if (v === null || Array.isArray(v) || typeof v !== "object") {
    throw new TypeError("Expected a JSON-serializable object.");
  }
  return v as JsonObject;
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

export interface DiscordAuthContext {
  readonly authenticator: string;
  readonly issuer?: string;
  readonly principalId: string;
  readonly principalType: "user" | "service";
  readonly attributes: Readonly<Record<string, string>>;
}

// ---- byte / base64url helpers (Deno replacements for Node Buffer) ----------

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("invalid hex digit");
    out[i] = byte;
  }
  return out;
}

export function utf8ToBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToUtf8(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ---- env (eve read process.env; trex worker is Deno) -----------------------

export function getEnv(name: string): string | undefined {
  try {
    // deno-lint-ignore no-explicit-any
    return (globalThis as any).Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}
