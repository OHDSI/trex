// Reimplemented from eve@0.19.0 dist/src/public/channels/github/auth.js
// (Apache-2.0). eve's `auth.js` mints the GitHub App JWT with Node's
// `node:crypto` `createSign("RSA-SHA256")` — a Node built-in that does not exist
// in the Deno worker — so the RS256 signing is REIMPLEMENTED on **WebCrypto**
// (`crypto.subtle`, RSASSA-PKCS1-v1_5 + SHA-256, importing the PKCS8 private
// key). Everything else — the JWT header/claims shape (`{alg:"RS256",typ:"JWT"}`
// / `{iss, iat:now-60, exp:now+600}`), the `/app/installations/{id}/access_tokens`
// exchange, the 60s-skew installation-token cache, and the resolver fallbacks to
// `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` — is
// eve's, unchanged. `process.env` → `getEnv` (Deno.env). NOTE (flagged): the
// RS256 rewrite is the one place the crypto backend differs from eve; it is
// exercised by github.test.ts (JWT header/claims shape + a full mock
// mint→exchange→verify round-trip). See vendor/VENDOR.md.

import { getEnv, isObject } from "./shared.ts";

/** A GitHub credential: a literal, or a sync/async provider (secret store). */
export type GitHubCredential = string | (() => string | Promise<string>);

/** Fetch implementation override for tests or non-standard runtimes. */
export type GitHubFetch = typeof fetch;

/** REST transport overrides. */
export interface GitHubApiOptions {
  readonly apiBaseUrl?: string;
  readonly fetch?: GitHubFetch;
}

/** GitHub App / installation credentials (each falls back to `GITHUB_*` env). */
export interface GitHubCredentials {
  readonly appId?: GitHubCredential;
  readonly privateKey?: GitHubCredential;
  readonly webhookSecret?: GitHubCredential;
  /** A pre-minted installation token — short-circuits the JWT mint + exchange. */
  readonly installationToken?: GitHubCredential;
}

const installationTokenCache = new Map<string, { token: string; expiresAtMs: number }>();

/** Resolves the App id, falling back to `GITHUB_APP_ID` (fail closed). */
export async function resolveGitHubAppId(appId?: GitHubCredential): Promise<string> {
  const v = appId ?? getEnv("GITHUB_APP_ID");
  if (v === undefined || v === "") throw new Error("githubChannel: GITHUB_APP_ID is required.");
  return String(typeof v === "function" ? await v() : v);
}

/** Resolves the App private key (PKCS8 PEM), falling back to `GITHUB_APP_PRIVATE_KEY`. */
export async function resolveGitHubPrivateKey(privateKey?: GitHubCredential): Promise<string> {
  const v = privateKey ?? getEnv("GITHUB_APP_PRIVATE_KEY");
  if (!v) throw new Error("githubChannel: GITHUB_APP_PRIVATE_KEY is required.");
  return normalizeGitHubPrivateKey(typeof v === "function" ? await v() : v);
}

/** Resolves the webhook secret, falling back to `GITHUB_WEBHOOK_SECRET` (fail closed). */
export async function resolveGitHubWebhookSecret(webhookSecret?: GitHubCredential): Promise<string> {
  const v = webhookSecret ?? getEnv("GITHUB_WEBHOOK_SECRET");
  if (!v) throw new Error("githubChannel: GITHUB_WEBHOOK_SECRET is required.");
  return typeof v === "function" ? await v() : v;
}

