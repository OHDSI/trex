// Reimplemented from eve@0.19.0 dist/src/public/channels/twilio/inbound.js +
// dist/src/compiled/@chat-adapter/twilio/webhook.js (`parseTwilioWebhookBody`).
// The pure `inbound.js` wrapper delegates the actual param parsing to a
// `#compiled` module that resolves to a BUNDLED, MINIFIED chunk
// (`dist/src/compiled/_chunks/node/chunk-QZV7YRVM-*.js`), which is not
// vendorable as readable source — so the parse is REIMPLEMENTED from that chunk
// and labelled honestly (Apache-2.0). Only the SMS (text) path + context block
// are kept; the voice-call / transcription parsers are DEFERRED with voice. The
// classification logic (status vs text vs unsupported, NumMedia handling) is
// eve's, unchanged. See vendor/VENDOR.md.

/** One inbound media attachment on an MMS message. */
export interface TwilioMedia {
  readonly contentType?: string;
  readonly url: string;
}

/** Channel-owned representation of one inbound Twilio SMS/MMS message. */
export interface TwilioTextMessage {
  readonly accountSid?: string;
  readonly body: string;
  readonly from: string;
  readonly media: readonly TwilioMedia[];
  readonly messageSid?: string;
  readonly raw: URLSearchParams;
  readonly to: string;
}

function get(params: URLSearchParams, key: string): string | undefined {
  const v = params.get(key);
  return v === null || v.length === 0 ? undefined : v;
}

function parseMedia(params: URLSearchParams): TwilioMedia[] {
  const count = Number(get(params, "NumMedia") ?? 0);
  const out: TwilioMedia[] = [];
  for (let i = 0; i < count; i++) {
    const url = get(params, `MediaUrl${i}`);
    if (url) out.push({ contentType: get(params, `MediaContentType${i}`), url });
  }
  return out;
}

/**
 * Parses a decoded Twilio webhook form into an inbound SMS/MMS message, or
 * `null` when the payload is a delivery-status callback or an otherwise
 * unsupported shape. A message qualifies as text when it carries both `From` and
 * `To` and either a `Body` or at least one media part (eve's rule).
 */
export function parseTwilioTextMessage(params: URLSearchParams): TwilioTextMessage | null {
  const status = get(params, "MessageStatus") ?? get(params, "SmsStatus");
  const body = get(params, "Body");
  const from = get(params, "From");
  const to = get(params, "To");
  const messageSid = get(params, "MessageSid") ?? get(params, "SmsMessageSid");

  // A status callback (has a MessageStatus and no Body) is not an inbound message.
  if (status && body === undefined) return null;
  if (!from || !to) return null;
  const hasMedia = Number(get(params, "NumMedia") ?? 0) > 0;
  if (body === undefined && !hasMedia) return null;

  return {
    accountSid: get(params, "AccountSid"),
    body: body ?? "",
    from,
    media: parseMedia(params),
    messageSid,
    raw: params,
    to,
  };
}

/** Identity + response guidance for the model-visible context block. */
export interface TwilioInboundContext {
  readonly from: string;
  readonly to?: string;
  readonly messageSid?: string;
}

/** Renders one context block with fixed SMS response instructions + identity. */
export function formatTwilioContextBlock(context: TwilioInboundContext): string {
  return [
    "<twilio_context>",
    "channel: text",
    "response_medium: sms",
    "response_instructions: Reply for SMS in plain text. Keep the response concise and avoid Markdown formatting, tables, headings, code fences, and long lists. Ask at most one short follow-up question when more information is needed.",
    `from: ${context.from}`,
    ...(context.to ? [`to: ${context.to}`] : []),
    ...(context.messageSid ? [`message_sid: ${context.messageSid}`] : []),
    "</twilio_context>",
  ].join("\n");
}
