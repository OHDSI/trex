// @ts-nocheck - Deno edge function
/**
 * AES-256-GCM encryption/decryption for storing integration tokens.
 * Key sourced from DEVX_ENCRYPTION_KEY env var (64 hex chars = 32 bytes).
 */

let keyPromise: Promise<CryptoKey> | null = null;

async function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = importKey();
  }
  return keyPromise;
}

async function importKey(): Promise<CryptoKey> {

  const keyHex = Deno.env.get("DEVX_ENCRYPTION_KEY");
  if (!keyHex) {
    throw new Error("DEVX_ENCRYPTION_KEY not set — cannot encrypt/decrypt tokens");
  }

  // Accept hex (64 chars) or base64 (44 chars)
  let keyBytes: Uint8Array;
  if (/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    keyBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      keyBytes[i] = parseInt(keyHex.substring(i * 2, i * 2 + 2), 16);
    }
  } else {
    // Try base64
    const raw = atob(keyHex);
    keyBytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      keyBytes[i] = raw.charCodeAt(i);
    }
  }

  if (keyBytes.length !== 32) {
    throw new Error("DEVX_ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars)");
  }

  return await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromBase64(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export async function encryptToken(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  return {
    ciphertext: toBase64(encrypted),
    iv: toBase64(iv),
  };
}

export async function decryptToken(ciphertext: string, iv: string): Promise<string> {
  const key = await getKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  );
  return new TextDecoder().decode(decrypted);
}
