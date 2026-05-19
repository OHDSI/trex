// @ts-nocheck - Deno edge function
/**
 * YAML frontmatter parser and serializer for SKILL.md, command.md, and agent.md files.
 * Parses the --- delimited header and returns structured metadata + body.
 */

import type { ParsedFrontmatter } from "./types.ts";

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

/**
 * Parse a markdown file with YAML frontmatter into metadata and body.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trim();
  const match = trimmed.match(FRONTMATTER_RE);

  if (!match) {
    return { metadata: {}, body: trimmed };
  }

  const yamlBlock = match[1];
  const body = match[2].trim();
  const metadata = parseYaml(yamlBlock);

  return { metadata, body };
}

/**
 * Serialize metadata and body back to frontmatter markdown format.
 */
export function serializeToMarkdown(
  metadata: Record<string, unknown>,
  body: string,
): string {
  const yamlLines: string[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined) continue;
    yamlLines.push(serializeYamlValue(key, value));
  }

  return `---\n${yamlLines.join("\n")}\n---\n\n${body}\n`;
}

/**
 * Minimal YAML parser for flat frontmatter.
 * Handles: strings, numbers, booleans, arrays (JSON-style and multi-line).
 * Multi-line strings with continuation indentation.
 */
function parseYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim();
    let rawValue = line.slice(colonIdx + 1).trim();

    // Check for multi-line string continuation (next line indented)
    while (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (nextLine && /^\s{2,}/.test(nextLine) && !nextLine.trim().startsWith("-")) {
        rawValue += " " + nextLine.trim();
        i++;
      } else {
        break;
      }
    }

    // Check for YAML array (lines starting with "  - ")
    if (rawValue === "" && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1])) {
        i++;
        items.push(lines[i].trim().replace(/^-\s*/, "").replace(/^["']|["']$/g, ""));
      }
      result[key] = items;
      i++;
      continue;
    }

    result[key] = parseYamlScalar(rawValue);
    i++;
  }

  return result;
}

/**
 * Parse a single YAML scalar value.
 */
function parseYamlScalar(raw: string): unknown {
  if (raw === "" || raw === "null" || raw === "~") return null;
  if (raw === "true") return true;
  if (raw === "false") return false;

  // JSON array: ["item1", "item2"]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      return JSON.parse(raw);
    } catch {
      // Fall through to string
    }
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  // Quoted string
  if ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }

  return raw;
}

/**
 * Serialize a single key-value pair to YAML.
 */
function serializeYamlValue(key: string, value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return `${key}: ${value}`;
  }

  if (Array.isArray(value)) {
    return `${key}: ${JSON.stringify(value)}`;
  }

  if (typeof value === "string") {
    // Quote strings that contain YAML-special characters
    if (value.includes("\n") || value.includes(":") || value.includes('"') || value.includes("#")) {
      const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      return `${key}: "${escaped}"`;
    }
    return `${key}: ${value}`;
  }

  return `${key}: ${JSON.stringify(value)}`;
}
