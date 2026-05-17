import { decryptWithDek, encryptWithDek } from "./dek.ts";

const encoder = new TextEncoder();

export function encryptSecret(plaintext: string): Promise<string> {
  return encryptWithDek(plaintext);
}

export function decryptSecret(encrypted: string): Promise<string> {
  return decryptWithDek(encrypted);
}

export async function hashSecret(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value).buffer as ArrayBuffer);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}
