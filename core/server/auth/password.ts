import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

// Better Auth uses scrypt with N=16384, r=8, p=1, dkLen=64
// The seed data in V1 schema uses N=16384, r=16, p=1, dkLen=64
// Better Auth passes the salt as a hex STRING (not decoded bytes) to scrypt.
// We replicate that behavior for verification, and use the same for new hashes.

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_PARAMS_ALT = { N: 16384, r: 16, p: 1 };
const DK_LEN = 64;
const SALT_LEN = 16;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const saltHex = salt.toString("hex");
  // Pass salt as hex string (matching Better Auth's behavior)
  const hash = (await scryptAsync(password, saltHex, DK_LEN, {
    ...SCRYPT_PARAMS,
    maxmem: 128 * SCRYPT_PARAMS.N * SCRYPT_PARAMS.r * 2,
  })) as Buffer;
  return saltHex + ":" + hash.toString("hex");
}

// No try/catch around scrypt. verifyPassword already answers false for every
// way a caller can be wrong — a password that does not match, a stored hash it
// cannot parse, a body that did not carry a string — so anything scrypt itself
// throws is the machine failing, not the credential. Swallowing that reported a
// broken node as a wrong password: the caller got a 401 nobody could act on,
// and better-auth.ts's APIError wrapping, which exists to turn such a failure
// into a visible 500, could never fire.
async function tryVerify(
  password: string,
  saltHex: string,
  hashHex: string,
  params: { N: number; r: number; p: number },
): Promise<boolean> {
  // Better Auth passes the salt as a hex STRING, not as decoded bytes
  const hash = (await scryptAsync(password, saltHex, DK_LEN, {
    ...params,
    maxmem: 128 * params.N * params.r * 2,
  })) as Buffer;
  return hash.toString("hex") === hashHex;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  // scrypt throws on anything that is not a string or a buffer. A body that
  // sent a number where a password belongs is the caller being wrong, so it
  // stays a credential failure rather than being reported as a failing machine.
  if (typeof password !== "string" || typeof stored !== "string") return false;

  const colonIdx = stored.indexOf(":");
  if (colonIdx === -1) return false;

  const saltHex = stored.slice(0, colonIdx);
  const hashHex = stored.slice(colonIdx + 1);

  // Try standard params first (r=8), then alternate (r=16)
  if (await tryVerify(password, saltHex, hashHex, SCRYPT_PARAMS)) return true;
  if (await tryVerify(password, saltHex, hashHex, SCRYPT_PARAMS_ALT))
    return true;

  return false;
}
