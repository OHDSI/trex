// Reimplemented from eve@0.19.0 dist/src/public/channels/slack/api.js (Apache-2.0).
// Modified: eve's `api.js` builds its outbound calls on
// `#compiled/@chat-adapter/slack/api.js` runtime primitives (`callSlackApi`,
// `postSlackMessage`, `uploadSlackFiles`, …) plus `#internal/logging` — NOT
// vendorable — so this is a minimal trex-authored Slack web-API client over the
// vendored pure `encodeSlackApiBody`. It covers exactly what the factory needs:
// `chat.postMessage` (thread reply / HITL card), `views.open` (freeform modal),
// `chat.update` (answered card). The pure `slackContinuationToken` and the
// message splitter live alongside. See vendor/VENDOR.md.

import { encodeSlackApiBody } from "./api-encoding.ts";
import { getEnv, isObject, slackContinuationToken } from "./shared.ts";
import { SLACK_MESSAGE_TEXT_MAX_LENGTH } from "./limits.ts";

export { slackContinuationToken };

export type SlackBotToken = string | (() => string | Promise<string>);
export type SlackFetch = typeof fetch;

export interface SlackCredentials {
  readonly botToken?: SlackBotToken;
  readonly signingSecret?: string | (() => string | Promise<string>);
}

export interface SlackApiOptions {
  readonly apiBaseUrl?: string;
  readonly credentials?: SlackCredentials;
  readonly fetch?: SlackFetch;
}

export interface SlackApiResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body: unknown;
}

export interface SlackPostedMessage {
  readonly id: string;
  readonly channelId?: string;
  readonly raw: unknown;
}

/** Resolves a Slack bot token, falling back to `SLACK_BOT_TOKEN`. */
export async function resolveSlackBotToken(botToken?: SlackBotToken): Promise<string> {
  const token = botToken ?? getEnv("SLACK_BOT_TOKEN");
  if (!token) throw new Error("SLACK_BOT_TOKEN is required.");
  return typeof token === "function" ? await token() : token;
}

/**
 * Low-level Slack web-API call. Form-encodes the body (Slack's native request
 * format), adds bearer auth, and returns the parsed JSON. Does not throw on a
 * transport-level 2xx that carries `ok:false` — callers inspect the body.
 */
export async function callSlackApi(input: {
  readonly operation: string;
  readonly body?: Record<string, unknown>;
  readonly botToken?: SlackBotToken;
  readonly apiBaseUrl?: string;
  readonly fetch?: SlackFetch;
}): Promise<SlackApiResponse> {
  const doFetch = input.fetch ?? fetch;
  const token = await resolveSlackBotToken(input.botToken);
  const encoded = encodeSlackApiBody(input.body ?? {});
  const response = await doFetch(`${input.apiBaseUrl ?? "https://slack.com/api"}/${input.operation}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": `${encoded.contentType}; charset=utf-8`,
    },
    body: encoded.body,
  });
  return { ok: response.ok, status: response.status, body: await parseResponseBody(response) };
}

/** Posts a message with `chat.postMessage`, threaded when `threadTs` is set. */
export async function postSlackMessage(
  input: SlackApiOptions & {
    readonly channelId: string;
    readonly threadTs?: string;
    readonly text?: string;
    readonly blocks?: readonly unknown[];
  },
): Promise<SlackPostedMessage> {
  const body: Record<string, unknown> = { channel: input.channelId, unfurl_links: false, unfurl_media: false };
  if (input.threadTs) body.thread_ts = input.threadTs;
  if (input.blocks !== undefined) body.blocks = input.blocks;
  if (input.text !== undefined) body.text = input.text;
  const result = await callSlackApi({
    operation: "chat.postMessage",
    body,
    botToken: input.credentials?.botToken,
    apiBaseUrl: input.apiBaseUrl,
    fetch: input.fetch,
  });
  if (!result.ok) throw new Error(`Slack chat.postMessage failed with HTTP ${result.status}.`);
  const obj = isObject(result.body) ? result.body : {};
  if (obj.ok === false) throw new Error(`Slack chat.postMessage returned not-ok: ${String(obj.error ?? "unknown_error")}.`);
  return { id: typeof obj.ts === "string" ? obj.ts : "", channelId: typeof obj.channel === "string" ? obj.channel : undefined, raw: result.body };
}

/** Opens a modal with `views.open` for a freeform HITL answer. */
export async function openSlackView(
  input: SlackApiOptions & { readonly triggerId: string; readonly view: Record<string, unknown> },
): Promise<SlackApiResponse> {
  const result = await callSlackApi({
    operation: "views.open",
    body: { trigger_id: input.triggerId, view: input.view },
    botToken: input.credentials?.botToken,
    apiBaseUrl: input.apiBaseUrl,
    fetch: input.fetch,
  });
  if (!result.ok) throw new Error(`Slack views.open failed with HTTP ${result.status}.`);
  return result;
}

/** Replaces a posted message's blocks with `chat.update` (answered HITL card). */
export async function updateSlackMessage(
  input: SlackApiOptions & { readonly channelId: string; readonly ts: string; readonly text: string; readonly blocks: readonly unknown[] },
): Promise<SlackApiResponse> {
  const result = await callSlackApi({
    operation: "chat.update",
    body: { channel: input.channelId, ts: input.ts, blocks: input.blocks, text: input.text },
    botToken: input.credentials?.botToken,
    apiBaseUrl: input.apiBaseUrl,
    fetch: input.fetch,
  });
  if (!result.ok) throw new Error(`Slack chat.update failed with HTTP ${result.status}.`);
  return result;
}

/**
 * Splits reply text into chunks Slack accepts as individual `chat.postMessage`
 * `text` fields (40k cap). An empty string yields one empty chunk so callers can
 * still deliver a no-content message. Prefers to break on a newline, then a
 * space, then hard-cuts.
 */
export function splitSlackMessageText(content: string): string[] {
  if (content.length <= SLACK_MESSAGE_TEXT_MAX_LENGTH) return [content];
  const out: string[] = [];
  let rest = content;
  while (rest.length > SLACK_MESSAGE_TEXT_MAX_LENGTH) {
    let cut = rest.lastIndexOf("\n", SLACK_MESSAGE_TEXT_MAX_LENGTH);
    if (cut <= 0) cut = rest.lastIndexOf(" ", SLACK_MESSAGE_TEXT_MAX_LENGTH);
    if (cut <= 0) cut = SLACK_MESSAGE_TEXT_MAX_LENGTH;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
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
