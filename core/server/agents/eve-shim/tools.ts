import type { ToolDef } from "./types.ts";

export function defineTool(def: ToolDef): ToolDef & { __trexTool: true } {
  if (!def.description) throw new Error("defineTool: description is required");
  if (!def.inputSchema) throw new Error("defineTool: inputSchema is required");
  // A tool must be executable server-side unless it is a client-only tool
  // (call forwarded to the frontend) — needsApproval tools still execute
  // after approval, so they DO require execute.
  if (!def.execute && !def.clientOnly) {
    throw new Error(`defineTool: execute is required unless clientOnly`);
  }
  return Object.assign({}, def, { __trexTool: true as const });
}
