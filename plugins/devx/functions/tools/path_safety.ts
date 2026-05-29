// @ts-nocheck - Deno edge function
/**
 * Path safety utilities — prevents directory traversal attacks.
 * All tool file operations must use safeJoin() to resolve paths.
 */

import { join, resolve, relative } from "https://deno.land/std@0.224.0/path/mod.ts";

/**
 * Safely join a base path with user-provided path segments.
 * Throws if the resulting path escapes the base directory.
 */
export function safeJoin(basePath: string, ...paths: string[]): string {
  for (const p of paths) {
    if (!p || p.trim() === "") {
      throw new Error("Empty path segment not allowed");
    }
    // Reject absolute paths, home-relative, Windows drive letters, UNC
    if (/^[/\\]/.test(p) || /^~/.test(p) || /^[a-zA-Z]:/.test(p) || /^\\\\/.test(p)) {
      throw new Error(`Absolute or special paths not allowed: "${p}"`);
    }
  }

  const resolvedBase = resolve(basePath);
  const joined = resolve(join(basePath, ...paths));
  const rel = relative(resolvedBase, joined);

  // If the relative path starts with ".." we've escaped the base
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path traversal detected: "${paths.join("/")}"`);
  }

  return joined;
}

/**
 * Validate that a resolved path is within the base directory.
 */
export function validatePath(basePath: string, fullPath: string): void {
  const resolvedBase = resolve(basePath);
  const resolvedFull = resolve(fullPath);
  const rel = relative(resolvedBase, resolvedFull);

  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path "${fullPath}" is outside workspace`);
  }
}

/** Directories excluded from searches and listings by default */
export const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".venv", "venv",
  "__pycache__", ".cache", ".turbo", ".nuxt", "coverage",
]);

/** Files excluded from searches by default */
export const EXCLUDED_FILES = new Set([
  "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lockb",
]);
