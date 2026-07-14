// Vendored from eve@0.19.0 dist/src/public/channels/telegram/api.js
// (Apache-2.0). Modified: imports `#shared/json` (`parseJsonObject`) +
// `#shared/guards` (`isObject`) + `#public/channels/telegram/inbound`
// (`parseTelegramChatType`) rewritten to siblings `./shared.ts` / `./inbound.ts`;
// `process.env` → `getEnv` (Deno.env); types added from api.d.ts; de-minified.
// Only the helpers the trex factory uses are vendored (YAGNI): the file-download
// (`getFile`/`downloadFile`) and `editMessageReplyMarkup` / composite
// `telegramContinuationToken` helpers were dropped. The REST logic (message
// splitting, JSON call shape) is eve's and unchanged. See vendor/VENDOR.md.

import { getEnv, isObject, type JsonObject, parseJsonObject } from "./shared.ts";
import { parseTelegramChatType, type TelegramChatType } from "./inbound.ts";

/** Telegram bot token, materialized directly or from an async secret provider. */
export type TelegramBotToken = string | (() => string | Promise<string>);

/** Fetch implementation override for tests or non-standard runtimes. */
export type TelegramFetch = typeof fetch;

/** Credentials for the native Telegram channel. */
export interface TelegramCredentials {
  readonly botToken?: TelegramBotToken;
}

/** Common options for the Telegram API helpers. */
export interface TelegramApiOptions {
  readonly apiBaseUrl?: string;
  readonly credentials?: TelegramCredentials;
  readonly fetch?: TelegramFetch;
}

/** Decoded result of a Telegram JSON API call. */
export interface TelegramApiResponse {
  readonly body: unknown;
  readonly ok: boolean;
  readonly status: number;
}

/** Minimal Telegram message object returned by channel write operations. */
export interface TelegramMessageResult {
  readonly id: string;
  readonly chatId?: string;
  readonly chatType?: TelegramChatType;
  readonly raw: unknown;
}

/** Body for Telegram's `sendMessage`. Only `text` is required. */
export interface TelegramMessageBody {
  readonly disable_notification?: boolean;
  readonly link_preview_options?: Readonly<Record<string, unknown>>;
  readonly message_thread_id?: number;
  readonly protect_content?: boolean;
  readonly reply_markup?: Readonly<Record<string, unknown>>;
  readonly reply_parameters?: Readonly<Record<string, unknown>>;
  readonly text: string;
}

/** Telegram's documented text-message cap. */
export const TELEGRAM_MESSAGE_TEXT_MAX_LENGTH = 4096;

/** Resolves a Telegram bot token, falling back to `TELEGRAM_BOT_TOKEN`. */
export async function resolveTelegramBotToken(token?: TelegramBotToken): Promise<string> {
  const t = token ?? getEnv("TELEGRAM_BOT_TOKEN");
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is required.");
  return typeof t === "function" ? await t() : t;
}

/** Low-level Telegram JSON API call. */
export async function callTelegramApi(input: {
  readonly apiBaseUrl?: string;
  readonly body?: JsonObject;
  readonly botToken?: TelegramBotToken;
  readonly fetch?: TelegramFetch;
  readonly method: string;
}): Promise<TelegramApiResponse> {
  const fetchImpl = input.fetch ?? fetch;
  const token = await resolveTelegramBotToken(input.botToken);
  const init: RequestInit = {
    headers: { "content-type": "application/json; charset=utf-8" },
    method: "POST",
  };
  if (input.body !== undefined) init.body = JSON.stringify(parseJsonObject(input.body));
  const res = await fetchImpl(
    `${input.apiBaseUrl ?? "https://api.telegram.org"}/bot${token}/${encodeURIComponent(input.method)}`,
    init,
  );
  return { body: await parseResponseBody(res), ok: res.ok, status: res.status };
}

/** Sends a text message through Telegram's `sendMessage` method. */
export async function sendTelegramMessage(input: TelegramApiOptions & {
  readonly body: TelegramMessageBody;
  readonly chatId: number | string;
}): Promise<TelegramMessageResult> {
  const res = await callTelegramApi({
    apiBaseUrl: input.apiBaseUrl,
    body: normalizeTelegramMessageBody(input.body, input.chatId),
    botToken: input.credentials?.botToken,
    fetch: input.fetch,
    method: "sendMessage",
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed with HTTP ${res.status}.`);
  return toTelegramMessageResult(res.body);
}

/** Sends a Telegram chat action (e.g. `typing`) for the given chat. */
export async function sendTelegramChatAction(input: TelegramApiOptions & {
  readonly action: string;
  readonly chatId: number | string;
  readonly messageThreadId?: number;
}): Promise<TelegramApiResponse> {
  return await callTelegramApi({
    apiBaseUrl: input.apiBaseUrl,
    body: parseJsonObject({ action: input.action, chat_id: input.chatId, message_thread_id: input.messageThreadId }),
    botToken: input.credentials?.botToken,
    fetch: input.fetch,
    method: "sendChatAction",
  });
}

/** Answers a Telegram callback query so the user's client clears the spinner. */
export async function answerTelegramCallbackQuery(input: TelegramApiOptions & {
  readonly callbackQueryId: string;
  readonly showAlert?: boolean;
  readonly text?: string;
}): Promise<TelegramApiResponse> {
  return await callTelegramApi({
    apiBaseUrl: input.apiBaseUrl,
    body: parseJsonObject({ callback_query_id: input.callbackQueryId, show_alert: input.showAlert, text: input.text }),
    botToken: input.credentials?.botToken,
    fetch: input.fetch,
    method: "answerCallbackQuery",
  });
}

/** Splits text into chunks Telegram will accept as individual sendMessage calls. */
export function splitTelegramMessageText(text: string): readonly string[] {
  if (text.length <= TELEGRAM_MESSAGE_TEXT_MAX_LENGTH) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > TELEGRAM_MESSAGE_TEXT_MAX_LENGTH) {
    let cut = rest.lastIndexOf("\n", TELEGRAM_MESSAGE_TEXT_MAX_LENGTH);
    if (cut <= 0) cut = rest.lastIndexOf(" ", TELEGRAM_MESSAGE_TEXT_MAX_LENGTH);
    if (cut <= 0) cut = TELEGRAM_MESSAGE_TEXT_MAX_LENGTH;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

function normalizeTelegramMessageBody(body: TelegramMessageBody, chatId: number | string): JsonObject {
  return parseJsonObject({ ...body, chat_id: chatId });
}

function toTelegramMessageResult(body: unknown): TelegramMessageResult {
  const root = isObject(body) ? body : {};
  const result = isObject(root.result) ? root.result : {};
  const chat = isObject(result.chat) ? result.chat : {};
  return {
    chatId: typeof chat.id === "number" || typeof chat.id === "string" ? String(chat.id) : undefined,
    chatType: parseTelegramChatType(chat.type) ?? undefined,
    id: typeof result.message_id === "number" || typeof result.message_id === "string" ? String(result.message_id) : "",
    raw: body,
  };
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
