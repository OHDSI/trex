// Reimplemented from eve@0.19.0 dist/src/public/channels/twilio/twiml.js +
// dist/src/compiled/@chat-adapter/twilio/voice.js (`twilioResponse`/`escapeXml`/
// `emptyTwilioResponse`). The pure `twiml.js` wrapper re-exports these from a
// `#compiled` module that resolves to a BUNDLED, MINIFIED chunk, not vendorable
// as readable source — so the TwiML shaping is REIMPLEMENTED and labelled
// honestly (Apache-2.0). Only the SMS-relevant responses are kept: the empty
// `<Response/>` ack (the immediate webhook reply, since the real SMS goes out via
// REST once the async turn completes) and an optional inline `<Message>` reply.
// The voice responses (`sayTwilioResponse` / `gatherSpeechTwilioResponse`) are
// DEFERRED with voice. See vendor/VENDOR.md.

const TWIML_HEADERS = { "content-type": "text/xml; charset=utf-8" } as const;

/** Escapes the five XML-significant characters for safe TwiML text content. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The empty TwiML ack — `<Response/>`. Returned immediately from the webhook so
 * Twilio does not itself reply; the agent's SMS answer is delivered later via the
 * REST API once the async turn finishes.
 */
export function emptyTwilioResponse(): Response {
  return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<Response/>', { headers: TWIML_HEADERS, status: 200 });
}

/**
 * A TwiML reply that sends one SMS inline in the webhook response —
 * `<Response><Message>…</Message></Response>`. Not used on the async path (REST
 * handles that) but available for synchronous single-shot replies.
 */
export function messageTwilioResponse(body: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${escapeXml(body)}</Message></Response>`;
  return new Response(xml, { headers: TWIML_HEADERS, status: 200 });
}
