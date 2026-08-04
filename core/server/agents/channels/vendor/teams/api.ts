// Vendored from eve@0.19.0 dist/src/public/channels/teams/api.js (Apache-2.0),
// de-minified. eve's `api.js` is PURE — its only imports are `#shared/guards`
// (isObject) and `#shared/json` (parseJsonObject), consolidated into the sibling
// `shared.ts`, so no eve import survives. The delivery-token flow is eve's,
// unchanged: a Bot Framework **client-credentials** token (POST
// `login.microsoftonline.com/{tenant}/oauth2/v2.0/token` with
// `client_id=MICROSOFT_APP_ID`, `client_secret=MICROSOFT_APP_PASSWORD`,
// `scope=https://api.botframework.com/.default`, `grant_type=client_credentials`)
// CACHED until 60s before expiry, then used as `Authorization: Bearer <token>`
// on the reply Activity. `process.env.*` → `getEnv` (Deno.env). Modified: only
// the delivery path the trex factory needs is kept (YAGNI) — the token
// resolvers, `callTeamsConnectorApi`, `replyToTeamsActivity`,
// `sendTeamsActivity`, `splitTeamsMessageText`, `teamsContinuationToken`. eve's
// `updateTeamsActivity` / `triggerTeamsTypingIndicator` / `normalizeTeamsPostInput`
// / `normalizeAccessTokenResult` (typing indicators + edit/update are runtime
// niceties) are DROPPED. See vendor/VENDOR.md.

import { getEnv, isObject, type JsonObject, parseJsonObject } from "./shared.ts";

/** A Teams credential: a literal, or a sync/async provider (secret store). */
export type TeamsCredential = string | (() => string | Promise<string>);

/** Fetch implementation override for tests or non-standard runtimes. */
export type TeamsFetch = typeof fetch;

/** Teams REST/token transport overrides. */
export interface TeamsApiOptions {
  readonly fetch?: TeamsFetch;
  /** Override the Azure AD login host (default `https://login.microsoftonline.com`). */
  readonly loginBaseUrl?: string;
}

/** Teams bot credentials (each falls back to `MICROSOFT_*` / `TEAMS_*` env). */
export interface TeamsCredentials {
  readonly appId?: TeamsCredential;
  readonly appPassword?: TeamsCredential;
  readonly tenantId?: TeamsCredential;
  /** A pre-minted access-token provider — short-circuits the client-credentials exchange. */
  readonly tokenProvider?: () => string | Promise<string>;
}

const TEAMS_MESSAGE_TEXT_MAX_LENGTH = 80 * 1024;
const BOT_FRAMEWORK_TENANT = "botframework.com";

// Module-level access-token cache keyed by login-host + tenant + app id.
const accessTokenCache = new Map<string, { accessToken: string; expiresAtMs: number }>();

/** Clears the access-token cache (tests / credential rotation). */
export function clearTeamsAccessTokenCache(): void {
  accessTokenCache.clear();
}

/** Resolves the app id (the `aud` + the client id), fail closed. */
export async function resolveTeamsAppId(appId?: TeamsCredential): Promise<string> {
  const v = appId ?? getEnv("MICROSOFT_APP_ID") ?? getEnv("TEAMS_APP_ID");
  if (v === undefined || v === "") throw new Error("teamsChannel: MICROSOFT_APP_ID is required.");
  return typeof v === "function" ? await v() : v;
}

/** Resolves the app password (the client secret), fail closed. */
export async function resolveTeamsAppPassword(appPassword?: TeamsCredential): Promise<string> {
  const v = appPassword ?? getEnv("MICROSOFT_APP_PASSWORD") ?? getEnv("TEAMS_APP_PASSWORD");
  if (v === undefined || v === "") throw new Error("teamsChannel: MICROSOFT_APP_PASSWORD is required.");
  return typeof v === "function" ? await v() : v;
}

/** Resolves the (optional) single-tenant id; undefined uses the multi-tenant `botframework.com`. */
export async function resolveTeamsTenantId(tenantId?: TeamsCredential): Promise<string | undefined> {
  const v = tenantId ?? getEnv("MICROSOFT_TENANT_ID") ?? getEnv("TEAMS_TENANT_ID");
  if (v === undefined || v === "") return undefined;
  return typeof v === "function" ? await v() : v;
}

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Resolves a Bot Framework connector bearer token via the OAuth2
 * client-credentials grant, cached until 60s before expiry. A
 * `credentials.tokenProvider` short-circuits the exchange.
 */
