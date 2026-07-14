// Vendored from eve@0.19.0 dist/src/public/channels/discord/verifyInbound.js (Apache-2.0).
// Modified: `#internal/logging` createLogger replaced with console.warn;
// `#public/channels/discord/verify` import rewritten to the sibling `./verify.ts`.
// Behavior unchanged: wraps verifyDiscordRequest and returns null instead of
// throwing so a route can 401. See vendor/VENDOR.md.

import { type DiscordCredentials } from "./api.ts";
import { verifyDiscordRequest } from "./verify.ts";

/**
 * Verifies an inbound Discord request, returning its raw body on success or
 * `null` on any failure (so a route can turn the null into a 401 before any
 * session work — the layer's auth carve-out means this signature check is the
 * only thing gating an unauthenticated webhook).
 */
export async function verifyDiscordInbound(
  request: Request,
  credentials?: DiscordCredentials & { webhookVerifier?: Parameters<typeof verifyDiscordRequest>[1]["webhookVerifier"] },
): Promise<string | null> {
  try {
    return await verifyDiscordRequest(request, {
      publicKey: credentials?.webhookVerifier ? undefined : credentials?.publicKey,
      webhookVerifier: credentials?.webhookVerifier,
    });
  } catch (error) {
    console.warn("discord inbound verification failed", error);
    return null;
  }
}
