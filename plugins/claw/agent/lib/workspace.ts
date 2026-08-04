// Locate the coder's files on the shared container filesystem. Mirrors devx's
// getAppWorkspacePath (functions/tools/workspace.ts): <root>/<userId>/<appId>,
// or <root>/<userId> for an app-less task.
export function workspaceRoot(userId: string, appId: string | null): string {
  const base = Deno.env.get("DEVX_WORKSPACE_DIR") || "/tmp/devx-workspaces";
  const safe = (x: string) => x.replace(/[^a-zA-Z0-9_-]/g, "_");
  return appId ? `${base}/${safe(userId)}/${safe(appId)}` : `${base}/${safe(userId)}`;
}

// Keep reads inside the workspace: drop a leading slash and reject `..` segments
// so a relayed path can't escape the app's directory. Returns null if unsafe.
export function safeRelative(p: string): string | null {
  const rel = p.replace(/^\/+/, "");
  if (rel.split("/").some((seg) => seg === "..")) return null;
  return rel;
}

// Read a file the coder wrote, from wherever the coder ACTUALLY ran.
//
// When the app is a git repo, devx runs the coder in a per-chat git worktree
// (`<appWs>/.worktrees/<codeSessionId>` — see devx claude_code_agent's
// ensureChatWorktree / getRunWorktreePath, driven by claw's useWorktree:true).
// Files the coder saves (a plan .md, screenshots) therefore live in that
// worktree, NOT the shared app root. When no worktree was created (an app-less
// task, or a non-git app), the coder uses the app root instead. So try the
// worktree first (when a code session exists), then fall back to the app root.
// A bare `workspaceRoot()` read misses the worktree entirely and silently
// returns nothing — the cause of "the plan/screenshot never attached".
//
// Returns the file bytes + the absolute path read, or null if `relPath` is
// unsafe or the file exists under neither root.
export async function readCoderFile(
  userId: string,
  appId: string | null,
  codeSessionId: string | null,
  relPath: string,
): Promise<{ bytes: Uint8Array; path: string } | null> {
  const rel = safeRelative(relPath);
  if (!rel) return null;
  const appRoot = workspaceRoot(userId, appId);
  const safe = (x: string) => x.replace(/[^a-zA-Z0-9_-]/g, "_");
  const roots = appId && codeSessionId
    ? [`${appRoot}/.worktrees/${safe(codeSessionId)}`, appRoot]
    : [appRoot];
  for (const root of roots) {
    try {
      const path = `${root}/${rel}`;
      return { bytes: await Deno.readFile(path), path };
    } catch { /* not under this root — try the next */ }
  }
  return null;
}
