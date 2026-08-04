// Reimplemented from eve@0.19.0 dist/src/public/channels/twilio/verify.js +
// dist/src/compiled/@chat-adapter/twilio/webhook.js — the pure `verify.js`
// wrapper re-exports its verification primitives (`twilioSignatureBase`,
// `verifyTwilioRequest`, `readTwilioWebhook`, `resolveTwilioWebhookUrl`) from a
// `#compiled/@chat-adapter/twilio/webhook.js` module that resolves to a BUNDLED,
// MINIFIED chunk (`dist/src/compiled/_chunks/node/chunk-QZV7YRVM-*.js`). A
// minified chunk is not vendorable as readable source, so the algorithm is
// REIMPLEMENTED here from that chunk and labelled honestly (Apache-2.0). The
// crypto is byte-for-byte eve's: HMAC-SHA1 (WebCrypto `crypto.subtle`, which eve
// itself uses — NOT node:crypto) over the request URL concatenated with the POST
// params sorted by key (values deduped + sorted per key), base64-encoded, then
// constant-time compared against `X-Twilio-Signature`. This signature check is
// the ONLY authentication for the SMS webhook, so it fails closed on a missing
// auth token. See vendor/VENDOR.md.

import { bytesToBase64, getEnv, timingSafeEqual } from "./shared.ts";

/** Twilio auth token, materialized directly or from an async secret provider. */
export type TwilioAuthToken = string | (() => string | Promise<string>);

/**
 * Resolver for the exact public URL Twilio signed. Behind a proxy the inbound
 * `request.url` host/scheme can differ from the URL configured on the Twilio
 * number (the one Twilio actually hashed), so this is configurable: a string
 * pins it, a function derives it from the request, and `undefined` falls back to
 * `request.url` (eve's `resolveTwilioWebhookUrl`).
 */
export type TwilioWebhookUrl = string | ((request: Request) => string | Promise<string>);

/**
 * Caller-supplied inbound verifier. Replaces the signature check when an
 * integration authenticates forwarded webhooks upstream. Return falsy to reject;
 * a string to accept and use it as the (rewritten) raw body; any other truthy
 * value to accept and keep the original body.
 */
export type TwilioWebhookVerifier = (request: Request, body: string) => unknown | Promise<unknown>;

export interface TwilioVerifyOptions {
  readonly authToken?: TwilioAuthToken;
  readonly webhookUrl?: TwilioWebhookUrl;
  readonly webhookVerifier?: TwilioWebhookVerifier;
}

/** Raw inbound webhook: the untouched body plus its decoded form params. */
export interface TwilioWebhookRead {
  readonly body: string;
  readonly params: URLSearchParams;
}

/**
 * Resolves a Twilio auth token, falling back to `TWILIO_AUTH_TOKEN`. Throws when
 * neither is present so the verifier fails CLOSED (no token → no auth → reject).
 */
export async function resolveTwilioAuthToken(token?: TwilioAuthToken): Promise<string> {
  const t = token ?? getEnv("TWILIO_AUTH_TOKEN");
  if (!t) throw new Error("TWILIO_AUTH_TOKEN is required.");
  return typeof t === "function" ? await t() : t;
}

/**
 * Builds the Twilio signature base string: the request URL, then for every param
 * key (sorted) each of its values (deduped + sorted) appended as `key + value`.
 * `null` params (e.g. a GET request) yield the URL alone.
 */
export function twilioSignatureBase(url: string, params: URLSearchParams | null): string {
  if (!params) return url;
  let out = url;
  const byKey = new Map<string, Set<string>>();
  for (const [k, v] of params) {
    const set = byKey.get(k) ?? new Set<string>();
    set.add(v);
    byKey.set(k, set);
  }
  for (const k of [...byKey.keys()].sort()) {
    for (const v of [...(byKey.get(k) ?? [])].sort()) out += `${k}${v}`;
  }
  return out;
}

/** Computes the base64 HMAC-SHA1 signature Twilio sends in `X-Twilio-Signature`. */
export async function computeTwilioSignature(input: {
  readonly authToken: string;
  readonly url: string;
  readonly params: URLSearchParams | null;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(twilioSignatureBase(input.url, input.params)));
  return bytesToBase64(new Uint8Array(sig));
}

/**
 * Produces the `X-Twilio-Signature` value for a request — the sign side of the
 * verify (used by tests + integrations that forward signed requests). Same HMAC
 * as `computeTwilioSignature`.
 */
export function signTwilioRequest(input: {
  readonly authToken: string;
  readonly url: string;
  readonly params: URLSearchParams | null;
}): Promise<string> {
  return computeTwilioSignature(input);
}

function resolveWebhookUrl(request: Request, webhookUrl?: TwilioWebhookUrl): string | Promise<string> {
  return typeof webhookUrl === "function" ? webhookUrl(request) : (webhookUrl ?? request.url);
}

function paramsForMethod(request: Request, rawBody: string): URLSearchParams {
  return request.method.toUpperCase() === "GET" ? new URL(request.url).searchParams : new URLSearchParams(rawBody);
}

/**
 * Reads + verifies an inbound Twilio webhook, returning the raw body and decoded
 * params. Throws when the signature header is missing, no auth token is
 * configured, or the computed HMAC does not match. A GET request signs the URL
 * alone (no params), matching Twilio + eve.
 */
export async function readTwilioWebhook(request: Request, options: TwilioVerifyOptions): Promise<TwilioWebhookRead> {
  const rawBody = await request.text();

  if (options.webhookVerifier !== undefined) {
    const result = await options.webhookVerifier(request, rawBody);
    if (!result) throw new Error("twilioChannel: inbound webhook verifier rejected the request.");
    const body = typeof result === "string" ? result : rawBody;
    return { body, params: paramsForMethod(request, body) };
  }

  const provided = request.headers.get("x-twilio-signature");
  if (!provided) throw new Error("twilioChannel: inbound request missing X-Twilio-Signature.");

  const authToken = await resolveTwilioAuthToken(options.authToken);
  const url = await resolveWebhookUrl(request, options.webhookUrl);
  const params = paramsForMethod(request, rawBody);
  const isGet = request.method.toUpperCase() === "GET";
  const computed = await computeTwilioSignature({ authToken, url, params: isGet ? null : params });
  if (!timingSafeEqual(computed, provided)) {
    throw new Error("twilioChannel: inbound request signature mismatch.");
  }
  return { body: rawBody, params };
}

/**
 * Verifies an inbound Twilio request, returning the read (body + params) on
 * success or `null` on ANY failure (missing/invalid signature, missing token) so
 * a route can turn the null into a 401 BEFORE any session work — this signature
 * check is the only thing gating the unauthenticated SMS webhook.
 */
export async function verifyTwilioInbound(
  request: Request,
  options: TwilioVerifyOptions,
): Promise<TwilioWebhookRead | null> {
  try {
    return await readTwilioWebhook(request, options);
  } catch (error) {
    console.warn("twilio inbound verification failed", error);
    return null;
  }
}
