// Vendored from eve@0.19.0 dist/src/public/channels/discord/verify.js (Apache-2.0).
// Modified: (1) `#internal/logging` createLogger replaced with a no-op debug
// logger; (2) Ed25519 verification rewritten from Node's `node:crypto`
// (createPublicKey + verify over a DER/SPKI key) to WebCrypto
// (`crypto.subtle.importKey("spki", …, {name:"Ed25519"})` + `crypto.subtle.verify`)
// for edge/Deno portability — as a result `verifyDiscordSignature` is now async;
// (3) Node Buffer/hex swapped for the sibling `hexToBytes` helper;
// (4) `process.env` fallback swapped for `getEnv` (Deno.env). Logic otherwise
// unchanged. See vendor/VENDOR.md.

import { getEnv, hexToBytes } from "./shared.ts";

const log = { debug: (_msg: string, _meta?: unknown) => {} };

// DER SPKI prefix for an Ed25519 public key; prepended to the raw 32-byte key.
const ED25519_SPKI_PREFIX = hexToBytes("302a300506032b6570032100");

/** Discord application public key, materialized directly or from an async secret provider. */
export type DiscordPublicKey = string | (() => string | Promise<string>);

/**
 * Caller-supplied inbound webhook verifier. Replaces Ed25519 verification when
 * an integration authenticates forwarded webhooks before they reach the channel.
 * Return falsy to reject; a string to accept and use it as the (rewritten) body;
 * any other truthy value to accept and keep the original body.
 */
export type DiscordWebhookVerifier = (request: Request, body: string) => unknown | Promise<unknown>;

export interface DiscordVerifyOptions {
  readonly publicKey: DiscordPublicKey | undefined;
  readonly webhookVerifier?: DiscordWebhookVerifier;
  /** Max allowed clock skew, in seconds. Defaults to 5 minutes. */
  readonly maxSkewSeconds?: number;
}

/** Resolves a Discord public key, falling back to `DISCORD_PUBLIC_KEY`. */
export async function resolveDiscordPublicKey(publicKey?: DiscordPublicKey): Promise<string> {
  const key = publicKey ?? getEnv("DISCORD_PUBLIC_KEY");
  if (!key) throw new Error("DISCORD_PUBLIC_KEY is required.");
  return typeof key === "function" ? await key() : key;
}

/**
 * Verifies an inbound Discord interaction request and returns the raw body.
 * Throws when no public key/verifier is configured, required signature headers
 * are missing, timestamp checks fail, or the signature check fails.
 */
export async function verifyDiscordRequest(request: Request, options: DiscordVerifyOptions): Promise<string> {
  const body = await request.text();

  if (options.webhookVerifier !== undefined) {
    const result = await options.webhookVerifier(request, body);
    if (!result) throw new Error("discordChannel: inbound webhook verifier rejected the request.");
    return typeof result === "string" ? result : body;
  }

  const publicKey = await resolveDiscordPublicKey(options.publicKey);
  const signature = request.headers.get("x-signature-ed25519") ?? "";
  const timestamp = request.headers.get("x-signature-timestamp") ?? "";
  if (!signature || !timestamp) {
    throw new Error("discordChannel: inbound request missing Discord signature headers.");
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) throw new Error("discordChannel: inbound request has malformed timestamp.");
  const skew = options.maxSkewSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > skew) {
    throw new Error("discordChannel: inbound request timestamp outside allowed skew.");
  }
  if (!(await verifyDiscordSignature({ body, publicKey, signature, timestamp }))) {
    throw new Error("discordChannel: inbound request signature mismatch.");
  }
  return body;
}

/**
 * Verifies one Discord Ed25519 interaction signature over `timestamp + body`.
 * `publicKey` and `signature` are hex-encoded. Resolves false (never throws) on
 * malformed input or a length/signature mismatch.
 */
export async function verifyDiscordSignature(input: {
  readonly body: string;
  readonly publicKey: string;
  readonly signature: string;
  readonly timestamp: string;
}): Promise<boolean> {
  try {
    const rawKey = hexToBytes(input.publicKey);
    const signature = hexToBytes(input.signature);
    if (rawKey.length !== 32 || signature.length !== 64) return false;
    const spki = new Uint8Array(ED25519_SPKI_PREFIX.length + rawKey.length);
    spki.set(ED25519_SPKI_PREFIX);
    spki.set(rawKey, ED25519_SPKI_PREFIX.length);
    const key = await crypto.subtle.importKey("spki", spki as BufferSource, { name: "Ed25519" }, false, ["verify"]);
    const data = new TextEncoder().encode(`${input.timestamp}${input.body}`);
    return await crypto.subtle.verify("Ed25519", key, signature as BufferSource, data as BufferSource);
  } catch (error) {
    log.debug("Discord signature verification threw", { error });
    return false;
  }
}
