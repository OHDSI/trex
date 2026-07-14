// Vendored from eve@0.19.0 dist/src/public/channels/discord/api.js (Apache-2.0).
// Modified: imports rewritten from `#shared/json` + `#public/channels/discord/verify`
// to the sibling `./shared.ts` / `./verify.ts`; `process.env` fallbacks swapped
// for `getEnv` (Deno.env); types added from the paired api.d.ts. REST logic
// (message splitting, followups, allowed-mentions defaulting) unchanged. See
// vendor/VENDOR.md.

import { getEnv, isObject, type JsonObject, parseJsonObject } from "./shared.ts";
import { type DiscordPublicKey, resolveDiscordPublicKey } from "./verify.ts";

export { resolveDiscordPublicKey };

export type DiscordApplicationId = string | (() => string | Promise<string>);
export type DiscordBotToken = string | (() => string | Promise<string>);
export type DiscordFetch = typeof fetch;

export interface DiscordCredentials {
  readonly applicationId?: DiscordApplicationId;
  readonly botToken?: DiscordBotToken;
  readonly publicKey?: DiscordPublicKey;
}

export interface DiscordApiOptions {
  readonly apiBaseUrl?: string;
  readonly credentials?: DiscordCredentials;
  readonly fetch?: DiscordFetch;
}

export interface DiscordApiResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
}

export interface DiscordPostedMessage {
  readonly id: string;
  readonly channelId?: string;
  readonly raw: unknown;
}

export interface DiscordMessageBody {
  readonly allowed_mentions?: Readonly<Record<string, unknown>>;
  readonly components?: readonly Readonly<Record<string, unknown>>[];
  readonly content?: string;
  readonly flags?: number;
  readonly tts?: boolean;
}

/** Allowed mentions payload that suppresses all generated pings. */
export const DISCORD_NO_MENTIONS: JsonObject = { parse: [] };

/** Discord's documented message-content cap. */
export const DISCORD_MESSAGE_CONTENT_MAX_LENGTH = 2000;

/** Builds the channel-local continuation token (`<channelId>:<conversationId>`). */
export function discordContinuationToken(channelId: string, conversationId: string | undefined): string {
  return `${channelId}:${conversationId ?? ""}`;
}

/** Resolves a Discord application id, falling back to `DISCORD_APPLICATION_ID`. */
export async function resolveDiscordApplicationId(applicationId?: DiscordApplicationId): Promise<string> {
  const id = applicationId ?? getEnv("DISCORD_APPLICATION_ID");
  if (!id) throw new Error("DISCORD_APPLICATION_ID is required.");
  return typeof id === "function" ? await id() : id;
}

/** Resolves a Discord bot token, falling back to `DISCORD_BOT_TOKEN`. */
export async function resolveDiscordBotToken(botToken?: DiscordBotToken): Promise<string> {
  const token = botToken ?? getEnv("DISCORD_BOT_TOKEN");
  if (!token) throw new Error("DISCORD_BOT_TOKEN is required.");
  return typeof token === "function" ? await token() : token;
}

/**
 * Low-level Discord JSON API call. Defaults to POST against
 * `https://discord.com/api/v10`. Bot-token auth is added only when a token is
 * supplied (interaction webhook endpoints run unauthenticated). Does not throw
 * on non-2xx, so callers must inspect `ok`/`status`.
 */
export async function callDiscordApi(input: {
  readonly apiBaseUrl?: string;
  readonly body?: JsonObject;
  readonly botToken?: DiscordBotToken;
  readonly fetch?: DiscordFetch;
  readonly method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
  readonly path: string;
}): Promise<DiscordApiResponse> {
  const doFetch = input.fetch ?? fetch;
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  if (input.botToken !== undefined) {
    const token = await resolveDiscordBotToken(input.botToken);
    headers.set("authorization", `Bot ${token}`);
  }
  const init: RequestInit = { headers, method: input.method ?? "POST" };
  if (input.body !== undefined) init.body = JSON.stringify(parseJsonObject(input.body));
  const response = await doFetch(`${input.apiBaseUrl ?? "https://discord.com/api/v10"}${input.path}`, init);
  return { body: await parseResponseBody(response), ok: response.ok, status: response.status };
}

