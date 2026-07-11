const encoder = new TextEncoder();

export const LABELS = {
  betterAuthSession: "trex.better-auth.session.v1",
  jwtHs256: "trex.jwt.hs256.v1",
  pgmetaAes: "trex.pgmeta.aes.v1",
  dekWrap: "trex.dek.wrap.v1",
  devxTokenAes: "trex.devx.token.aes.v1",
} as const;

export type SubkeyLabel = typeof LABELS[keyof typeof LABELS];

const SALT = encoder.encode("trex/v1");

function b64decode(s: string): Uint8Array {
  // tolerate url-safe and padding-less variants
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? norm : norm + "=".repeat(4 - (norm.length % 4));
  const bin = atob(pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

let _cached: Uint8Array | null = null;

export function getRootKey(): Uint8Array {
  if (_cached) return _cached;
  const raw = Deno.env.get("TREX_ROOT_KEY");
  if (!raw) {
    throw new Error(
      "TREX_ROOT_KEY is not set. The trex-init container is responsible for " +
      "generating and exporting it; see scripts/derive-secrets.ts.",
    );
  }
  let bytes: Uint8Array;
  try { bytes = b64decode(raw); } catch {
    throw new Error("TREX_ROOT_KEY is not valid base64");
  }
  if (bytes.length < 32) {
    throw new Error(
      `TREX_ROOT_KEY must decode to at least 32 bytes, got ${bytes.length}`,
    );
  }
  _cached = bytes.slice(0, 32);
  return _cached;
}

/** Test-only. Drops the cached root so a new TREX_ROOT_KEY env value is honored. */
export function _resetRootKeyCache(): void { _cached = null; }

export async function deriveSubkey(label: SubkeyLabel): Promise<Uint8Array> {
  const root = getRootKey();
  const material = await crypto.subtle.importKey(
    "raw", root.buffer as ArrayBuffer, "HKDF", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: encoder.encode(label) },
    material,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * Convenience: derive and base64-encode (no padding, no url-safe substitution)
 * for use as a string secret passed to libraries that expect raw text.
 */
export async function deriveSubkeyBase64(label: SubkeyLabel): Promise<string> {
  const bytes = await deriveSubkey(label);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")).replace(/=+$/, "");
}
