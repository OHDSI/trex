/**
 * Client-side stripping of devx build tags from streaming content.
 * Handles both complete and incomplete (still-streaming) tags.
 */

// Complete tags — same patterns as server
const COMPLETE_TAG_PATTERNS = [
  /<devx-write\s+[^>]*?>[\s\S]*?<\/devx-write>/g,
  /<devx-rename\s+[^>]*?\/>/g,
  /<devx-delete\s+[^>]*?\/>/g,
  /<devx-add-dependency\s+[^>]*?><\/devx-add-dependency>/g,
  /<devx-chat-summary>[\s\S]*?<\/devx-chat-summary>/g,
];

// Incomplete tags — opening tag present but closing tag not yet streamed
const INCOMPLETE_TAG_PATTERNS = [
  /<devx-write\s+[^>]*?>[\s\S]*$/,
  /<devx-rename\s[^>]*$/,
  /<devx-delete\s[^>]*$/,
  /<devx-add-dependency\s[^>]*$/,
  /<devx-chat-summary>[\s\S]*$/,
  // Partial opening tag (e.g. "<devx-wri" still being streamed)
  /<devx-[\w-]*$/,
];

export function stripDevxTags(text: string): string {
  let result = text;

  // Strip complete tags first
  for (const pattern of COMPLETE_TAG_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, pattern.flags), "");
  }

  // Strip incomplete tags (still streaming)
  for (const pattern of INCOMPLETE_TAG_PATTERNS) {
    result = result.replace(pattern, "");
  }

  // Collapse excessive newlines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}
