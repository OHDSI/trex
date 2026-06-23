// d2e-compat: recover DB credential passwords encrypted by the d2e client RSA scheme.
//
// The d2e portal/demo encrypt a source DB password before POSTing it to /trex/db:
// a random salt substring is inserted into the plaintext (addSalt), then the result
// is RSA-OAEP (SHA-256) encrypted with the per-serviceScope public key
// (DB_CREDENTIALS__<SCOPE>__PUBLIC_KEY) and base64-encoded. The matching private key
// (DB_CREDENTIALS__<SCOPE>__DECRYPT_PRIVATE_KEY, PKCS8 PEM) recovers it: RSA-OAEP
// decrypt, then strip the salt substring. routes.ts decrypts on store and re-encrypts
// with the trex-native DEK scheme so the rest of the engine sees a uniform credential.

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** True when a credential password looks like the d2e client RSA scheme (carries a salt). */
export function isD2eEncryptedCredential(cred: { password?: unknown; salt?: unknown }): boolean {
  return typeof cred?.password === "string" && cred.password.length > 0 &&
    typeof cred?.salt === "string" && cred.salt.length > 0;
}

/** RSA-OAEP-decrypt a d2e-encrypted credential password and strip its salt, yielding plaintext. */
export async function decryptD2eCredentialPassword(
  encryptedBase64: string,
  salt: string,
  serviceScope: string | null | undefined,
): Promise<string> {
  const scope = (serviceScope || "Internal").toUpperCase();
  // d2e maps the Internal decrypt key into the engine as DB_CREDENTIALS__PRIVATE_KEY
  // (compose); fall back to a per-scope name for completeness.
  const pem = Deno.env.get("DB_CREDENTIALS__PRIVATE_KEY") ??
    Deno.env.get(`DB_CREDENTIALS__${scope}__DECRYPT_PRIVATE_KEY`);
  if (!pem) {
    throw new Error(`No DB_CREDENTIALS private key configured (serviceScope ${scope})`);
  }
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem).buffer as ArrayBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    key,
    base64ToBytes(encryptedBase64).buffer as ArrayBuffer,
  );
  const salted = new TextDecoder().decode(plaintext);
  // addSalt inserted the salt substring once at a random index; remove it.
  return salt ? salted.split(salt).join("") : salted;
}
