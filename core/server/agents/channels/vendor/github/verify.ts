// Reimplemented from eve@0.19.0 dist/src/public/channels/github/verify.js
// (Apache-2.0). eve's `verify.js` computes the webhook HMAC with Node's
// `node:crypto` `createHmac("sha256")` + `timingSafeEqual` — Node built-ins
// absent in the Deno worker — so the HMAC is REIMPLEMENTED on **WebCrypto**
// (`crypto.subtle`, HMAC + SHA-256). The algorithm is byte-for-byte eve's:
// `sha256=` + lowercase-hex HMAC-SHA256 over the RAW request body, keyed by
// `GITHUB_WEBHOOK_SECRET`, constant-time compared against `X-Hub-Signature-256`.
// This signature check is the ONLY authentication for the webhook, so it fails
// CLOSED on a missing secret. `verifyGitHubInbound` returns null instead of
// throwing so a route can turn it into a 401 BEFORE any session work. See
// vendor/VENDOR.md.

import { bytesToHex, timingSafeEqual } from "./shared.ts";
import { type GitHubCredential, resolveGitHubWebhookSecret } from "./auth.ts";

/**
 * Caller-supplied inbound verifier. Replaces the signature check when an
 * integration authenticates forwarded webhooks upstream. Return falsy to reject;
 * a string to accept and use it as the (rewritten) raw body; any other truthy
 * value to accept and keep the original body.
 */
export type GitHubWebhookVerifier = (request: Request, body: string) => unknown | Promise<unknown>;

export interface GitHubVerifyOptions {
  readonly webhookSecret?: GitHubCredential;
  readonly webhookVerifier?: GitHubWebhookVerifier;
}

/** Computes the `sha256=<hex>` signature GitHub sends in `X-Hub-Signature-256`. */
export async function signGitHubWebhookBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `sha256=${bytesToHex(new Uint8Array(sig))}`;
}

/**
 * Reads + verifies an inbound GitHub webhook, returning the RAW body on success.
 * Throws when the signature header is missing, no secret is configured, or the
 * computed HMAC does not match. The body is read ONCE and the signature is over
 * that exact bytes (not a re-serialization), matching GitHub + eve.
 */
export async function readGitHubWebhook(request: Request, options: GitHubVerifyOptions): Promise<string> {
  const body = await request.text();

  if (options.webhookVerifier !== undefined) {
    const result = await options.webhookVerifier(request, body);
    if (!result) throw new Error("githubChannel: inbound webhook verifier rejected the request.");
    return typeof result === "string" ? result : body;
  }

  const provided = request.headers.get("x-hub-signature-256") ?? "";
  if (!provided) throw new Error("githubChannel: inbound request missing X-Hub-Signature-256.");
  const secret = await resolveGitHubWebhookSecret(options.webhookSecret);
  if (!timingSafeEqual(await signGitHubWebhookBody(body, secret), provided)) {
    throw new Error("githubChannel: inbound request signature mismatch.");
  }
  return body;
}

/**
 * Verifies an inbound GitHub request, returning the RAW body on success or `null`
 * on ANY failure (missing/invalid signature, missing secret) so a route can turn
 * the null into a 401 BEFORE any session work — this signature check is the only
 * thing gating the unauthenticated webhook.
 */
export async function verifyGitHubInbound(request: Request, options: GitHubVerifyOptions): Promise<string | null> {
  try {
    return await readGitHubWebhook(request, options);
  } catch (error) {
    console.warn("github inbound verification failed", error);
    return null;
  }
}
