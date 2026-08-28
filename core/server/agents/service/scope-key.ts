// Scope keys narrow a sticky tool consent from "this tool, forever" to "this
// tool, for this action". Pure by contract: an agents worker derives these with
// no workspace mounted, so no filesystem access and no symlink resolution.
const PATH_TOOLS = new Set(["Write", "Edit", "DeleteFile", "SearchReplace"]);
const PAIR_TOOLS = new Set(["CopyFile", "RenameFile"]);

// Leading ".." segments are PRESERVED on a relative path: collapsing "../a.ts"
// to "a.ts" would let a grant for one cover the other.
export function normalizePath(p: string): string {
  const absolute = p.startsWith("/");
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(seg);
  }
  return (absolute ? "/" : "") + out.join("/");
}

// `FOO=1 npm test` is one command with an env prefix, not a call to `FOO=1`.
export function bashExecutable(command: string): string {
  const tokens = command.trim().split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
  const first = tokens[i] ?? "";
  if (!first) return "";
  return first.slice(first.lastIndexOf("/") + 1).toLowerCase();
}

export function deriveScopeKey(toolName: string, input: unknown): string {
  const obj = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (toolName === "Bash") {
    return typeof obj.command === "string" ? bashExecutable(obj.command) : "";
  }
  if (PATH_TOOLS.has(toolName)) {
    return typeof obj.path === "string" ? normalizePath(obj.path) : "";
  }
  if (PAIR_TOOLS.has(toolName)) {
    if (typeof obj.source !== "string" || typeof obj.destination !== "string") return "";
    // JSON, not a space join: spaces are legal in POSIX paths, so ("a b","c")
    // and ("a","b c") would otherwise collapse onto one key.
    return JSON.stringify([normalizePath(obj.source), normalizePath(obj.destination)]);
  }
  return "";
}
