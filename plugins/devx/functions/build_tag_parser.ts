// @ts-nocheck - Deno edge function
/**
 * Parse and strip build-mode tags from LLM output.
 *
 * Tag types:
 *   <devx-write file_path="...">...code...</devx-write>
 *   <devx-rename old_file_path="..." new_file_path="..." />
 *   <devx-delete file_path="..." />
 *   <devx-add-dependency packages="..."></devx-add-dependency>
 *   <devx-chat-summary>...text...</devx-chat-summary>
 *   <devx-command type="rebuild|restart|refresh"></devx-command>
 */

export interface BuildTag {
  type: "write" | "rename" | "delete" | "add-dependency" | "chat-summary" | "command";
  attrs: Record<string, string>;
  content: string;
  fullMatch: string;
}

const TAG_PATTERNS: { type: BuildTag["type"]; regex: RegExp }[] = [
  {
    type: "write",
    regex: /<devx-write\s+([^>]*?)>([\s\S]*?)<\/devx-write>/g,
  },
  {
    type: "rename",
    regex: /<devx-rename\s+([^>]*?)\/>/g,
  },
  {
    type: "delete",
    regex: /<devx-delete\s+([^>]*?)\/>/g,
  },
  {
    type: "add-dependency",
    regex: /<devx-add-dependency\s+([^>]*?)><\/devx-add-dependency>/g,
  },
  {
    type: "chat-summary",
    regex: /<devx-chat-summary>([\s\S]*?)<\/devx-chat-summary>/g,
  },
  {
    type: "command",
    regex: /<devx-command\s+([^>]*?)><\/devx-command>/g,
  },
];

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w[\w-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

export function parseBuildTags(text: string): BuildTag[] {
  const tags: BuildTag[] = [];

  for (const { type, regex } of TAG_PATTERNS) {
    // Reset lastIndex since we reuse the regex object across calls
    const re = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      if (type === "chat-summary") {
        // chat-summary has no attrs group — group 1 is content
        tags.push({
          type,
          attrs: {},
          content: match[1].trim(),
          fullMatch: match[0],
        });
      } else if (type === "write") {
        // group 1 = attrs, group 2 = content
        tags.push({
          type,
          attrs: parseAttrs(match[1]),
          content: match[2],
          fullMatch: match[0],
        });
      } else {
        // self-closing or empty-body tags: group 1 = attrs
        tags.push({
          type,
          attrs: parseAttrs(match[1]),
          content: "",
          fullMatch: match[0],
        });
      }
    }
  }

  return tags;
}

/** Remove all build tags from text, returning clean markdown. */
export function stripBuildTags(text: string): string {
  let result = text;
  for (const { regex } of TAG_PATTERNS) {
    result = result.replace(new RegExp(regex.source, regex.flags), "");
  }
  // Collapse runs of 3+ newlines left by tag removal
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}
