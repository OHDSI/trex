// @ts-nocheck - Deno edge function
/**
 * Execute parsed build tags against the workspace filesystem.
 */

import type { BuildTag } from "./build_tag_parser.ts";
import { safeJoin } from "./tools/path_safety.ts";
import { dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { duckdb, escapeSql } from "./duckdb.ts";

export interface BuildTagContext {
  workspacePath: string;
  chatId: string;
  userId: string;
  send: (data: unknown) => void;
  sql: (query: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

export interface BuildActionResult {
  action: string;
  path?: string;
  error?: string;
}

export async function executeBuildTags(
  tags: BuildTag[],
  ctx: BuildTagContext,
): Promise<BuildActionResult[]> {
  const results: BuildActionResult[] = [];

  for (const tag of tags) {
    try {
      const result = await executeTag(tag, ctx);
      results.push(result);
      ctx.send({ type: "build_action", ...result });
    } catch (err) {
      const errorResult: BuildActionResult = {
        action: `${tag.type}_error`,
        path: tag.attrs.file_path || tag.attrs.old_file_path,
        error: err instanceof Error ? err.message : String(err),
      };
      results.push(errorResult);
      ctx.send({ type: "build_action", ...errorResult });
    }
  }

  return results;
}

async function executeTag(tag: BuildTag, ctx: BuildTagContext): Promise<BuildActionResult> {
  switch (tag.type) {
    case "write": {
      const filePath = tag.attrs.file_path;
      if (!filePath) throw new Error("devx-write missing file_path attribute");
      const fullPath = safeJoin(ctx.workspacePath, filePath);
      await Deno.mkdir(dirname(fullPath), { recursive: true });
      await Deno.writeTextFile(fullPath, tag.content);
      return { action: "file_written", path: filePath };
    }

    case "rename": {
      const oldPath = tag.attrs.old_file_path;
      const newPath = tag.attrs.new_file_path;
      if (!oldPath || !newPath) throw new Error("devx-rename missing old_file_path or new_file_path");
      const srcFull = safeJoin(ctx.workspacePath, oldPath);
      const dstFull = safeJoin(ctx.workspacePath, newPath);
      await Deno.mkdir(dirname(dstFull), { recursive: true });
      await Deno.rename(srcFull, dstFull);
      return { action: "file_renamed", path: `${oldPath} → ${newPath}` };
    }

    case "delete": {
      const filePath = tag.attrs.file_path;
      if (!filePath) throw new Error("devx-delete missing file_path attribute");
      const fullPath = safeJoin(ctx.workspacePath, filePath);
      await Deno.remove(fullPath);
      return { action: "file_deleted", path: filePath };
    }

    case "add-dependency": {
      const packagesStr = tag.attrs.packages;
      if (!packagesStr) throw new Error("devx-add-dependency missing packages attribute");
      const packages = packagesStr.split(/[,\s]+/).filter(Boolean);

      // Validate package names
      for (const pkg of packages) {
        if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[\d][\w.\-]*)?$/.test(pkg)) {
          throw new Error(`Invalid package name: "${pkg}"`);
        }
      }

      const packagesJson = JSON.stringify(packages);
      const json = await duckdb(
        `SELECT * FROM trex_devx_npm_install('${escapeSql(ctx.workspacePath)}', '${escapeSql(packagesJson)}', 'false')`,
      );
      const result = JSON.parse(json);
      if (!result.ok) {
        throw new Error(`npm install failed: ${result.message}`);
      }
      return { action: "dependency_installed", path: packages.join(", ") };
    }

    case "chat-summary": {
      if (!tag.content) throw new Error("devx-chat-summary has no content");
      await ctx.sql(
        `UPDATE devx.chats SET title = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
        [tag.content, ctx.chatId, ctx.userId],
      );
      return { action: "chat_summary_set", path: tag.content };
    }

    case "command": {
      const commandType = tag.attrs.type;
      if (!commandType) throw new Error("devx-command missing type attribute");
      ctx.send({ type: "app_command", command: commandType });
      return { action: "app_command", path: commandType };
    }

    default:
      throw new Error(`Unknown tag type: ${(tag as BuildTag).type}`);
  }
}
