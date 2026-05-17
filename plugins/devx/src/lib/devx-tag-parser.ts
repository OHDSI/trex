/**
 * Client-side parser for devx build tags in streaming content.
 * Splits raw LLM output into segments of markdown and parsed tags
 * so they can be rendered as inline action cards during streaming.
 */

export type DevxTagType =
  | "devx-write"
  | "devx-delete"
  | "devx-rename"
  | "devx-add-dependency"
  | "devx-chat-summary"
  | "devx-command";

export interface MarkdownSegment {
  type: "markdown";
  content: string;
}

export interface TagSegment {
  type: "tag";
  tagType: DevxTagType;
  attrs: Record<string, string>;
  content: string;
  inProgress: boolean;
}

export type Segment = MarkdownSegment | TagSegment;

/** Parse XML-style attributes from a tag opening string */
function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w[\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

const TAG_NAMES: DevxTagType[] = [
  "devx-write",
  "devx-delete",
  "devx-rename",
  "devx-add-dependency",
  "devx-chat-summary",
  "devx-command",
];

/**
 * Combined regex that matches:
 * 1. Complete self-closing tags: <devx-foo ... />
 * 2. Complete tags with body: <devx-foo ...>...</devx-foo>
 * 3. Incomplete tags still being streamed: <devx-foo ... (no closing)
 */
function buildPattern(): RegExp {
  const names = TAG_NAMES.join("|");
  // Order matters: try complete matches before incomplete
  return new RegExp(
    // Self-closing: <devx-rename old_file_path="a" new_file_path="b" />
    `<(${names})(\\s[^>]*?)\\/>` +
    "|" +
    // Complete with body: <devx-write file_path="x">...code...</devx-write>
    `<(${names})(\\s[^>]*?)>([\\s\\S]*?)<\\/\\3>` +
    "|" +
    // Incomplete: tag opened but not yet closed (still streaming)
    `<(${names})(\\s[^>]*?>([\\s\\S]*))?$`,
    "g",
  );
}

export function parseDevxTags(text: string): Segment[] {
  const segments: Segment[] = [];
  const pattern = buildPattern();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Add preceding markdown
    if (match.index > lastIndex) {
      const md = text.slice(lastIndex, match.index);
      if (md) segments.push({ type: "markdown", content: md });
    }

    if (match[1]) {
      // Self-closing tag
      segments.push({
        type: "tag",
        tagType: match[1] as DevxTagType,
        attrs: parseAttrs(match[2] || ""),
        content: "",
        inProgress: false,
      });
    } else if (match[3]) {
      // Complete tag with body
      segments.push({
        type: "tag",
        tagType: match[3] as DevxTagType,
        attrs: parseAttrs(match[4] || ""),
        content: match[5] || "",
        inProgress: false,
      });
    } else if (match[6]) {
      // Incomplete tag (still streaming)
      const hasClosedOpening = match[7]?.includes(">");
      segments.push({
        type: "tag",
        tagType: match[6] as DevxTagType,
        attrs: hasClosedOpening ? parseAttrs(match[7] || "") : {},
        content: hasClosedOpening ? (match[8] || "") : "",
        inProgress: true,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing markdown
  if (lastIndex < text.length) {
    const md = text.slice(lastIndex);
    if (md) segments.push({ type: "markdown", content: md });
  }

  return segments;
}

/** Check if text contains any devx tags (complete or incomplete) */
export function hasDevxTags(text: string): boolean {
  return /<devx-/.test(text);
}
