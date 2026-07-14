// Reimplemented from eve@0.19.0 dist/src/shared/guards.js + type shapes from
// dist/src/runtime/input/types.d.ts and dist/src/channel/types.d.ts, plus the
// constant-time compare + base64 helpers eve's compiled Twilio primitives use
// (dist/src/compiled/_chunks/node/chunk-QZV7YRVM-*.js) (Apache-2.0). Modified:
// the small eve internal modules the Twilio helpers depend on (`#shared/guards`,
// the type-only `#runtime/input/types` / `#channel/types`, and the compiled
// crypto helpers) are consolidated here so the vendored Twilio files depend only
// on siblings in this directory — no eve import survives. Node built-ins are
// replaced with Deno/WebCrypto equivalents (`getEnv` wraps `Deno.env`; the
// byte→base64 + constant-time compare are pure). See vendor/VENDOR.md.

// ---- guards (eve #shared/guards) -------------------------------------------

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && !!v && !Array.isArray(v);
}

export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
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

export interface TwilioAuthContext {
  readonly authenticator: string;
  readonly issuer?: string;
  readonly principalId: string;
  readonly principalType: "user" | "service";
  readonly attributes: Readonly<Record<string, string>>;
}

// ---- base64 of raw bytes (eve compiled `f`: btoa over a byte string) --------

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ---- constant-time compare (eve compiled `p`) ------------------------------

/**
 * Length-tolerant constant-time string compare, byte-for-byte identical to
 * eve's compiled Twilio verifier: it seeds the diff with the length delta and
 * compares over the longer of the two so the loop time does not leak where the
 * first mismatch is. Returns true only when both length and every char match.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  let diff = Math.abs(a.length - b.length);
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i) || 0;
    const y = b.charCodeAt(i) || 0;
    diff += Number(x !== y);
  }
  return diff === 0;
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
