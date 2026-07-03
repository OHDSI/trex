import type { ToolDef, ToolProviderFn } from "./types.ts";

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

// H2: brands a dynamic tool source (agent-dir-root `dynamic-tools.ts`
// default export) the same way defineTool brands a static tools/*.ts file —
// loader.ts checks the __trexToolProvider brand before trusting the default
// export as a ToolProviderFn. Object.assign on the function itself (not a
// wrapper) keeps `fn` callable as-is while adding the brand as an own
// enumerable property.
export function defineToolProvider(fn: ToolProviderFn): ToolProviderFn & { __trexToolProvider: true } {
  return Object.assign(fn, { __trexToolProvider: true as const });
}
