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
    // Any failure here (missing key, rotated key, corrupt row) propagates.
    return await decryptToken(row.api_key_encrypted, row.api_key_iv);
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
