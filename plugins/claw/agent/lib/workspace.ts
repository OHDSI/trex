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
