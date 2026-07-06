// Vendored from eve@0.19.0 dist/src/public/channels/telegram/defaults.js
// (Apache-2.0). Modified: ONLY the pure `defaultTelegramAuth` is vendored (its
// `#channel/types` `SessionAuthContext` return type → the sibling
// `TelegramAuthContext` shape); de-minified. Auth-projection logic unchanged.
// eve's `defaultEvents` / `defaultOnMessage` / `shouldDispatchTelegramMessage`
// were intentionally NOT copied — they are shaped against eve's runtime channel
// handle (`ctx.telegram.startTyping()` / `.post()`) and durable HITL state, i.e.
// eve runtime code. The trex factory supplies its own `events` / message default
// against `ChannelRouteArgs`. See vendor/VENDOR.md.

import type { TelegramMessage } from "./inbound.ts";
import type { TelegramAuthContext } from "./shared.ts";

/** Default auth projection for Telegram webhook actors (or null when unknown). */
export function defaultTelegramAuth(message: TelegramMessage): TelegramAuthContext | null {
  const from = message.from;
  if (!from) return null;
  const attributes: Record<string, string> = {
    chat_id: message.chat.id,
    chat_type: message.chat.type,
    message_id: message.messageId,
    user_id: from.id,
  };
  if (message.chat.title !== undefined) attributes.chat_title = message.chat.title;
  if (message.messageThreadId !== undefined) attributes.message_thread_id = String(message.messageThreadId);
  if (from.username !== undefined) attributes.username = from.username;
  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";
  const principalId = isGroup ? `telegram:${message.chat.id}:${from.id}` : `telegram:${from.id}`;
  return {
    attributes,
    authenticator: "telegram-webhook",
    issuer: isGroup ? `telegram:${message.chat.id}` : "telegram",
    principalId,
    principalType: from.isBot ? "service" : "user",
  };
}
