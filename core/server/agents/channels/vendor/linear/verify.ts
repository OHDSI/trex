// Reimplemented from eve@0.19.0 dist/src/public/channels/linear/verify.js
// (Apache-2.0). eve's `verify.js` computes the webhook HMAC with Node's
// `node:crypto` `createHmac("sha256")` + `timingSafeEqual` — Node built-ins
// absent in the Deno worker — so the HMAC is REIMPLEMENTED on **WebCrypto**
// (`crypto.subtle`, HMAC + SHA-256). The algorithm is byte-for-byte eve's:
// lowercase-hex HMAC-SHA256 over the RAW request body, keyed by
// `LINEAR_WEBHOOK_SECRET`, constant-time compared against the `Linear-Signature`
// header. eve's REPLAY WINDOW is preserved: after the signature matches, the
// payload's `webhookTimestamp` (a `Date.now()` epoch-ms number Linear stamps)
// must be within `maxSkewMs` (default 60_000 ms, eve's `6e4`) of now, else the
// request is rejected. This signature+timestamp check is the ONLY authentication
// for the webhook, so it fails CLOSED on a missing secret. `verifyLinearInbound`
// returns null instead of throwing so a route can turn it into a 401 BEFORE any
// session work. See vendor/VENDOR.md.

import { bytesToHex, type JsonObject, parseJsonObject, timingSafeEqual } from "./shared.ts";
import { type LinearCredential, resolveLinearWebhookSecret } from "./auth.ts";

/**
 * A verified inbound webhook: the RAW body (the exact bytes the signature covers)
 * plus, on the signature path, the already-parsed `payload` so the route need not
 * JSON.parse the body a second time. The verifier path leaves `payload` undefined
 * (the possibly-rewritten body is parsed downstream).
 */
export interface VerifiedLinearWebhook {
  readonly body: string;
  readonly payload?: JsonObject;
}

/**
 * Caller-supplied inbound verifier. Replaces the signature check when an
 * integration authenticates forwarded webhooks upstream. Return falsy to reject;
 * a string to accept and use it as the (rewritten) raw body; any other truthy
 * value to accept and keep the original body.
 */
export type LinearWebhookVerifier = (request: Request, body: string) => unknown | Promise<unknown>;

export interface LinearVerifyOptions {
  readonly webhookSecret?: LinearCredential;
  readonly webhookVerifier?: LinearWebhookVerifier;
  /** Replay window for `webhookTimestamp`, in ms. Defaults to eve's 60_000. */
  readonly maxSkewMs?: number;
}

/** Computes the lowercase-hex HMAC-SHA256 Linear sends in `Linear-Signature`. */
export async function signLinearWebhookBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return bytesToHex(new Uint8Array(sig));
}

/** Parses the raw body to a JSON object, throwing eve's "not valid JSON" error. */
function parsePayload(body: string): JsonObject {
  try {
    return parseJsonObject(JSON.parse(body));
  } catch {
    throw new Error("linearChannel: inbound request body is not valid JSON.");
  }
}

/**
 * Enforces eve's replay window on an ALREADY-PARSED payload: its
 * `webhookTimestamp` must be a finite number within `maxSkewMs` of now. Throws on
 * a missing/stale timestamp.
 */
function verifyWebhookTimestamp(payload: JsonObject, maxSkewMs: number): void {
  const ts = payload.webhookTimestamp;
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    throw new Error("linearChannel: inbound request missing webhookTimestamp.");
  }
  if (Math.abs(Date.now() - ts) > maxSkewMs) {
    throw new Error("linearChannel: inbound request timestamp outside allowed skew.");
  }
}

/**
 * Reads + verifies an inbound Linear webhook, returning the RAW body (and, on the
 * signature path, the parsed payload) on success. Throws when the signature
 * header is missing, no secret is configured, the computed HMAC does not match,
 * or the `webhookTimestamp` is missing/stale. The body is read ONCE and the
 * signature is over those exact bytes (not a re-serialization), matching Linear +
 * eve; the JSON is parsed ONCE and threaded out via `payload`.
 */
export async function readLinearWebhook(request: Request, options: LinearVerifyOptions): Promise<VerifiedLinearWebhook> {
  const body = await request.text();

  if (options.webhookVerifier !== undefined) {
    const result = await options.webhookVerifier(request, body);
    if (!result) throw new Error("linearChannel: inbound webhook verifier rejected the request.");
    return { body: typeof result === "string" ? result : body };
  }

  const provided = request.headers.get("linear-signature") ?? "";
  if (!provided) throw new Error("linearChannel: inbound request missing Linear-Signature.");
  const secret = await resolveLinearWebhookSecret(options.webhookSecret);
  if (!timingSafeEqual(await signLinearWebhookBody(body, secret), provided)) {
    throw new Error("linearChannel: inbound request signature mismatch.");
  }
  const payload = parsePayload(body);
  verifyWebhookTimestamp(payload, options.maxSkewMs ?? 60_000);
  return { body, payload };
}

/**
 * Verifies an inbound Linear request, returning the verified webhook (raw body +
 * parsed payload) on success or `null` on ANY failure (missing/invalid signature,
 * missing secret, stale timestamp) so a route can turn the null into a 401 BEFORE
 * any session work — this signature+timestamp check is the only thing gating the
 * unauthenticated webhook.
 */
export async function verifyLinearInbound(
  request: Request,
  options: LinearVerifyOptions,
): Promise<VerifiedLinearWebhook | null> {
  try {
    return await readLinearWebhook(request, options);
  } catch (error) {
    console.warn("linear inbound verification failed", error);
    return null;
  }
}
