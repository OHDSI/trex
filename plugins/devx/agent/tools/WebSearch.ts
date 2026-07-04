// Batch B (task-v2-brief.md): thin wrapper over the legacy devx webSearchTool.
// Internals live in functions/tools/web_search.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { webSearchTool } from "../../functions/tools/web_search.ts";

export default wrap({
  description: webSearchTool.description,
  schema: webSearchTool.parameters,
  execute: webSearchTool.execute,
  modifiesState: webSearchTool.modifiesState,
  defaultConsent: webSearchTool.defaultConsent,
});
