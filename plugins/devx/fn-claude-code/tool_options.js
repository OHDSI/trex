// The `tools` half of the SDK query options, split out of server.js so it can
// be tested — server.js itself needs a running SDK and an HTTP listener.
//
// `tools`, not `allowedTools`: per @anthropic-ai/claude-agent-sdk@0.3.214's own
// types, `allowedTools` is the AUTO-APPROVE list, so setting it would waive
// canUseTool for exactly the tools we want gated. `[]` means literally no
// built-ins; an UNDECLARED allowlist must leave the default preset alone. A
// truthiness test here (`allowedTools?.length`) collapses those two into one
// and hands a declared-nothing session the whole preset.
export function toolsOption(allowedTools) {
  return Array.isArray(allowedTools) ? { tools: allowedTools } : {};
}
