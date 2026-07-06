// Vendored/consolidated support module for the pure Slack helpers (Apache-2.0).
// Modified: the several tiny eve internal modules the pure Slack helpers import
// (`#shared/guards`, `#shared/json`, the type-only `#runtime/input/types` /
// `#channel/types`) are consolidated here so the vendored Slack files depend
// only on siblings in this directory — no eve runtime import survives. WebCrypto
// HMAC + constant-time compare + byte/hex helpers are added for Deno (eve's
// verify path delegated to a Node `#compiled/@chat-adapter` primitive that is
// NOT vendorable — see verify.ts). See vendor/VENDOR.md.

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
  if (typeof value !== "object" || value === undefined || !isPlainObject(value) || seen.has(value)) {
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

export interface SlackAuthContext {
  readonly authenticator: string;
  readonly issuer?: string;
  readonly principalId: string;
  readonly principalType: "user" | "service";
  readonly attributes: Readonly<Record<string, string>>;
}

// ---- continuation token (eve api.js slackContinuationToken) ----------------

/** A Slack thread === a session: `<channelId>:<threadTs>`. */
export function slackContinuationToken(channelId: string, threadTs: string): string {
  return `${channelId}:${threadTs}`;
}

// ---- byte / hex helpers (Deno replacements for Node Buffer) -----------------

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Length-safe constant-time string compare. Returns false immediately on a
 * length mismatch, else XORs every char code so the loop time does not depend
 * on where the first difference is.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HMAC-SHA256 of `message` keyed by `secret`, hex-encoded. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message) as BufferSource);
  return bytesToHex(new Uint8Array(sig));
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
