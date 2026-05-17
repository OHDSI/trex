// @ts-nocheck - Deno edge function
/**
 * Sync engine for built-in skills, commands, and agents.
 * Scans files from the repo directory structure, parses frontmatter,
 * and upserts into the database on startup.
 */

import { parseFrontmatter } from "./frontmatter.ts";

type SqlFn = (query: string, params?: unknown[]) => Promise<{ rows: any[] }>;

let syncPromise: Promise<void> | null = null;

/**
 * Sync all built-in skills, commands, and agents from disk to database.
 * Runs once per server lifecycle. Concurrent callers await the same promise.
 */
export function syncBuiltins(basePath: string, sqlFn: SqlFn): Promise<void> {
  if (!syncPromise) {
    syncPromise = doSync(basePath, sqlFn).catch((err) => {
      syncPromise = null; // Allow retry on failure
      console.error("[sync] Failed to sync built-ins:", err);
    });
  }
  return syncPromise;
}

async function doSync(basePath: string, sqlFn: SqlFn): Promise<void> {
  await Promise.all([
    syncSkills(`${basePath}/skills`, sqlFn),
    syncCommands(`${basePath}/commands`, sqlFn),
    syncAgents(`${basePath}/agents`, sqlFn),
  ]);
  console.log("[sync] Built-in skills, commands, and agents synced.");
}

/**
 * Force re-sync on next call (for testing or hot-reload).
 */
export function resetSync(): void {
  syncPromise = null;
}

// --- Skills ---

async function syncSkills(skillsDir: string, sqlFn: SqlFn): Promise<void> {
  const dirs = await listDirs(skillsDir);

  for (const dir of dirs) {
    const skillPath = `${skillsDir}/${dir}/SKILL.md`;
    const content = await readFileSafe(skillPath);
    if (!content) continue;

    const { metadata, body } = parseFrontmatter(content);
    const name = String(metadata.name || dir);
    const slug = metadata.slug ? String(metadata.slug) : null;
    const description = String(metadata.description || "");
    const version = String(metadata.version || "0.1.0");
    const mode = metadata.mode ? String(metadata.mode) : null;
    const allowedTools = parseStringArray(metadata["allowed-tools"]);
    const aliases = parseStringArray(metadata.aliases);

    if (!description) {
      console.warn(`[sync] Skipping skill "${name}": missing description`);
      continue;
    }

    // Check if already exists with same version
    const existing = await sqlFn(
      `SELECT id, version FROM devx.skills WHERE is_builtin = true AND name = $1`,
      [name],
    );

    if (existing.rows.length > 0) {
      // Update only if version changed
      if (existing.rows[0].version !== version) {
        await sqlFn(
          `UPDATE devx.skills
           SET slug = $1, description = $2, version = $3, body = $4,
               allowed_tools = $5, mode = $6, aliases = $7, updated_at = NOW()
           WHERE is_builtin = true AND name = $8`,
          [slug, description, version, body, allowedTools, mode, aliases, name],
        );
      }
    } else {
      await sqlFn(
        `INSERT INTO devx.skills (user_id, name, slug, description, version, body, allowed_tools, mode, aliases, is_builtin)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [name, slug, description, version, body, allowedTools, mode, aliases],
      );
    }
  }
}

// --- Commands ---

async function syncCommands(commandsDir: string, sqlFn: SqlFn): Promise<void> {
  const files = await listFiles(commandsDir, ".md");

  for (const file of files) {
    const content = await readFileSafe(`${commandsDir}/${file}`);
    if (!content) continue;

    const { metadata, body } = parseFrontmatter(content);
    const slug = String(metadata.slug || file.replace(/\.md$/, ""));
    const description = metadata.description ? String(metadata.description) : null;
    const model = metadata.model ? String(metadata.model) : null;
    const argumentHint = metadata["argument-hint"] ? String(metadata["argument-hint"]) : null;
    const allowedTools = parseStringArray(metadata["allowed-tools"]);

    const existing = await sqlFn(
      `SELECT id FROM devx.commands WHERE is_builtin = true AND slug = $1`,
      [slug],
    );

    if (existing.rows.length > 0) {
      await sqlFn(
        `UPDATE devx.commands
         SET description = $1, body = $2, allowed_tools = $3, model = $4,
             argument_hint = $5, updated_at = NOW()
         WHERE is_builtin = true AND slug = $6`,
        [description, body, allowedTools, model, argumentHint, slug],
      );
    } else {
      await sqlFn(
        `INSERT INTO devx.commands (user_id, slug, description, body, allowed_tools, model, argument_hint, is_builtin)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, true)`,
        [slug, description, body, allowedTools, model, argumentHint],
      );
    }
  }
}

// --- Agents ---

async function syncAgents(agentsDir: string, sqlFn: SqlFn): Promise<void> {
  const files = await listFiles(agentsDir, ".md");

  for (const file of files) {
    const content = await readFileSafe(`${agentsDir}/${file}`);
    if (!content) continue;

    const { metadata, body } = parseFrontmatter(content);
    const name = String(metadata.name || file.replace(/\.md$/, ""));
    const description = String(metadata.description || "");
    const model = String(metadata.model || "inherit");
    const maxSteps = Number(metadata["max-steps"]) || 15;
    const allowedTools = parseStringArray(metadata["allowed-tools"]);

    if (!description) {
      console.warn(`[sync] Skipping agent "${name}": missing description`);
      continue;
    }

    const existing = await sqlFn(
      `SELECT id FROM devx.agents WHERE is_builtin = true AND name = $1`,
      [name],
    );

    if (existing.rows.length > 0) {
      await sqlFn(
        `UPDATE devx.agents
         SET description = $1, body = $2, allowed_tools = $3, model = $4,
             max_steps = $5, updated_at = NOW()
         WHERE is_builtin = true AND name = $6`,
        [description, body, allowedTools, model, maxSteps, name],
      );
    } else {
      await sqlFn(
        `INSERT INTO devx.agents (user_id, name, description, body, allowed_tools, model, max_steps, is_builtin)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, true)`,
        [name, description, body, allowedTools, model, maxSteps],
      );
    }
  }
}

// --- Helpers ---

function parseStringArray(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch { /* not JSON */ }
  }
  return null;
}

async function listDirs(path: string): Promise<string[]> {
  try {
    const dirs: string[] = [];
    for await (const entry of Deno.readDir(path)) {
      if (entry.isDirectory) dirs.push(entry.name);
    }
    return dirs;
  } catch {
    return [];
  }
}

async function listFiles(path: string, ext: string): Promise<string[]> {
  try {
    const files: string[] = [];
    for await (const entry of Deno.readDir(path)) {
      if (entry.isFile && entry.name.endsWith(ext)) files.push(entry.name);
    }
    return files;
  } catch {
    return [];
  }
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return null;
  }
}
