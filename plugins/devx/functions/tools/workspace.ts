// @ts-nocheck - Deno edge function
/**
 * Workspace management — each user gets an isolated workspace directory.
 *
 * With allowHostFsAccess enabled for the devx plugin, Deno.writeTextFile
 * and Deno.mkdir write to the real host filesystem (not an ephemeral TmpFs).
 */

import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const DEFAULT_WORKSPACE_DIR = "/tmp/devx-workspaces";

function getBaseDir(): string {
  return Deno.env.get("DEVX_WORKSPACE_DIR") || DEFAULT_WORKSPACE_DIR;
}

/** Get the workspace path for a user (does not create it) */
export function getWorkspacePath(userId: string): string {
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(getBaseDir(), safeId);
}

/** Ensure a user's workspace directory exists, return the path */
export async function ensureWorkspace(userId: string): Promise<string> {
  const wsPath = getWorkspacePath(userId);
  await Deno.mkdir(wsPath, { recursive: true });
  return wsPath;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Get the workspace path for a specific app (does not create it) */
export function getAppWorkspacePath(userId: string, appId: string): string {
  return join(getBaseDir(), sanitizeId(userId), sanitizeId(appId));
}

/** Ensure an app's workspace directory exists, return the path */
export async function ensureAppWorkspace(userId: string, appId: string): Promise<string> {
  const wsPath = getAppWorkspacePath(userId, appId);
  await Deno.mkdir(wsPath, { recursive: true });
  return wsPath;
}
