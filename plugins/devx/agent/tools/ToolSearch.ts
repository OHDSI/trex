// Batch B (task-v2-brief.md): thin wrapper over the legacy devx toolSearchTool.
// Internals live in functions/tools/tool_search.ts — imported, never copied.
//
// Circular-import note: tool_search.ts imports registry.ts (to search
// TOOL_DEFINITIONS) and registry.ts imports tool_search.ts (to register
// toolSearchTool) — a genuine cycle already present in the legacy code.
// In production this only ever resolves in one direction because
// registry.ts is always the first module entered (the AI-SDK loop's single
// aggregator). Any consumer that enters via tool_search.ts FIRST instead
// (as this wrapper naturally would, being named after and importing that
// file directly) flips the evaluation order and hits a TDZ ReferenceError
// on registry.ts's `TOOL_DEFINITIONS` array literal (which references the
// not-yet-initialized `toolSearchTool` binding). Importing registry.ts here
// first, for its module-evaluation side effect only, reproduces the
// production order and avoids the crash.
import "../../functions/tools/registry.ts";
import { wrap } from "../lib/context.ts";
import { toolSearchTool } from "../../functions/tools/tool_search.ts";

export default wrap({
  description: toolSearchTool.description,
  schema: toolSearchTool.parameters,
  execute: toolSearchTool.execute,
  modifiesState: toolSearchTool.modifiesState,
  defaultConsent: toolSearchTool.defaultConsent,
});
