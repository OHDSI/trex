// Re-export of the same wrapper tool defined for the top-level devx agent —
// see plugins/devx/agent/tools/Grep.ts. Presence in this tools/ dir IS the
// allow-list entry: the loader takes filename = tool name, and
// functions/skills/sync.ts derives devx.agents.allowed_tools from these names.
export { default } from "../../../tools/Grep.ts";