export async function resolveTeamsAccessToken(input: {
  readonly api?: TeamsApiOptions;
  readonly credentials?: TeamsCredentials;
  readonly now?: () => number;
}): Promise<string> {
  const creds = input.credentials;
  if (creds?.tokenProvider !== undefined) return await creds.tokenProvider();

  const appId = await resolveTeamsAppId(creds?.appId);
  const appPassword = await resolveTeamsAppPassword(creds?.appPassword);
  const tenantId = await resolveTeamsTenantId(creds?.tenantId);
  const loginBaseUrl = trimTrailingSlash(input.api?.loginBaseUrl ?? "https://login.microsoftonline.com");
  const tenant = tenantId ?? BOT_FRAMEWORK_TENANT;
  const cacheKey = `${loginBaseUrl}:${tenant}:${appId}`;
  const nowMs = input.now?.() ?? Date.now();
  const cached = accessTokenCache.get(cacheKey);
  if (cached !== undefined && cached.expiresAtMs - 60_000 > nowMs) return cached.accessToken;

  const url = `${loginBaseUrl}/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: appId,
    client_secret: appPassword,
    grant_type: "client_credentials",
    scope: "https://api.botframework.com/.default",
  });
  const res = await (input.api?.fetch ?? fetch)(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const parsed = await parseResponseBody(res);
  if (!res.ok) throw new Error(`teamsChannel: access-token request failed with HTTP ${res.status}.`);
  const obj = isObject(parsed) ? parsed : {};
  const accessToken = typeof obj.access_token === "string" ? obj.access_token : "";
  if (!accessToken) throw new Error("teamsChannel: access-token response did not include access_token.");
  const expiresInSeconds = typeof obj.expires_in === "number" ? obj.expires_in : 3600;
  accessTokenCache.set(cacheKey, { accessToken, expiresAtMs: nowMs + expiresInSeconds * 1000 });
  return accessToken;
}

/** Decoded result of a Teams connector JSON REST call. */
export interface TeamsApiResponse {
  readonly body: unknown;
  readonly ok: boolean;
  readonly status: number;
}

/**
 * Low-level Bot Framework connector call: attaches the `Bearer <access token>`,
 * JSON-encodes the body, and POSTs to `${serviceUrl}${path}`.
 */
export async function callTeamsConnectorApi(input: {
  readonly api?: TeamsApiOptions;
  readonly body?: unknown;
  readonly credentials?: TeamsCredentials;
  readonly method?: string;
  readonly now?: () => number;
  readonly path: string;
  readonly serviceUrl: string;
}): Promise<TeamsApiResponse> {
  const doFetch = input.api?.fetch ?? fetch;
  const headers = new Headers();
  headers.set("authorization", `Bearer ${await resolveTeamsAccessToken(input)}`);
  headers.set("content-type", "application/json; charset=utf-8");
  const init: RequestInit = { headers, method: input.method ?? "POST" };
  if (input.body !== undefined) init.body = JSON.stringify(parseJsonObject(input.body));
  const res = await doFetch(`${trimTrailingSlash(input.serviceUrl)}${input.path}`, init);
  return { body: await parseResponseBody(res), ok: res.ok, status: res.status };
}

/** One posted Activity normalized from the connector response. */
export interface TeamsPostedActivity {
  readonly id: string;
  readonly raw: unknown;
}

function toPostedActivity(raw: unknown): TeamsPostedActivity {
  const o = isObject(raw) ? raw : {};
  return { id: typeof o.id === "string" ? o.id : "", raw };
}

/** Posts a NEW Activity to a conversation: `POST /v3/conversations/{id}/activities`. */
export async function sendTeamsActivity(input: {
  readonly api?: TeamsApiOptions;
  readonly body: JsonObject;
  readonly conversationId: string;
  readonly credentials?: TeamsCredentials;
  readonly now?: () => number;
  readonly serviceUrl: string;
}): Promise<TeamsPostedActivity> {
  const res = await callTeamsConnectorApi({
    ...input,
    path: `/v3/conversations/${encodeURIComponent(input.conversationId)}/activities`,
  });
  if (!res.ok) throw new Error(`teamsChannel: send activity failed with HTTP ${res.status}.`);
  return toPostedActivity(res.body);
}

/** Replies to an Activity: `POST /v3/conversations/{id}/activities/{activityId}`. */
export async function replyToTeamsActivity(input: {
  readonly activityId: string;
  readonly api?: TeamsApiOptions;
  readonly body: JsonObject;
  readonly conversationId: string;
  readonly credentials?: TeamsCredentials;
  readonly now?: () => number;
  readonly serviceUrl: string;
}): Promise<TeamsPostedActivity> {
  const res = await callTeamsConnectorApi({
    ...input,
    path: `/v3/conversations/${encodeURIComponent(input.conversationId)}/activities/${
      encodeURIComponent(input.activityId)
    }`,
  });
  if (!res.ok) throw new Error(`teamsChannel: reply activity failed with HTTP ${res.status}.`);
  return toPostedActivity(res.body);
}

/**
 * Splits a reply into chunks the Teams message API will accept (<= ~80 KB each),
 * preferring a blank-line, then newline, then space boundary near the cap so
 * words/paragraphs are not cut mid-token. eve's algorithm, unchanged.
 */
export function splitTeamsMessageText(text: string): readonly string[] {
  if (text.length <= TEAMS_MESSAGE_TEXT_MAX_LENGTH) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > TEAMS_MESSAGE_TEXT_MAX_LENGTH) {
    let cut = rest.lastIndexOf("\n\n", TEAMS_MESSAGE_TEXT_MAX_LENGTH);
    if (cut <= 0) cut = rest.lastIndexOf("\n", TEAMS_MESSAGE_TEXT_MAX_LENGTH);
    if (cut <= 0) cut = rest.lastIndexOf(" ", TEAMS_MESSAGE_TEXT_MAX_LENGTH);
    if (cut <= 0) cut = TEAMS_MESSAGE_TEXT_MAX_LENGTH;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

/** Raw continuation token for a Teams conversation — `conversation.id` is the session key. */
export function teamsContinuationToken(conversationId: string): string {
  return conversationId;
}

export { TEAMS_MESSAGE_TEXT_MAX_LENGTH };
