// Reimplemented from eve@0.19.0 dist/src/public/channels/twilio/api.js +
// dist/src/compiled/@chat-adapter/twilio/api.js. The pure `api.js` wrapper
// re-exports its REST primitives (`callTwilioApi`, `sendTwilioMessage`,
// `encodeTwilioForm`, `resolveTwilioCredential`, `TwilioApiError`) from a
// `#compiled/@chat-adapter/twilio/api.js` module that resolves to a BUNDLED,
// MINIFIED chunk (`dist/src/compiled/_chunks/node/chunk-5OX2R7AJ-*.js`), which is
// not vendorable as readable source — so the REST logic is REIMPLEMENTED from
// that chunk and labelled honestly (Apache-2.0). `process.env` → `getEnv`
// (Deno.env). Only the SMS-send path the trex factory needs is kept (YAGNI): the
// media fetch, message get/delete/list, and voice `updateCall` helpers are
// dropped. The `splitTwilioMessageBody` segmenter is trex-added (see its doc).
// Credential resolution, Basic-auth header, and Messages.json shape are eve's,
// unchanged. See vendor/VENDOR.md.

import { getEnv } from "./shared.ts";
import type { TwilioAuthToken } from "./verify.ts";

/** Twilio account SID, materialized directly or from an async secret provider. */
export type TwilioAccountSid = string | (() => string | Promise<string>);

/** Fetch implementation override for tests or non-standard runtimes. */
export type TwilioFetch = typeof fetch;

/** Credentials for the native Twilio channel. */
export interface TwilioCredentials {
  readonly accountSid?: TwilioAccountSid;
  readonly authToken?: TwilioAuthToken;
}

/** Decoded result of a Twilio JSON REST call. */
export interface TwilioApiResponse {
  readonly body: unknown;
  readonly ok: boolean;
  readonly status: number;
}

const DEFAULT_API_BASE_URL = "https://api.twilio.com";

/**
 * Twilio's per-request Body cap. Twilio auto-segments SMS at the carrier, but a
 * single Messages.json request rejects a Body over 1600 chars, so replies longer
 * than this are split into multiple sends.
 */
export const TWILIO_MESSAGE_BODY_MAX_LENGTH = 1600;

/** Error carrying a non-2xx Twilio REST response (or status 0 for missing creds). */
export class TwilioApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, init: { status: number; body: unknown }) {
    super(message);
    this.name = "TwilioApiError";
    this.status = init.status;
    this.body = init.body;
  }
}

/** Resolves a credential from an explicit value or the given env var (fail closed). */
export async function resolveTwilioCredential(
  value: string | (() => string | Promise<string>) | undefined,
  envName: string,
): Promise<string> {
  const v = value ?? getEnv(envName);
  if (!v) throw new TwilioApiError(`${envName} is required`, { body: null, status: 0 });
  return typeof v === "function" ? await v() : v;
}

/** Resolves the Twilio account SID, falling back to `TWILIO_ACCOUNT_SID`. */
export function resolveTwilioAccountSid(sid?: TwilioAccountSid): Promise<string> {
  return resolveTwilioCredential(sid, "TWILIO_ACCOUNT_SID");
}

/** Resolves the Twilio auth token, falling back to `TWILIO_AUTH_TOKEN`. */
export function resolveTwilioAuthToken(token?: TwilioAuthToken): Promise<string> {
  return resolveTwilioCredential(token, "TWILIO_AUTH_TOKEN");
}

/** Encodes a plain object as `application/x-www-form-urlencoded`, dropping nullish values. */
export function encodeTwilioForm(fields: Record<string, unknown>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    if (Array.isArray(v)) {
      for (const item of v) params.append(k, String(item));
      continue;
    }
    params.set(k, String(v));
  }
  return params;
}

function basicAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
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

/** Low-level Twilio REST call (Basic auth, form body), returning body + status. */
export async function callTwilioApi(input: {
  readonly apiBaseUrl?: string;
  readonly body?: URLSearchParams;
  readonly credentials?: TwilioCredentials;
  readonly fetch?: TwilioFetch;
  readonly method?: string;
  readonly path: string;
}): Promise<TwilioApiResponse> {
  const accountSid = await resolveTwilioAccountSid(input.credentials?.accountSid);
  const authToken = await resolveTwilioAuthToken(input.credentials?.authToken);
  const url = new URL(input.path, input.apiBaseUrl ?? DEFAULT_API_BASE_URL);
  const body = input.body;
  const res = await (input.fetch ?? fetch)(url, {
    method: input.method ?? "POST",
    headers: {
      authorization: basicAuthHeader(accountSid, authToken),
      ...(body ? { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" } : {}),
    },
    body,
  });
  const parsed = await parseResponseBody(res);
  if (!res.ok) throw new TwilioApiError(`Twilio API returned HTTP ${res.status}`, { body: parsed, status: res.status });
  return { body: parsed, ok: res.ok, status: res.status };
}

/**
 * Sends a single SMS through Twilio's Messages.json REST endpoint. Requires
 * either a `from` number or a `messagingServiceSid` (Twilio's rule). Callers
 * that may exceed `TWILIO_MESSAGE_BODY_MAX_LENGTH` should pre-split with
 * `splitTwilioMessageBody`.
 */
export async function sendTwilioMessage(input: {
  readonly apiBaseUrl?: string;
  readonly body: string;
  readonly credentials?: TwilioCredentials;
  readonly fetch?: TwilioFetch;
  readonly from?: string;
  readonly messagingServiceSid?: string;
  readonly statusCallbackUrl?: string;
  readonly to: string;
}): Promise<TwilioApiResponse> {
  if (!input.from && !input.messagingServiceSid) {
    throw new Error("twilioChannel: sending a message requires from or messagingServiceSid.");
  }
  const accountSid = await resolveTwilioAccountSid(input.credentials?.accountSid);
  return await callTwilioApi({
    apiBaseUrl: input.apiBaseUrl,
    body: encodeTwilioForm({
      Body: input.body,
      From: input.from,
      MessagingServiceSid: input.messagingServiceSid,
      StatusCallback: input.statusCallbackUrl,
      To: input.to,
    }),
    credentials: input.credentials,
    fetch: input.fetch,
    path: `/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
  });
}

/**
 * Splits a reply body into chunks Twilio's Messages.json will accept
 * (<= TWILIO_MESSAGE_BODY_MAX_LENGTH each), preferring newline then space
 * boundaries so words/lines aren't cut mid-token. Mirrors the Telegram splitter.
 */
export function splitTwilioMessageBody(text: string): readonly string[] {
  if (text.length <= TWILIO_MESSAGE_BODY_MAX_LENGTH) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > TWILIO_MESSAGE_BODY_MAX_LENGTH) {
    let cut = rest.lastIndexOf("\n", TWILIO_MESSAGE_BODY_MAX_LENGTH);
    if (cut <= 0) cut = rest.lastIndexOf(" ", TWILIO_MESSAGE_BODY_MAX_LENGTH);
    if (cut <= 0) cut = TWILIO_MESSAGE_BODY_MAX_LENGTH;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  out.push(rest);
  return out;
}

/** Composite continuation token for an SMS conversation: `${from}:${to}`. */
export function twilioContinuationToken(from: string, to?: string): string {
  return `${from}:${to ?? ""}`;
}
