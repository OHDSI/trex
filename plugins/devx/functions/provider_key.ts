// @ts-nocheck - Deno edge function
// Read/write helpers for devx.provider_configs' API key. Encrypted at rest
// when DEVX_ENCRYPTION_KEY is configured, plaintext-tolerant when it is not,
// so a deployment without a key keeps working and rows migrate as they are
// written. A decryption FAILURE is deliberately loud: falling back to the
// plaintext column would mask a rotated key and keep running on a stale
// credential.
import { decryptToken, encryptToken } from "./crypto.ts";

export interface ProviderKeyFields {
  api_key: string | null;
  api_key_encrypted: string | null;
  api_key_iv: string | null;
}

let warned = false;

export function encryptionConfigured(): boolean {
  const v = Deno.env.get("DEVX_ENCRYPTION_KEY");
  return typeof v === "string" && v.trim() !== "";
}

function warnOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[provider_key] DEVX_ENCRYPTION_KEY is not set — provider API keys are stored in plaintext. " +
      "Set it and run POST /provider-configs/encrypt-existing to migrate.",
  );
}

export async function readProviderKey(
  row: Partial<ProviderKeyFields>,
): Promise<string | null> {
  if (row.api_key_encrypted && row.api_key_iv) {
    // The row holds an encrypted credential: never fall back to row.api_key
    // (a stale/legacy plaintext column that may still be populated) — that
    // would silently serve an unreachable or stale key. Both failure shapes
    // below are deliberate, distinguished errors whose message classifies as
    // `invalid_key` in error_codes.ts, so the route layer (Task 6) can
    // classify them the same way it classifies every other coder-turn error
    // instead of leaking a raw crypto/WebCrypto string.
    if (!encryptionConfigured()) {
      throw new Error(
        "Invalid encryption key: provider API key is encrypted but DEVX_ENCRYPTION_KEY " +
          "is not configured — this credential cannot be recovered without it. Set " +
          "DEVX_ENCRYPTION_KEY to the key used to encrypt it, or re-enter the API key.",
      );
    }
    try {
      return await decryptToken(row.api_key_encrypted, row.api_key_iv);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        "Invalid encryption key: failed to decrypt the stored provider API key with the " +
          `configured DEVX_ENCRYPTION_KEY (rotated or corrupted key) — cannot recover this ` +
          `credential. (${detail})`,
      );
    }
  }
  return row.api_key ?? null;
}

export async function writeProviderKeyFields(
  plaintext: string | null,
): Promise<ProviderKeyFields> {
  if (plaintext === null) return { api_key: null, api_key_encrypted: null, api_key_iv: null };
  if (!encryptionConfigured()) {
    warnOnce();
    return { api_key: plaintext, api_key_encrypted: null, api_key_iv: null };
  }
  const { ciphertext, iv } = await encryptToken(plaintext);
  return { api_key: null, api_key_encrypted: ciphertext, api_key_iv: iv };
}
