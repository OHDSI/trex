/**
 * DevX Component Tagger Vite Plugin
 * Injects data-devx-id and data-devx-name attributes into JSX/Vue elements at dev time.
 * This file runs in the user's Vite process — must be plain JS, no TypeScript.
 *
 * Usage in vite.config.ts:
 *   import devxComponentTagger from './.devx/component_tagger_plugin.js';
 *   export default defineConfig({ plugins: [devxComponentTagger(), react()] });
 */

export default function devxComponentTagger() {
  return {
    name: "vite-plugin-devx-tagger",
    apply: "serve", // dev only
    enforce: "pre",

    transform(code, id) {
      // Skip node_modules
      if (/node_modules/.test(id)) return null;

      if (/\.[jt]sx$/.test(id)) {
        return transformJsx(code, id);
      }
      if (/\.vue$/.test(id)) {
        return transformVue(code, id);
      }
      return null;
    },
  };
}

function transformJsx(code, id) {
  try {
    const relPath = getRelativePath(id);
    // Match ALL JSX opening tags: both components (<Button ) and HTML elements (<div , <h1 , <p )
    // Also match self-closing tags with space before /> (e.g., <img ... />)
    const jsxOpeningTagRegex = /<([A-Za-z][A-Za-z0-9_.:-]*)(?=\s|>)/g;
    let match;
    const insertions = [];

    while ((match = jsxOpeningTagRegex.exec(code)) !== null) {
      const tagName = match[1];
      const afterTag = match.index + match[0].length;

      // Skip closing tags (</div>)
      if (match.index > 0 && code[match.index - 1] === "/") continue;

      // Skip TypeScript generics (word character immediately before <)
      if (match.index > 0 && /\w/.test(code[match.index - 1])) continue;

      // Skip HTML comments, doctype, script/style in templates
      if (tagName === "!--" || tagName.startsWith("!")) continue;

      // Need a space after the tag to insert our attributes
      // If the next char is '>' we need to insert a space too
      const nextChar = code[afterTag];

      let insertPos;
      let prefix = "";
      if (nextChar === " " || nextChar === "\n" || nextChar === "\r" || nextChar === "\t") {
        insertPos = afterTag + 1;
      } else if (nextChar === ">") {
        // <div> — insert space + attrs before >
        insertPos = afterTag;
        prefix = " ";
      } else if (nextChar === "/" && code[afterTag + 1] === ">") {
        // <br/> — insert space + attrs before />
        insertPos = afterTag;
        prefix = " ";
      } else {
        // Unexpected — skip
        continue;
      }

      const lines = code.slice(0, match.index).split("\n");
      const line = lines.length;
      const col = lines[lines.length - 1].length + 1;

      const devxId = relPath + ":" + line + ":" + col;
      const devxName = tagName.includes(".") ? tagName.split(".").pop() : tagName;
      insertions.push({
        pos: insertPos,
        text: prefix + 'data-devx-id="' + devxId + '" data-devx-name="' + devxName + '" ',
      });
    }

    if (insertions.length === 0) return null;

    // Apply insertions in reverse order so positions stay valid
    let result = code;
    for (let i = insertions.length - 1; i >= 0; i--) {
      const { pos, text } = insertions[i];
      result = result.slice(0, pos) + text + result.slice(pos);
    }

    return { code: result, map: null };
  } catch (err) {
    console.warn("[devx-tagger] Failed to process " + id + ":", err.message);
    return null;
  }
}

function transformVue(code, id) {
  try {
    const relPath = getRelativePath(id);

    const templateMatch = code.match(/<template[^>]*>([\s\S]*)<\/template>/);
    if (!templateMatch) return null;

    const templateStart = code.indexOf(templateMatch[0]);
    const templateContent = templateMatch[1];
    const templateOffset = templateStart + templateMatch[0].indexOf(templateContent);

    const vueTagRegex = /<([A-Za-z][A-Za-z0-9:._-]*)\s/g;
    let match;
    const insertions = [];

    while ((match = vueTagRegex.exec(templateContent)) !== null) {
      const tagName = match[1];
      const absPos = templateOffset + match.index;
      const insertPos = absPos + match[0].length;

      const lines = code.slice(0, absPos).split("\n");
      const line = lines.length;
      const col = lines[lines.length - 1].length + 1;

      const devxId = relPath + ":" + line + ":" + col;
      insertions.push({
        pos: insertPos,
        text: 'data-devx-id="' + devxId + '" data-devx-name="' + tagName + '" ',
      });
    }

    if (insertions.length === 0) return null;

    let result = code;
    for (let i = insertions.length - 1; i >= 0; i--) {
      const { pos, text } = insertions[i];
      result = result.slice(0, pos) + text + result.slice(pos);
    }

    return { code: result, map: null };
  } catch (err) {
    console.warn("[devx-tagger] Failed to process " + id + ":", err.message);
    return null;
  }
}

function getRelativePath(id) {
  const cwd = process.cwd().replace(/\\/g, "/");
  const normalized = id.replace(/\\/g, "/");
  if (normalized.startsWith(cwd + "/")) {
    return normalized.slice(cwd.length + 1);
  }
  return normalized;
}