/** Sends a bot-authenticated message to one Discord channel. */
export async function sendDiscordChannelMessage(
  input: DiscordApiOptions & { readonly body: DiscordMessageBody; readonly channelId: string },
): Promise<DiscordPostedMessage> {
  const result = await callDiscordApi({
    apiBaseUrl: input.apiBaseUrl,
    body: normalizeMessageBody(input.body),
    botToken: input.credentials?.botToken,
    fetch: input.fetch,
    path: `/channels/${encodeURIComponent(input.channelId)}/messages`,
  });
  if (!result.ok) throw new Error(`Discord create message failed with HTTP ${result.status}.`);
  return toPostedMessage(result.body);
}

/** Triggers Discord's short-lived channel typing indicator with bot auth. */
export async function triggerDiscordTypingIndicator(
  input: DiscordApiOptions & { readonly channelId: string },
): Promise<void> {
  const result = await callDiscordApi({
    apiBaseUrl: input.apiBaseUrl,
    botToken: input.credentials?.botToken,
    fetch: input.fetch,
    path: `/channels/${encodeURIComponent(input.channelId)}/typing`,
  });
  if (!result.ok) throw new Error(`Discord typing indicator failed with HTTP ${result.status}.`);
}

/** Edits the original response for a deferred Discord interaction. */
export async function editDiscordOriginalResponse(
  input: DiscordApiOptions & { readonly body: DiscordMessageBody; readonly interactionToken: string },
): Promise<DiscordPostedMessage> {
  const applicationId = await resolveDiscordApplicationId(input.credentials?.applicationId);
  const result = await callDiscordApi({
    apiBaseUrl: input.apiBaseUrl,
    body: normalizeMessageBody(input.body),
    fetch: input.fetch,
    method: "PATCH",
    path: `/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(input.interactionToken)}/messages/@original`,
  });
  if (!result.ok) throw new Error(`Discord edit original response failed with HTTP ${result.status}.`);
  return toPostedMessage(result.body);
}

/** Creates a Discord interaction followup message. */
export async function createDiscordFollowupMessage(
  input: DiscordApiOptions & { readonly body: DiscordMessageBody; readonly interactionToken: string },
): Promise<DiscordPostedMessage> {
  const applicationId = await resolveDiscordApplicationId(input.credentials?.applicationId);
  const result = await callDiscordApi({
    apiBaseUrl: input.apiBaseUrl,
    body: normalizeMessageBody(input.body),
    fetch: input.fetch,
    path: `/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(input.interactionToken)}`,
  });
  if (!result.ok) throw new Error(`Discord followup message failed with HTTP ${result.status}.`);
  return toPostedMessage(result.body);
}

/**
 * Splits text into chunks Discord accepts as individual message contents. An
 * empty string yields one empty chunk so callers can handle no-content messages.
 */
export function splitDiscordMessageContent(content: string): string[] {
  if (content.length <= DISCORD_MESSAGE_CONTENT_MAX_LENGTH) return [content];
  const out: string[] = [];
  let rest = content;
  while (rest.length > DISCORD_MESSAGE_CONTENT_MAX_LENGTH) {
    let cut = rest.lastIndexOf("\n", DISCORD_MESSAGE_CONTENT_MAX_LENGTH);
    if (cut <= 0) cut = rest.lastIndexOf(" ", DISCORD_MESSAGE_CONTENT_MAX_LENGTH);
    if (cut <= 0) cut = DISCORD_MESSAGE_CONTENT_MAX_LENGTH;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

function normalizeMessageBody(body: DiscordMessageBody): JsonObject {
  const next: Record<string, unknown> = { ...body };
  if (next.allowed_mentions === undefined) next.allowed_mentions = DISCORD_NO_MENTIONS;
  return parseJsonObject(next);
}

function toPostedMessage(body: unknown): DiscordPostedMessage {
  const obj = isObject(body) ? body : {};
  return {
    channelId: typeof obj.channel_id === "string" ? obj.channel_id : undefined,
    id: typeof obj.id === "string" ? obj.id : "",
    raw: body,
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
