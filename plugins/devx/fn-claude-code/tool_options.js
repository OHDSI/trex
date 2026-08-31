// The `tools` half of the SDK query options, split out of server.js so it can
// be tested. `tools`, not `allowedTools`: per the SDK's own types the latter is
// the AUTO-APPROVE list and would waive canUseTool for the very tools we gate.
// `[]` means no built-ins, an UNDECLARED allowlist means leave the preset
// alone — a truthiness test collapses the two and hands over the whole preset.
export function toolsOption(allowedTools) {
  return Array.isArray(allowedTools) ? { tools: allowedTools } : {};
}
