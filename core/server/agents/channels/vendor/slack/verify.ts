// Reimplemented from eve@0.19.0 dist/src/public/channels/slack/verify.js (Apache-2.0).
// Modified: eve's `verifySlackRequest` is a thin wrapper over
// `#compiled/@chat-adapter/slack/webhook.js#verifySlackRequest` — a Node
// runtime primitive that is NOT vendorable — so the actual Slack signing-secret
// check is reimplemented here against WebCrypto (`crypto.subtle` HMAC-SHA256)
// for edge/Deno portability. The algorithm is Slack's documented v0 scheme:
// HMAC-SHA256 over `v0:{timestamp}:{raw body}` keyed by the signing secret,
// hex-compared (constant-time) against `X-Slack-Signature`, with a 5-minute
// replay window on `X-Slack-Request-Timestamp`. Fail-closed: a missing signing
// secret (and no webhook verifier) throws. See vendor/VENDOR.md.

import { getEnv, hmacSha256Hex, timingSafeEqual } from "./shared.ts";

/** Signing secret, materialized directly or from an async secret provider. */
export type SlackSigningSecret = string | (() => string | Promise<string>);

/**
 * Caller-supplied inbound webhook verifier. Replaces the signing-secret check
 * when an integration authenticates forwarded webhooks before they reach the
 * channel. Return falsy to reject; a string to accept and use it as the
 * (rewritten) body; any other truthy value to accept and keep the original body.
 */
export type SlackWebhookVerifier = (request: Request, body: string) => unknown | Promise<unknown>;

export interface SlackVerifyOptions {
  readonly signingSecret?: SlackSigningSecret;
  readonly webhookVerifier?: SlackWebhookVerifier;
  /** Max allowed clock skew, in seconds. Defaults to 5 minutes. */
  readonly maxSkewSeconds?: number;
}

/** Resolves a Slack signing secret, falling back to `SLACK_SIGNING_SECRET`. */
export async function resolveSlackSigningSecret(secret?: SlackSigningSecret): Promise<string> {
  const s = secret ?? getEnv("SLACK_SIGNING_SECRET");
  if (!s) throw new Error("SLACK_SIGNING_SECRET is required.");
  return typeof s === "function" ? await s() : s;
}

/**
 * Verifies an inbound Slack request and returns the raw body. Throws when no
 * signing secret/verifier is configured, the signature headers are missing, the
 * timestamp is malformed or outside the replay window, or the HMAC mismatches.
 */
export async function verifySlackRequest(request: Request, options: SlackVerifyOptions): Promise<string> {
  const body = await request.text();

  if (options.webhookVerifier !== undefined) {
    const result = await options.webhookVerifier(request, body);
    if (!result) throw new Error("slackChannel: inbound webhook verifier rejected the request.");
    return typeof result === "string" ? result : body;
  }

  const signingSecret = await resolveSlackSigningSecret(options.signingSecret);
  const signature = request.headers.get("x-slack-signature") ?? "";
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  if (!signature || !timestamp) {
    throw new Error("slackChannel: inbound request missing Slack signature headers.");
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) throw new Error("slackChannel: inbound request has malformed timestamp.");
  const skew = options.maxSkewSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > skew) {
    throw new Error("slackChannel: inbound request timestamp outside allowed skew.");
  }
  if (!(await verifySlackSignature({ body, signingSecret, signature, timestamp }))) {
    throw new Error("slackChannel: inbound request signature mismatch.");
  }
  return body;
}

/**
 * Verifies one Slack `v0=` signature over `v0:{timestamp}:{body}`. Resolves
 * false (never throws) on a malformed signature or a mismatch. The compare is
 * constant-time to avoid leaking how much of the HMAC matched.
 */
export async function verifySlackSignature(input: {
  readonly body: string;
  readonly signingSecret: string;
  readonly signature: string;
  readonly timestamp: string;
}): Promise<boolean> {
  try {
    const mac = await hmacSha256Hex(input.signingSecret, `v0:${input.timestamp}:${input.body}`);
    return timingSafeEqual(`v0=${mac}`, input.signature);
  } catch {
    return false;
  }
}

/**
 * Verifies an inbound Slack request, returning its raw body on success or `null`
 * on any failure (so a route can turn the null into a 401 before any session
 * work — the layer's auth carve-out means this signature check is the only thing
 * gating an unauthenticated Slack webhook).
 */
export async function verifySlackInbound(
  request: Request,
  credentials?: { signingSecret?: SlackSigningSecret; webhookVerifier?: SlackWebhookVerifier },
): Promise<string | null> {
  try {
    return await verifySlackRequest(request, {
      signingSecret: credentials?.webhookVerifier ? undefined : credentials?.signingSecret,
      webhookVerifier: credentials?.webhookVerifier,
    });
  } catch (error) {
    console.warn("slack inbound verification failed", error);
    return null;
  }
}
