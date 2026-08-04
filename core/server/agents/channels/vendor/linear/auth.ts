// Vendored from eve@0.19.0 dist/src/public/channels/linear/auth.js
// (Apache-2.0), de-minified. eve's `auth.js` is PURE — two credential resolvers
// with no imports. Modified: `process.env.*` → `getEnv` (Deno.env); the resolver
// logic (provider-or-literal, env fallback chain, fail-closed throw) is eve's,
// unchanged. `resolveLinearAccessToken` keeps eve's full fallback chain
// (`LINEAR_AGENT_ACCESS_TOKEN` → `LINEAR_ACCESS_TOKEN` → `LINEAR_API_KEY` →
// `LINEAR_API_TOKEN`) so the brief's `LINEAR_API_KEY` and an OAuth agent token
// both resolve. See vendor/VENDOR.md.

import { getEnv } from "./shared.ts";

/** A Linear credential: a literal, or a sync/async provider (secret store). */
export type LinearCredential = string | (() => string | Promise<string>);

/** Fetch implementation override for tests or non-standard runtimes. */
export type LinearFetch = typeof fetch;

/** GraphQL transport overrides. */
export interface LinearApiOptions {
  readonly apiBaseUrl?: string;
  readonly fetch?: LinearFetch;
}

/** Linear webhook + API credentials (each falls back to `LINEAR_*` env). */
export interface LinearCredentials {
  /** GraphQL access token / API key. Falls back to `LINEAR_AGENT_ACCESS_TOKEN`/`LINEAR_ACCESS_TOKEN`/`LINEAR_API_KEY`/`LINEAR_API_TOKEN`. */
  readonly accessToken?: LinearCredential;
  /** Webhook signing secret. Falls back to `LINEAR_WEBHOOK_SECRET`. */
  readonly webhookSecret?: LinearCredential;
}

/**
 * Resolves the Linear GraphQL access token, falling back through eve's env
 * chain. Fails CLOSED when none is configured.
 */
export async function resolveLinearAccessToken(accessToken?: LinearCredential): Promise<string> {
  const v = typeof accessToken === "function"
    ? await accessToken()
    : accessToken ?? getEnv("LINEAR_AGENT_ACCESS_TOKEN") ?? getEnv("LINEAR_ACCESS_TOKEN") ?? getEnv("LINEAR_API_KEY") ??
      getEnv("LINEAR_API_TOKEN");
  if (!v) {
    throw new Error(
      "linearChannel: missing Linear access token. Pass credentials.accessToken or set " +
        "LINEAR_AGENT_ACCESS_TOKEN, LINEAR_ACCESS_TOKEN, LINEAR_API_KEY, or LINEAR_API_TOKEN.",
    );
  }
  return v;
}

/**
 * Resolves the Linear webhook signing secret, falling back to
 * `LINEAR_WEBHOOK_SECRET`. Fails CLOSED — the signature is the ONLY webhook auth.
 */
export async function resolveLinearWebhookSecret(webhookSecret?: LinearCredential): Promise<string> {
  const v = typeof webhookSecret === "function" ? await webhookSecret() : webhookSecret ?? getEnv("LINEAR_WEBHOOK_SECRET");
  if (!v) {
    throw new Error(
      "linearChannel: missing webhook secret. Pass credentials.webhookSecret, set LINEAR_WEBHOOK_SECRET, " +
        "or supply credentials.webhookVerifier.",
    );
  }
  return v;
}
