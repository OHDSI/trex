/**
 * DevX tools implemented in Node.js for the Copilot SDK.
 * Pure filesystem operations — no DuckDB/Deno dependencies.
 */
const fs = require("fs");
const path = require("path");
const { defineTool } = require("@github/copilot-sdk");
const { z } = require("zod");

const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "__pycache__", ".svelte-kit"]);
const MAX_FILE_SIZE = 500_000;

function safePath(workspacePath, filePath) {
  const resolved = path.resolve(workspacePath, filePath);
  if (!resolved.startsWith(path.resolve(workspacePath))) {
    throw new Error("Path traversal not allowed");
  }
  return resolved;
}

let registered = false;
module.exports = function registerDevxTools(workspacePath) {
  if (registered) return;
  registered = true;
  defineTool("Read", {
    description: "Read the contents of a file",
    parameters: z.object({
      path: z.string().describe("File path relative to workspace"),
      offset: z.number().optional().describe("Start line (1-based)"),
      limit: z.number().optional().describe("Number of lines to read"),
    }),
    handler: async (args) => {
      const fullPath = safePath(workspacePath, args.path);
      const stat = fs.statSync(fullPath);
      if (stat.size > MAX_FILE_SIZE) return { content: `File too large (${stat.size} bytes)` };
      let content = fs.readFileSync(fullPath, "utf8");
      if (args.offset || args.limit) {
        const lines = content.split("\n");
        const start = (args.offset || 1) - 1;
        const end = args.limit ? start + args.limit : lines.length;
        content = lines.slice(start, end).map((l, i) => `${start + i + 1}\t${l}`).join("\n");
      }
      return { content };
    },
    skipPermission: true,
  });

  defineTool("Write", {
    description: "Write content to a file (creates directories if needed)",
    parameters: z.object({
      path: z.string().describe("File path relative to workspace"),
      content: z.string().describe("File content to write"),
    }),
    handler: async (args) => {
      const fullPath = safePath(workspacePath, args.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, args.content);
      return { content: `File written: ${args.path} (${args.content.length} chars)` };
    },
    skipPermission: true,
  });

  defineTool("Edit", {
    description: "Replace a string in a file",
    parameters: z.object({
      path: z.string().describe("File path relative to workspace"),
      old_string: z.string().describe("Text to find"),
      new_string: z.string().describe("Replacement text"),
    }),
    handler: async (args) => {
      const fullPath = safePath(workspacePath, args.path);
      let content = fs.readFileSync(fullPath, "utf8");
      if (!content.includes(args.old_string)) return { content: "Error: old_string not found in file" };
      content = content.replace(args.old_string, args.new_string);
      fs.writeFileSync(fullPath, content);
      return { content: `File edited: ${args.path}` };
    },
    skipPermission: true,
  });

  defineTool("Glob", {
    description: "List files and directories in a path",
    parameters: z.object({
      path: z.string().optional().describe("Directory path relative to workspace (default: root)"),
    }),
    handler: async (args) => {
      const dir = safePath(workspacePath, args.path || ".");
      const entries = [];
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (EXCLUDED_DIRS.has(entry.name)) continue;
          entries.push(entry.isDirectory() ? entry.name + "/" : entry.name);
        }
      } catch (e) {
        return { content: `Error: ${e.message}` };
      }
      return { content: entries.join("\n") || "(empty directory)" };
    },
    skipPermission: true,
  });

  defineTool("Grep", {
    description: "Search for a pattern in files",
    parameters: z.object({
      pattern: z.string().describe("Search pattern (regex)"),
      path: z.string().optional().describe("Directory to search (default: workspace root)"),
    }),
    handler: async (args) => {
      const dir = safePath(workspacePath, args.path || ".");
      const regex = new RegExp(args.pattern, "gi");
      const results = [];
      function searchDir(d, depth = 0) {
        if (depth > 5 || results.length > 50) return;
        try {
          for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
            if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
            const full = path.join(d, entry.name);
            if (entry.isDirectory()) {
              searchDir(full, depth + 1);
            } else {
              try {
                const stat = fs.statSync(full);
                if (stat.size > MAX_FILE_SIZE) continue;
                const content = fs.readFileSync(full, "utf8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                  if (regex.test(lines[i])) {
                    const rel = path.relative(workspacePath, full);
                    results.push(`${rel}:${i + 1}:${lines[i].trim().slice(0, 120)}`);
                    if (results.length > 50) return;
                  }
                  regex.lastIndex = 0;
                }
              } catch {}
            }
          }
        } catch {}
      }
      searchDir(dir);
      return { content: results.join("\n") || "No matches found" };
    },
    skipPermission: true,
  });

  defineTool("DeleteFile", {
    description: "Delete a file",
    parameters: z.object({
      path: z.string().describe("File path relative to workspace"),
    }),
    handler: async (args) => {
      const fullPath = safePath(workspacePath, args.path);
      fs.rmSync(fullPath);
      return { content: `Deleted: ${args.path}` };
    },
    skipPermission: true,
  });
};
