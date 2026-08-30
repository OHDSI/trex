// Maps the Claude Agent SDK's built-in tool names/inputs onto the argument
// shapes devx's own tools use, so scope-key.ts's deriveScopeKey (which reads
// devx's field names — `path`, `command`, ...) derives the same action key
// for a sidecar call that it would for a native devx call. Pure: no I/O, no
// SDK import (the sidecar is the only thing that holds that dependency) — a
// minimal structural shape stands in below, sourced from
// @anthropic-ai/claude-agent-sdk@0.3.214's sdk-tools.d.ts (pinned by
// plugins/devx/fn-claude-code/package.json).

// FileReadInput/FileWriteInput/FileEditInput/GlobInput/GrepInput/BashInput
// per sdk-tools.d.ts. Field renames only — no execution semantics live here.
interface FieldRename {
  tool: string;
  fields: Record<string, string>;
}

// devx's own tool files (plugins/devx/agent/tools/*.ts) already use these
// exact SDK tool names, so `tool` is an identity map for all six; the value
// is entirely in renaming `input`. Verified against
// plugins/devx/functions/tools/{read_file,write_file,edit_file,list_files,grep,bash}.ts.
const TOOL_MAP: Record<string, FieldRename> = {
  // devx Read: { path, start_line?, end_line? }. SDK's offset/limit page
  // lines differently (limit = a count, not devx's inclusive end line), so
  // they are dropped rather than guessed at — only `path` renames cleanly.
  Read: { tool: "Read", fields: { file_path: "path" } },
  // devx Write: { path, content, description? }.
  Write: { tool: "Write", fields: { file_path: "path", content: "content" } },
  // devx Edit: { path, old_text, new_text }. devx has no `replace_all` (its
  // edit always requires a unique match), so that field is dropped.
  Edit: {
    tool: "Edit",
    fields: { file_path: "path", old_string: "old_text", new_string: "new_text" },
  },
  // devx Glob (list_files.ts) lists a directory; it has no glob-pattern
  // matching, so the SDK's `pattern` has no target — only `path` carries over.
  Glob: { tool: "Glob", fields: { path: "path" } },
  // devx Grep: { pattern, path?, include_glob?, max_results? }.
  Grep: { tool: "Grep", fields: { pattern: "pattern", path: "path", glob: "include_glob" } },
  // devx Bash: { command, description?, timeout? }. `timeout` is dropped:
  // the SDK's is milliseconds and devx's is seconds, and nothing on this
  // path (scopeAction, or the sidecar's own execution, which never calls
  // devx's bashTool) reads it, so guessing a conversion buys nothing.
  Bash: { tool: "Bash", fields: { command: "command", description: "description" } },
};

// Keeps only fields with an explicit target — an unrecognized extra SDK
// field can never leak into devx's shape under a name devx doesn't expect.
function rename(input: Record<string, unknown>, fields: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const from in fields) {
    if (input[from] !== undefined) out[fields[from]] = input[from];
  }
  return out;
}

// An unknown SDK tool name, or input that isn't a plain object, passes
// through unmapped rather than throwing. scope-key.ts's scopeAction returns
// "" (an empty action half) for a name/shape it doesn't recognize, which
// GATES rather than silently granting — the safe default for a tool this
// table hasn't been taught, matching the same defensive pattern scope-key.ts
// itself uses for malformed input.
export function toDevxToolInput(
  sdkToolName: string,
  input: Record<string, unknown>,
): { tool: string; input: Record<string, unknown> } {
  const entry = TOOL_MAP[sdkToolName];
  const obj = input && typeof input === "object" ? input : {};
  if (!entry) return { tool: sdkToolName, input: obj };
  return { tool: entry.tool, input: rename(obj, entry.fields) };
}