/** Un-escapes `\n` sequences a single-line env var uses to store a PEM's newlines. */
export function normalizeGitHubPrivateKey(key: string): string {
  return key.replace(/\\n/gu, "\n");
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlJson(value: unknown): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

/** Decodes a PKCS8 PEM into its DER bytes (strips the `-----BEGIN/END-----` armor). */
function pkcs8DerFromPem(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

/**
 * Mints a short-lived GitHub App JWT (RS256): the standard `{alg:"RS256",
 * typ:"JWT"}` header over `{iss:appId, iat:now-60, exp:now+600}`, signed with the
 * App private key via WebCrypto RSASSA-PKCS1-v1_5 + SHA-256. `now` is injectable
 * for deterministic tests.
 */
export async function createGitHubAppJwt(input: {
  readonly appId?: GitHubCredential;
  readonly privateKey?: GitHubCredential;
  readonly now?: Date;
}): Promise<string> {
  const iss = await resolveGitHubAppId(input.appId);
  const pem = await resolveGitHubPrivateKey(input.privateKey);
  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = { exp: nowSeconds + 600, iat: nowSeconds - 60, iss };
  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(claims)}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8DerFromPem(pem).buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlFromBytes(new Uint8Array(sig))}`;
}

/**
 * Resolves an installation token for authenticated GitHub API calls: a pinned
 * `credentials.installationToken` short-circuits; otherwise it mints an App JWT
 * and exchanges it for a cached installation token. Throws when no installation
 * id is available.
 */
export async function resolveGitHubInstallationToken(input: {
  readonly api?: GitHubApiOptions;
  readonly credentials?: GitHubCredentials;
  readonly installationId?: number | string;
}): Promise<string> {
  const pinned = input.credentials?.installationToken;
  if (pinned !== undefined) return typeof pinned === "function" ? await pinned() : pinned;
  if (input.installationId === undefined) {
    throw new Error("githubChannel: installationId is required for authenticated GitHub API calls.");
  }
  return createGitHubInstallationToken({
    api: input.api,
    appId: input.credentials?.appId,
    installationId: input.installationId,
    privateKey: input.credentials?.privateKey,
  });
}

/** Mints (or returns a cached) installation token via the App-JWT → access-tokens exchange. */
export async function createGitHubInstallationToken(input: {
  readonly api?: GitHubApiOptions;
  readonly appId?: GitHubCredential;
  readonly installationId: number | string;
  readonly privateKey?: GitHubCredential;
}): Promise<string> {
  const appId = await resolveGitHubAppId(input.appId);
  const apiBaseUrl = input.api?.apiBaseUrl ?? "https://api.github.com";
  const cacheKey = `${apiBaseUrl}:${appId}:${input.installationId}`;
  const cached = installationTokenCache.get(cacheKey);
  if (cached !== undefined && Date.now() < cached.expiresAtMs - 60_000) return cached.token;

  const jwt = await createGitHubAppJwt({ appId, privateKey: input.privateKey });
  const res = await (input.api?.fetch ?? fetch)(
    `${apiBaseUrl}/app/installations/${input.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${jwt}`,
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  const body = await parseJsonBody(res);
  if (!res.ok) throw new Error(`githubChannel: create installation token failed with HTTP ${res.status}.`);
  if (!isObject(body) || typeof body.token !== "string") {
    throw new Error("githubChannel: installation token response did not include a token.");
  }
  const expiresAtMs = parseExpiryMs(body.expires_at);
  installationTokenCache.set(cacheKey, { expiresAtMs, token: body.token });
  return body.token;
}

/** Clears the installation-token cache (tests / credential rotation). */
export function clearGitHubInstallationTokenCache(): void {
  installationTokenCache.clear();
}

/** Seeds the installation-token cache directly, skipping the JWT exchange (tests). */
export function seedGitHubInstallationTokenForTests(input: {
  readonly apiBaseUrl?: string;
  readonly appId?: string;
  readonly installationId: number | string;
  readonly token: string;
}): void {
  const apiBaseUrl = input.apiBaseUrl ?? "https://api.github.com";
  const appId = input.appId ?? "test-app";
  installationTokenCache.set(`${apiBaseUrl}:${appId}:${input.installationId}`, {
    expiresAtMs: Date.now() + 3600 * 1000,
    token: input.token,
  });
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseExpiryMs(v: unknown): number {
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  return Date.now() + 3600 * 1000;
}
