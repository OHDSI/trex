// @ts-nocheck - Deno edge function
import { getAppWorkspacePath } from "../tools/workspace.ts";
import { safeJoin } from "../tools/path_safety.ts";
import {
  stylesToTailwindClasses,
  deduplicateClasses,
} from "../visual_editing/tailwind_mapper.ts";
import { applyEdits, type CodeEdit } from "../visual_editing/ast_writer.ts";

export async function handleVisualEditingRoutes(
  path: string,
  method: string,
  req: Request,
  userId: string,
  sql: Function,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  // POST /apps/:id/visual-edit — apply visual edits to source files
  const editMatch = path.match(/\/apps\/([^/]+)\/visual-edit$/);
  if (editMatch && method === "POST") {
    const appId = editMatch[1];
    const appCheck = await sql(
      `SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`,
      [appId, userId],
    );
    if (appCheck.rows.length === 0) {
      return Response.json(
        { error: "Not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const wsPath = getAppWorkspacePath(userId, appId);
    const body = await req.json();
    const changes = body.changes || [];
    const results = [];

    // Group changes by file for batched AST edits
    const changesByFile = new Map<string, typeof changes>();
    for (const change of changes) {
      const key = change.filePath;
      if (!changesByFile.has(key)) changesByFile.set(key, []);
      changesByFile.get(key)!.push(change);
    }

    for (const [relPath, fileChanges] of changesByFile) {
      try {
        const filePath = safeJoin(wsPath, relPath);
        const source = await Deno.readTextFile(filePath);

        // Build AST edits
        const edits: CodeEdit[] = [];
        for (const change of fileChanges) {
          const edit: CodeEdit = {
            line: change.line,
            col: change.col || 1,
          };
          if (change.styles) {
            const newClasses = stylesToTailwindClasses(change.styles);
            if (newClasses.length > 0) edit.tailwindClasses = newClasses;
          }
          if (change.textContent !== undefined) {
            edit.textContent = change.textContent;
          }
          if (change.insertChild) edit.insertChild = change.insertChild;
          if (change.removeChild) edit.removeChild = change.removeChild;
          if (change.moveChild) edit.moveChild = change.moveChild;
          edits.push(edit);
        }

        // Try AST-based approach first
        let modified = applyEdits(source, edits);

        // Fall back to regex-based approach if AST fails
        if (modified === null) {
          modified = source;
          for (const change of fileChanges) {
            const targetLine = change.line - 1;
            if (targetLine < 0 || targetLine >= modified.split("\n").length) continue;
            if (change.styles) {
              const newClasses = stylesToTailwindClasses(change.styles);
              if (newClasses.length > 0) {
                modified = applyTailwindClasses(modified, targetLine, newClasses);
              }
            }
            if (change.textContent !== undefined) {
              modified = applyTextContent(modified, targetLine, change.textContent);
            }
          }
        }

        await Deno.writeTextFile(filePath, modified);
        for (const change of fileChanges) {
          results.push({ filePath: change.filePath, success: true });
        }
      } catch (err) {
        for (const change of fileChanges) {
          results.push({ filePath: change.filePath, success: false, error: err.message });
        }
      }
    }

    return Response.json({ results }, { headers: corsHeaders });
  }

  // POST /apps/:id/setup-visual-editing — inject tagger into existing app
  const setupMatch = path.match(/\/apps\/([^/]+)\/setup-visual-editing$/);
  if (setupMatch && method === "POST") {
    const appId = setupMatch[1];
    const appCheck = await sql(
      `SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`,
      [appId, userId],
    );
    if (appCheck.rows.length === 0) {
      return Response.json(
        { error: "Not found" },
        { status: 404, headers: corsHeaders },
      );
    }

    const wsPath = getAppWorkspacePath(userId, appId);

    try {
      // Check for vite.config
      let viteConfigPath = null;
      for (const name of [
        "vite.config.ts",
        "vite.config.js",
        "vite.config.mts",
        "vite.config.mjs",
      ]) {
        try {
          await Deno.stat(`${wsPath}/${name}`);
          viteConfigPath = name;
          break;
        } catch {
          // not found
        }
      }

      if (!viteConfigPath) {
        return Response.json(
          {
            success: false,
            error: "No vite.config found. Visual editing requires Vite.",
          },
          { headers: corsHeaders },
        );
      }

      // Create .devx directory
      await Deno.mkdir(`${wsPath}/.devx`, { recursive: true });

      // Copy tagger plugin — try import.meta.url first, fall back to plugin mount path
      let taggerSource = "";
      const taggerCandidates = [
        new URL("../visual_editing/component_tagger_plugin.js", import.meta.url).pathname,
        "/usr/src/plugins-dev/devx/functions/visual_editing/component_tagger_plugin.js",
      ];
      for (const p of taggerCandidates) {
        try {
          taggerSource = await Deno.readTextFile(p);
          break;
        } catch {
          // try next
        }
      }
      if (!taggerSource) throw new Error("Could not load component_tagger_plugin.js");
      await Deno.writeTextFile(
        `${wsPath}/.devx/component_tagger_plugin.js`,
        taggerSource,
      );

      // Patch vite.config if not already patched
      let viteConfig = await Deno.readTextFile(
        `${wsPath}/${viteConfigPath}`,
      );
      if (!viteConfig.includes("devxComponentTagger")) {
        // Add import at the top
        const importLine =
          `import devxComponentTagger from './.devx/component_tagger_plugin.js';\n`;
        viteConfig = importLine + viteConfig;

        // Add to plugins array
        viteConfig = viteConfig.replace(
          /plugins:\s*\[/,
          "plugins: [devxComponentTagger(), ",
        );

        await Deno.writeTextFile(
          `${wsPath}/${viteConfigPath}`,
          viteConfig,
        );
      }

      return Response.json({ success: true }, { headers: corsHeaders });
    } catch (err) {
      return Response.json(
        { success: false, error: err.message },
        { headers: corsHeaders },
      );
    }
  }

  return null;
}

/**
 * Apply Tailwind classes to the JSX element at the target line.
 * Finds the className attribute and merges new classes.
 */
function applyTailwindClasses(
  source: string,
  targetLine: number,
  newClasses: string[],
): string {
  const lines = source.split("\n");

  // Search around the target line for a className attribute
  const searchRange = 5;
  const startLine = Math.max(0, targetLine);
  const endLine = Math.min(lines.length, targetLine + searchRange);
  const region = lines.slice(startLine, endLine).join("\n");

  // Match className="..." or className='...' (static string values only)
  // Skip dynamic expressions like className={cn(...)} or className={`...`}
  const classNameMatch = region.match(
    /className="([^"]*)"/,
  ) || region.match(
    /className='([^']*)'/,
  );

  if (classNameMatch) {
    const existingClasses = classNameMatch[1];
    const merged = deduplicateClasses(existingClasses, newClasses);
    const updatedRegion = region.replace(
      classNameMatch[0],
      `className="${merged}"`,
    );
    const updatedLines = [
      ...lines.slice(0, startLine),
      ...updatedRegion.split("\n"),
      ...lines.slice(endLine),
    ];
    return updatedLines.join("\n");
  }

  // No className found — add one to the JSX opening tag on the target line
  const line = lines[targetLine];
  // Find the end of the tag name (first space or >)
  const tagMatch = line.match(/<([A-Za-z][A-Za-z0-9.]*)/);
  if (tagMatch) {
    const insertPos = line.indexOf(tagMatch[0]) + tagMatch[0].length;
    lines[targetLine] =
      line.slice(0, insertPos) +
      ` className="${newClasses.join(" ")}"` +
      line.slice(insertPos);
    return lines.join("\n");
  }

  return source;
}

/**
 * Escape text for safe insertion into JSX source.
 */
function escapeJsxText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/{/g, "&#123;")
    .replace(/}/g, "&#125;");
}

/**
 * Apply text content change to a JSX element.
 * Finds JSXText children near the target line and replaces them.
 */
function applyTextContent(
  source: string,
  targetLine: number,
  textContent: string,
): string {
  const lines = source.split("\n");
  const safeText = escapeJsxText(textContent);

  // Look for text content between > and < on lines near target
  for (
    let i = targetLine;
    i < Math.min(lines.length, targetLine + 5);
    i++
  ) {
    const textMatch = lines[i].match(/(>)([^<]+)(<)/);
    if (textMatch) {
      lines[i] = lines[i].replace(
        textMatch[0],
        `>${safeText}<`,
      );
      return lines.join("\n");
    }
  }

  return source;
}
