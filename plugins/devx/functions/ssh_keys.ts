// @ts-nocheck - Deno edge function
/**
 * Pure-Deno ed25519 SSH key codec for commit signing (no I/O, no subprocess —
 * the edge sandbox cannot spawn processes, and generation must not depend on
 * ssh-keygen being installed).
 *
 * Emits/parses the OpenSSH "openssh-key-v1" private key container (unencrypted
 * only) and the one-line authorized_keys/allowed_signers public format.
 */

const MAGIC = "openssh-key-v1\0";
const KEY_TYPE = "ssh-ed25519";
const COMMENT = "devx-signing";

// ── byte plumbing ───────────────────────────────────────────────────

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

// SSH wire "string": uint32 BE length + bytes
function sshString(data: Uint8Array | string): Uint8Array {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return concat(u32(bytes.length), bytes);
}

// Chunked so large-ish buffers don't blow the spread-arg limit.
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

class Reader {
  #view: DataView;
  #bytes: Uint8Array;
  #off = 0;
  constructor(bytes: Uint8Array) {
    this.#bytes = bytes;
    this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  u32(): number {
    const n = this.#view.getUint32(this.#off);
    this.#off += 4;
    return n;
  }
  bytes(n: number): Uint8Array {
    if (this.#off + n > this.#bytes.length) throw new Error("ssh key: truncated");
    const out = this.#bytes.subarray(this.#off, this.#off + n);
    this.#off += n;
    return out;
  }
  string(): Uint8Array {
    return this.bytes(this.u32());
  }
  text(): string {
    return new TextDecoder().decode(this.string());
  }
}

// ── public-side derivations ─────────────────────────────────────────

// authorized_keys-style blob: string("ssh-ed25519") + string(pub32)
function publicKeyBlob(pub: Uint8Array): Uint8Array {
  return concat(sshString(KEY_TYPE), sshString(pub));
}

async function fingerprintOf(pub: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", publicKeyBlob(pub));
  // ssh-keygen prints SHA256 fingerprints base64 WITHOUT padding
  return "SHA256:" + toBase64(new Uint8Array(digest)).replace(/=+$/, "");
}

function publicKeyLineOf(pub: Uint8Array, comment: string): string {
  return `${KEY_TYPE} ${toBase64(publicKeyBlob(pub))} ${comment}`;
}

// ── generation ──────────────────────────────────────────────────────

export interface GeneratedKey {
  privateKeyOpenssh: string;
  publicKeyLine: string;
  fingerprint: string;
}

export async function generateEd25519(): Promise<GeneratedKey> {
  const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  // pkcs8 ed25519 is a fixed 48-byte structure; the seed is the last 32 bytes.
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const seed = pkcs8.subarray(pkcs8.length - 32);
  return {
    privateKeyOpenssh: encodeOpensshPrivate(seed, pub),
    publicKeyLine: publicKeyLineOf(pub, COMMENT),
    fingerprint: await fingerprintOf(pub),
  };
}

function encodeOpensshPrivate(seed: Uint8Array, pub: Uint8Array): string {
  // Random checkint pair — repeated so a decryption/corruption check exists.
  const check = crypto.getRandomValues(new Uint8Array(4));
  let priv = concat(
    check,
    check,
    sshString(KEY_TYPE),
    sshString(pub),
    sshString(concat(seed, pub)), // ed25519 "private" = seed || pub, 64 bytes
    sshString(COMMENT),
  );
  // Pad the private section with 1,2,3,... to a multiple of the cipher block
  // size (8 for "none").
  const padLen = (8 - (priv.length % 8)) % 8;
  const pad = new Uint8Array(padLen);
  for (let i = 0; i < padLen; i++) pad[i] = i + 1;
  priv = concat(priv, pad);

  const blob = concat(
    new TextEncoder().encode(MAGIC),
    sshString("none"), // ciphername
    sshString("none"), // kdfname
    sshString(""), //     kdfoptions
    u32(1), //            number of keys
    sshString(publicKeyBlob(pub)),
    sshString(priv),
  );

  const b64 = toBase64(blob);
  const wrapped = b64.match(/.{1,70}/g)!.join("\n");
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${wrapped}\n-----END OPENSSH PRIVATE KEY-----\n`;
}

// ── import (paste) ──────────────────────────────────────────────────

export interface ParsedKey {
  publicKeyLine: string;
  fingerprint: string;
  /** Canonical re-wrap of the pasted PEM (normalized line endings). */
  privateKeyOpenssh: string;
}

/**
 * Validate a pasted OpenSSH ed25519 private key and derive its public parts.
 * Throws Error with a user-presentable message on anything unusable.
 */
export async function parseOpensshPrivateKey(pem: string): Promise<ParsedKey> {
  const m = pem.match(
    /-----BEGIN OPENSSH PRIVATE KEY-----\s*([\s\S]*?)\s*-----END OPENSSH PRIVATE KEY-----/,
  );
  if (!m) {
    throw new Error("not an OpenSSH private key (expected '-----BEGIN OPENSSH PRIVATE KEY-----')");
  }
  let blob: Uint8Array;
  try {
    blob = fromBase64(m[1].replace(/\s+/g, ""));
  } catch {
    throw new Error("invalid base64 in private key");
  }

  const magic = new TextDecoder().decode(blob.subarray(0, MAGIC.length));
  if (magic !== MAGIC) throw new Error("not an openssh-key-v1 private key");

  const r = new Reader(blob.subarray(MAGIC.length));
  const cipher = r.text();
  const kdf = r.text();
  r.string(); // kdfoptions
  if (cipher !== "none" || kdf !== "none") {
    throw new Error("passphrase-protected keys are not supported — export an unencrypted key or generate one here");
  }
  const nkeys = r.u32();
  if (nkeys !== 1) throw new Error(`expected exactly 1 key in the file, found ${nkeys}`);

  const pubBlob = new Reader(r.string());
  const keyType = pubBlob.text();
  if (keyType !== KEY_TYPE) {
    throw new Error(`only ed25519 keys are supported (got ${keyType})`);
  }
  const pub = pubBlob.string();
  if (pub.length !== 32) throw new Error("malformed ed25519 public key");

  const priv = new Reader(r.string());
  const check1 = priv.u32();
  const check2 = priv.u32();
  if (check1 !== check2) throw new Error("corrupt private key (checkint mismatch)");
  const privType = priv.text();
  if (privType !== KEY_TYPE) throw new Error("corrupt private key (type mismatch)");
  const privPub = priv.string();
  const privKey = priv.string();
  if (privKey.length !== 64) throw new Error("malformed ed25519 private key");
  // priv = seed || pub; all three public copies must agree.
  const embeddedPub = privKey.subarray(32);
  for (let i = 0; i < 32; i++) {
    if (pub[i] !== privPub[i] || pub[i] !== embeddedPub[i]) {
      throw new Error("corrupt private key (public halves disagree)");
    }
  }

  return {
    publicKeyLine: publicKeyLineOf(pub, COMMENT),
    fingerprint: await fingerprintOf(pub),
    privateKeyOpenssh: m[0].replace(/\r\n/g, "\n") + "\n",
  };
}
