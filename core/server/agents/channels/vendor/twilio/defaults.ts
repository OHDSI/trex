// Vendored from eve@0.19.0 dist/src/public/channels/twilio/defaults.js
// (Apache-2.0). Modified: ONLY the pure `defaultTwilioAuth` is vendored (its
// `#channel/types` `SessionAuthContext` return type → the sibling
// `TwilioAuthContext` shape); de-minified. Auth-projection logic unchanged.
// eve's `defaultEvents` / `defaultOnText` / `defaultOnVoice*` were intentionally
// NOT copied — they are shaped against eve's runtime channel handle
// (`ctx.twilio.sendMessage()`) and its `#internal/logging` error formatter, i.e.
// eve runtime code. The trex factory supplies its own `events` + message default
// against `ChannelRouteArgs`. See vendor/VENDOR.md.

import type { TwilioAuthContext } from "./shared.ts";

/** Default auth projection for a Twilio webhook actor. */
export function defaultTwilioAuth(input: {
  readonly channel: "text" | "voice";
  readonly from: string;
  readonly to?: string;
}): TwilioAuthContext {
  const attributes: Record<string, string> = { channel: input.channel, from: input.from };
  if (input.to !== undefined) attributes.to = input.to;
  return {
    attributes,
    authenticator: "twilio-webhook",
    issuer: "twilio",
    principalId: `twilio:${input.from}`,
    principalType: "user",
  };
}
