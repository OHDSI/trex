// Vendored from eve@0.19.0 dist/src/public/channels/telegram/verify.js
// (Apache-2.0). Modified: Node `node:crypto` `timingSafeEqual` + `Buffer.from`
// → the sibling string `timingSafeEqual` (WebCrypto/Deno-portable); the
// `#internal/logging` debug logger → `console.debug`; `process.env` → `getEnv`
// (Deno.env). The env fallback key is `TELEGRAM_WEBHOOK_SECRET` (trex naming;
// eve reads `TELEGRAM_WEBHOOK_SECRET_TOKEN`). The verification LOGIC is eve's
// and unchanged: when you set `secret_token` on Telegram's `setWebhook`,
// Telegram echoes that exact value in `X-Telegram-Bot-Api-Secret-Token` on
// every webhook request; this compares it (constant-time) against the
// configured secret. This is the ONLY authentication for the webhook channel,
// so it fails closed on a missing secret. See vendor/VENDOR.md.

import { getEnv, timingSafeEqual } from "./shared.ts";

/** Secret token you set on Telegram's `setWebhook` call. */
export type TelegramWebhookSecretToken = string | (() => string | Promise<string>);

/**
 * Caller-supplied inbound webhook verifier. Replaces the secret-token header
 * check when an integration authenticates forwarded webhooks before they reach
 * the channel. Return falsy to reject; a string to accept and use it as the
 * (rewritten) body; any other truthy value to accept and keep the original body.
 */
export type TelegramWebhookVerifier = (request: Request, body: string) => unknown | Promise<unknown>;

export interface TelegramVerifyOptions {
  readonly secretToken: TelegramWebhookSecretToken | undefined;
  readonly webhookVerifier?: TelegramWebhookVerifier;
}

/** Resolves a Telegram webhook secret, falling back to `TELEGRAM_WEBHOOK_SECRET`. */
export async function resolveTelegramWebhookSecretToken(secretToken?: TelegramWebhookSecretToken): Promise<string> {
  const s = secretToken ?? getEnv("TELEGRAM_WEBHOOK_SECRET");
  if (!s) throw new Error("TELEGRAM_WEBHOOK_SECRET is required.");
  return typeof s === "function" ? await s() : s;
}

/**
 * Verifies an inbound Telegram webhook and returns its raw body. Throws when no
 * secret/verifier is configured, the secret header is missing, or the supplied
 * verifier/header rejects.
 */
export async function verifyTelegramRequest(request: Request, options: TelegramVerifyOptions): Promise<string> {
  const body = await request.text();

  if (options.webhookVerifier !== undefined) {
    const result = await options.webhookVerifier(request, body);
    if (!result) throw new Error("telegramChannel: inbound webhook verifier rejected the request.");
    return typeof result === "string" ? result : body;
  }

  const expected = await resolveTelegramWebhookSecretToken(options.secretToken);
  const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!provided) throw new Error("telegramChannel: inbound request missing Telegram secret-token header.");
  if (!constantTimeCompare(expected, provided)) {
    throw new Error("telegramChannel: inbound request secret-token mismatch.");
  }
  return body;
}

function constantTimeCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(a, b);
  } catch (e) {
    console.debug("telegram: timingSafeEqual threw", e);
    return false;
  }
}

/**
 * Verifies an inbound Telegram request, returning its raw body on success or
 * `null` on any failure (so a route can turn the null into a 401 before any
 * session work — the layer's auth carve-out means this secret-token check is
 * the only thing gating an unauthenticated Telegram webhook).
 */
export async function verifyTelegramInbound(
  request: Request,
  credentials?: { webhookSecret?: TelegramWebhookSecretToken; webhookVerifier?: TelegramWebhookVerifier },
): Promise<string | null> {
  try {
    return await verifyTelegramRequest(request, {
      secretToken: credentials?.webhookVerifier ? undefined : credentials?.webhookSecret,
      webhookVerifier: credentials?.webhookVerifier,
    });
  } catch (error) {
    console.warn("telegram inbound verification failed", error);
    return null;
  }
}
