// Vendored from eve@0.19.0 dist/src/public/channels/slack/limits.js (Apache-2.0).
// Modified: none (de-minified only — Slack's per-surface string-length guards
// are pure). See vendor/VENDOR.md.

/** Typing indicator (`assistant.threads.setStatus`) status cap. */
export const SLACK_TYPING_STATUS_MAX_LENGTH = 50;
/** Block Kit `plain_text` field (button labels, select options) cap. */
export const SLACK_BLOCK_KIT_PLAIN_TEXT_MAX_LENGTH = 75;
/** Block Kit `section` `text.text` cap; longer fails the whole post. */
export const SLACK_SECTION_TEXT_MAX_LENGTH = 3000;
/** Top-level `text` field on `chat.postMessage` cap. */
export const SLACK_MESSAGE_TEXT_MAX_LENGTH = 40000;
/** `chat.postMessage` rejects payloads with more than 50 blocks. */
export const SLACK_MAX_BLOCKS_PER_MESSAGE = 50;
/** `views.open` modal title cap. */
export const SLACK_MODAL_TITLE_MAX_LENGTH = 24;

function truncateWithEllipsis(value: string, max: number): string {
  if (value.length <= max) return value;
  const end = Math.max(0, max - 3);
  return `${value.slice(0, end).trimEnd()}...`;
}

function stripTypingStatusMarkdown(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/~~([^~]+)~~/gu, "$1")
    .replace(/(\*\*|__)([^*_]+)\1/gu, "$2")
    .replace(/(^|[^\p{L}\p{N}])([*_])([^*_]+)\2(?=$|[^\p{L}\p{N}])/gu, "$1$3");
}

/** Normalizes a typing status: strips light Markdown, collapses whitespace, caps. */
export function truncateTypingStatus(status: string): string {
  return truncateWithEllipsis(stripTypingStatusMarkdown(status).trim().replace(/\s+/gu, " "), SLACK_TYPING_STATUS_MAX_LENGTH);
}

/** Caps a Block Kit `plain_text` label/description; `undefined` short-circuits. */
export function truncatePlainText(value: string): string;
export function truncatePlainText(value: string | undefined): string | undefined;
export function truncatePlainText(value: string | undefined): string | undefined {
  if (value !== undefined) return truncateWithEllipsis(value, SLACK_BLOCK_KIT_PLAIN_TEXT_MAX_LENGTH);
}

/** Caps a section block's `text.text`. */
export function truncateSectionText(value: string): string {
  return truncateWithEllipsis(value, SLACK_SECTION_TEXT_MAX_LENGTH);
}

/** Caps a `chat.postMessage` `text` field. */
export function truncateMessageText(value: string): string {
  return truncateWithEllipsis(value, SLACK_MESSAGE_TEXT_MAX_LENGTH);
}

/** Caps a modal title. */
export function truncateModalTitle(value: string): string {
  return truncateWithEllipsis(value, SLACK_MODAL_TITLE_MAX_LENGTH);
}
